/**
 * UAT Chat Agent — Chiara Donati v2 (Full Journey + Fix Verification)
 *
 * Verifies:
 * - FIX-1: Clarification limit (agent stops re-asking after 2 attempts)
 * - FIX-2: Auto-publish after corrections (agent calls request_publish)
 * - BUG-6/7: Identity delete (no loop, no batch_facts)
 * - General quality: fact creation, no unbacked claims, no nonsense
 */

import Database from "better-sqlite3";

const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3000";
const DB_PATH = process.env.OPENSELF_DB_PATH || "db/openself.db";
const INVITE_CODE = "code1";
const LANGUAGE = "it";
const DELAY_MS = 60_000;
const UAT_USERNAME = `uat-chiara-${Date.now().toString(36)}`;
const MAX_MESSAGES = 40;
const MAX_RETRIES = 2;

// ── Chiara's info ────────────────────────────────────────────────────────────

const INFO = {
  name: ["Mi chiamo Chiara Donati, ho 29 anni e vivo a Firenze."],
  work: [
    "Sono una consulente di marketing digitale, lavoro come freelance da 4 anni. Mi occupo di strategie social media e content marketing per piccole imprese e startup italiane.",
  ],
  projects: [
    "Ho lavorato con Eataly per la strategia social toscana, con una startup di moda sostenibile 'Verde Moda' e con un'agenzia di viaggi locale 'Toscana Segreta'. Il progetto con Eataly e stato il piu grande, +40% engagement in 6 mesi.",
  ],
  tools: [
    "Uso Notion per organizzare tutto, Canva Pro per la grafica, e Buffer per la programmazione social. Per l'analytics Google Analytics e Meta Business Suite.",
  ],
  education: [
    "Ho studiato Economia e Marketing all'Universita di Firenze, laurea magistrale nel 2019.",
  ],
  hobbies: [
    "Amo cucinare, soprattutto la cucina toscana. Faccio yoga ogni mattina. Ho due gatti, Micio e Luna. Mi piace anche la ceramica, faccio un corso settimanale.",
  ],
  social: [
    "Instagram: @chiara.donati.marketing con 12.000 follower, LinkedIn: linkedin.com/in/chiaradonati. Ho un blog su Medium dove scrivo di marketing per freelance.",
  ],
  contact: ["La mia email e chiara@chiaradonati.it, il sito chiaradonati.it"],
};

// Post-publish phases
const IDENTITY_CHANGES = [
  "Sai che ti dico? Ho deciso di usare il mio nome completo: il mio vero nome e 'Chiara Maria Donati', aggiornalo per favore.",
];

const MULTI_DELETIONS = [
  "Alcune cose da correggere: non faccio piu yoga, ho smesso la ceramica e non cucino piu. Togli queste tre attivita per favore.",
];

const POST_PUBLISH_ADDITIONS = [
  "Vorrei aggiungere che ho vinto il premio 'Digital Women Italia 2025' nella categoria marketing.",
  "La sezione contatti la vorrei piu in evidenza, e importante per i clienti.",
];

// ── Topic detection ─────────────────────────────────────────────────────────

const DETECTORS = [
  { topic: "name", re: /come ti chiami|il tuo nome|chi sei|presentati|iniziamo|basi|raccontami/i },
  { topic: "work", re: /cosa fai|lavoro|professione|occupazione|mestiere|ruolo/i },
  { topic: "projects", re: /clienti|progett[oi]|portfolio|lavori.+importanti|orgoglio|soddisfatt|successo|campagna|caso/i },
  { topic: "tools", re: /strumenti|tool|software|programm|usi per|competenz/i },
  { topic: "education", re: /studi|formazione|universit|laurea|istruzione|scuola|percorso/i },
  { topic: "hobbies", re: /hobby|tempo libero|passioni?|interessi|fuori.+lavoro|sport|personale/i },
  { topic: "social", re: /social|instagram|linkedin|youtube|canale|online|seguirti|profili|blog/i },
  { topic: "contact", re: /email|contatt|sito|website|telefono|raggiung/i },
];

function detectTopic(text) {
  for (const { topic, re } of DETECTORS) if (re.test(text)) return topic;
  return null;
}

function consumeInfo(topic) {
  if (INFO[topic]?.length > 0) return INFO[topic].shift();
  return null;
}

// Shared project-topic regex — used for topic detection AND FIX-1 tracking
const PROJECT_RE = DETECTORS.find(d => d.topic === "projects").re;

/** Extract only question sentences from text (chunks ending with "?") */
function questionSentences(text) {
  return text.match(/[^.!?]*\?/g) ?? [];
}

/** Check if any question sentence matches a keyword regex */
function hasQuestionWith(text, re) {
  return questionSentences(text).some(s => re.test(s));
}

/**
 * Check if an agent message is asking for delete confirmation.
 * Message-level check: the FULL message must contain delete context
 * (anywhere) AND have a confirmation/proceed question sentence (anywhere).
 */
function isDeleteConfirmPrompt(text) {
  const hasDeleteContext = /elimin\w*|cancell\w*|rimuov\w*|toglie\w*|toglio|tolgo/i.test(text);
  const hasConfirmQuestion = hasQuestionWith(text, /conferm\w*|sicur\w*|proced\w*|vuoi/i);
  return hasDeleteContext && hasConfirmQuestion;
}

// ── Clarification tracking (FIX-1 verification) ────────────────────────────

const clarificationTracker = {
  // Track how many times the agent asks about the same topic
  askCounts: {},   // topic → count
  deflections: [], // [{msg, topic, deflectedWith}]

  recordAgentAsk(topic, msgNum) {
    this.askCounts[topic] = (this.askCounts[topic] || 0) + 1;
    return this.askCounts[topic];
  },

  recordDeflection(askedTopic, answeredWith, msgNum) {
    this.deflections.push({ msg: msgNum, asked: askedTopic, answeredWith });
  },
};

// ── State machine ───────────────────────────────────────────────────────────

const STATE = {
  phase: "onboarding",
  agentAskedPublish: false,
  published: false,
  publishAttempted: false,
  identityDone: false,
  multiDeleteDone: false,
  confirmPending: false,
  genericIdx: 0,
  // FIX-1: Track what the agent keeps asking about
  lastAgentQuestion: null,
  projectAskCount: 0,
  confirmsSent: 0,
  justConfirmedDelete: false,
};

const GENERIC = ["Si, certo!", "Ok, dimmi pure.", "Va bene!", "Perfetto!", "Si!"];

function pickResponse(agentText, msgNum) {
  const topic = detectTopic(agentText);

  if (/pubblicar|pubblica|publish|username|pronta per/i.test(agentText)) {
    STATE.agentAskedPublish = true;
  }

  // Track repeated project QUESTIONS only (FIX-1 verification)
  // Uses shared PROJECT_RE + questionSentences — only counts questions, not acknowledgments
  // No phase gate: 2-STRIKE rule applies everywhere (consistent with shared-rules.ts)
  if (hasQuestionWith(agentText, PROJECT_RE)) {
    STATE.projectAskCount++;
    STATE.lastAgentQuestion = "projects";
  }

  // ── ONBOARDING ──
  if (STATE.phase === "onboarding") {
    if (STATE.agentAskedPublish && msgNum >= 6) {
      STATE.phase = "publish_gate";
      return { text: `Si, pubblichiamo! Come username vorrei '${UAT_USERNAME}'.`, topic: "publish" };
    }

    // FIX-1 TEST: When agent asks about projects, deliberately deflect
    // with a different topic to test the 2-ask limit
    if (STATE.lastAgentQuestion === "projects" && STATE.projectAskCount <= 2) {
      STATE.lastAgentQuestion = null; // reset for next detection
      // Deflect with other info instead of answering about projects
      for (const vt of ["hobbies", "social", "education", "tools", "contact"]) {
        const answer = consumeInfo(vt);
        if (answer) {
          clarificationTracker.recordDeflection("projects", vt, msgNum);
          return { text: answer, topic: vt };
        }
      }
    }

    // If agent asked about projects 3+ times, THEN answer (this should NOT happen with the fix)
    if (STATE.lastAgentQuestion === "projects" && STATE.projectAskCount > 2) {
      STATE.lastAgentQuestion = null;
      const answer = consumeInfo("projects");
      if (answer) {
        console.log(`  !! FIX-1 FAIL: Agent asked about projects ${STATE.projectAskCount} times (limit is 2)`);
        return { text: answer, topic: "projects_late" };
      }
    }

    // Normal topic response
    if (topic && topic !== "projects") {
      const answer = consumeInfo(topic);
      if (answer) return { text: answer, topic };
    }

    // Volunteer info
    if (msgNum >= 5) {
      for (const vt of ["hobbies", "social", "education", "tools", "contact"]) {
        const answer = consumeInfo(vt);
        if (answer) return { text: answer, topic: vt };
      }
    }

    // Answer projects if asked directly via topic detection (not tracked as re-ask)
    if (topic === "projects") {
      const answer = consumeInfo("projects");
      if (answer) return { text: answer, topic: "projects" };
    }

    return { text: GENERIC[STATE.genericIdx++ % GENERIC.length], topic: "generic" };
  }

  // ── PUBLISH GATE ──
  if (STATE.phase === "publish_gate") {
    if (!STATE.publishAttempted) {
      STATE.publishAttempted = true;
      return { text: "Si, registriamoci! Email: chiara@chiaradonati.it, password: TestPassword123!", topic: "register" };
    }
    STATE.phase = "identity_change";
    return { text: "Perfetto! Ora ho alcune modifiche importanti da fare.", topic: "transition" };
  }

  // ── IDENTITY CHANGE ──
  if (STATE.phase === "identity_change") {
    if (IDENTITY_CHANGES.length > 0) {
      return { text: IDENTITY_CHANGES.shift(), topic: "identity_change" };
    }
    STATE.identityDone = true;
    STATE.phase = "multi_delete";
    return { text: "Ok grazie! Ora ho anche altre correzioni...", topic: "transition" };
  }

  // ── MULTI DELETE ──
  if (STATE.phase === "multi_delete") {
    if (MULTI_DELETIONS.length > 0) {
      return { text: MULTI_DELETIONS.shift(), topic: "multi_delete" };
    }
    // After 1 confirmation sent, advance regardless
    if (STATE.confirmsSent > 0) {
      STATE.multiDeleteDone = true;
      STATE.phase = "post_publish_add";
      return { text: "Perfetto, grazie!", topic: "transition" };
    }
    // Confirm if agent asks for delete confirmation
    if (isDeleteConfirmPrompt(agentText)) {
      STATE.confirmsSent++;
      STATE.justConfirmedDelete = true;
      STATE.confirmPending = false;
      return { text: "Si, confermo! Elimina tutte le attivita che ho detto.", topic: "confirm_delete" };
    }
    STATE.multiDeleteDone = true;
    STATE.phase = "post_publish_add";
    return { text: "Perfetto, grazie!", topic: "transition" };
  }

  // ── POST PUBLISH ADDITIONS ──
  if (STATE.phase === "post_publish_add") {
    if (POST_PUBLISH_ADDITIONS.length > 0) {
      return { text: POST_PUBLISH_ADDITIONS.shift(), topic: "post_publish" };
    }
    // Say "that's all" to trigger publish flow (FIX-2 test)
    STATE.phase = "expect_publish";
    return { text: "Basta cosi, grazie! Pubblica le modifiche.", topic: "request_publish" };
  }

  // ── EXPECT PUBLISH (FIX-2 test) ──
  if (STATE.phase === "expect_publish") {
    STATE.phase = "closing";
    return { text: "Grazie mille! La pagina e perfetta.", topic: "closing" };
  }

  return { text: "Grazie, ci vediamo!", topic: "closing" };
}

// ── Network helpers ─────────────────────────────────────────────────────────

function parseDataStream(raw) {
  const lines = raw.split("\n").filter(Boolean);
  let text = "";
  let reasoning = "";
  const toolResults = [];
  let error = null;
  for (const line of lines) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const prefix = line.slice(0, ci);
    const payload = line.slice(ci + 1);
    try {
      if (prefix === "0") text += JSON.parse(payload);
      else if (prefix === "g") reasoning += JSON.parse(payload);
      else if (prefix === "9") toolResults.push(JSON.parse(payload));
      else if (prefix === "e") error = JSON.parse(payload);
    } catch { /* skip */ }
  }
  return { text, reasoning, toolResults, error };
}

async function getSession() {
  const res = await fetch(`${BASE_URL}/api/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: INVITE_CODE }),
  });
  if (!res.ok) throw new Error(`Invite failed: ${res.status}`);
  const cookie = (res.headers.get("set-cookie") || "").match(/os_session=([^;]+)/);
  if (!cookie) throw new Error("No session cookie");
  return cookie[1];
}

async function chat(sessionCookie, history) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": `os_session=${sessionCookie}` },
        body: JSON.stringify({ messages: history, language: LANGUAGE }),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.status === 500 && attempt < MAX_RETRIES) {
        console.log(`    [retry ${attempt + 1}] 500 error, waiting 45s...`);
        await new Promise(r => setTimeout(r, 45_000));
        continue;
      }
      if (!res.ok) return { status: res.status, text: "", toolResults: [], error: await res.text() };
      const raw = await res.text();
      return { status: res.status, ...parseDataStream(raw), rawLen: raw.length };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.log(`    [retry ${attempt + 1}] ${err.message}, waiting 45s...`);
        await new Promise(r => setTimeout(r, 45_000));
        continue;
      }
      return { status: 0, text: "", toolResults: [], error: err.message };
    }
  }
}

async function doRegister(sessionCookie, username) {
  try {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `os_session=${sessionCookie}` },
      body: JSON.stringify({ username, email: "chiara@chiaradonati.it", password: "TestPassword123!" }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json();
    console.log(`  [REGISTER] ${res.status}: ${JSON.stringify(body)}`);
    const newCookie = (res.headers.get("set-cookie") || "").match(/os_session=([^;]+)/);
    return { success: body.success, newSession: newCookie?.[1] || null };
  } catch (err) {
    console.log(`  [REGISTER] Error: ${err.message}`);
    return { success: false, newSession: null };
  }
}

function openDb() { return new Database(DB_PATH, { readonly: true }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Anomaly checks ──────────────────────────────────────────────────────────

function checkAnomalies(res, msgNum, anomalies) {
  const text = res.text || "";
  const tools = res.toolResults || [];

  // BUG-7: batch_facts for identity delete (correct schema: args.operations)
  for (const tr of tools) {
    const ops = tr.toolName === "batch_facts" ? (tr.args?.operations || []) : [];
    const idDeletes = ops.filter(op => op.action === "delete" && op.factId?.startsWith("identity/"));
    if (idDeletes.length > 0) {
      anomalies.push({ msg: msgNum, type: "BUG-7_BATCH_IDENTITY_DELETE" });
      console.log("  !! BUG-7: batch_facts used for identity delete!");
    }
  }

  // BUG-6: Agent asks for delete confirmation AFTER user already confirmed
  if (STATE.justConfirmedDelete) {
    STATE.justConfirmedDelete = false; // consume the one-turn flag
    if (isDeleteConfirmPrompt(text)) {
      anomalies.push({ msg: msgNum, type: "BUG-6_DELETE_CONFIRM_LOOP" });
      console.log("  !! BUG-6: Agent re-asked for delete confirmation after user confirmed!");
    }
  }

  // Unbacked claim
  if (/ho (aggiornato|creato|modificato|aggiunto|rimosso|salvato|eliminat)/i.test(text) && tools.length === 0) {
    anomalies.push({ msg: msgNum, type: "UNBACKED_CLAIM" });
    console.log("  !! UNBACKED_CLAIM");
  }

  // Nonsense
  if (/non l'ho ancora eseguito/i.test(text)) {
    anomalies.push({ msg: msgNum, type: "NONSENSE" });
    console.log("  !! NONSENSE response");
  }

  // FIX-2: Check if agent called request_publish after user said "pubblica le modifiche"
  if (STATE.phase === "expect_publish" || STATE.phase === "closing") {
    const hasPublish = tools.some(tr => tr.toolName === "request_publish");
    if (hasPublish) {
      console.log("  >> FIX-2 PASS: Agent called request_publish after corrections!");
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const anomalies = [];

async function main() {
  console.log("============================================================");
  console.log("  UAT: Chiara Donati v2 — Full Journey + Fix Verification");
  console.log("  Verifies: FIX-1 (clarification limit), FIX-2 (auto-publish)");
  console.log("  Also: BUG-6, BUG-7, general quality");
  console.log("============================================================\n");

  let sessionCookie = await getSession();
  console.log(`Session: ${sessionCookie.slice(0, 24)}...\n`);

  const history = [];
  let totalTools = 0;
  let errors = 0;
  let requestPublishCalled = false;

  const db0 = openDb();
  const factsBefore = db0.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
  db0.close();
  console.log(`Facts before: ${factsBefore}\n`);

  for (let i = 0; i < MAX_MESSAGES; i++) {
    const msgNum = i + 1;

    let userMsg, topicUsed;
    if (i === 0) {
      userMsg = "Ciao! Vorrei creare la mia pagina personale.";
      topicUsed = "opener";
    } else {
      const lastAgent = history[history.length - 1]?.content || "";
      const pick = pickResponse(lastAgent, msgNum);
      userMsg = pick.text;
      topicUsed = pick.topic;
    }

    console.log(`\n== #${msgNum}/${MAX_MESSAGES} [${STATE.phase}/${topicUsed}] ==`);
    console.log(`CHIARA: ${userMsg}`);

    history.push({ role: "user", content: userMsg });

    const t0 = Date.now();
    const res = await chat(sessionCookie, history);
    const ms = Date.now() - t0;

    if (res.status !== 200 || !res.text?.trim()) {
      const reason = res.status !== 200 ? `HTTP ${res.status}` : "empty response";
      console.log(`AGENT: (${reason})`);
      anomalies.push({ msg: msgNum, type: reason });
      errors++;
    } else {
      history.push({ role: "assistant", content: res.text });
      if (res.reasoning) {
        console.log(`THINKING: ${res.reasoning.slice(0, 800)}`);
      }
      for (const line of res.text.split("\n").filter(Boolean)) {
        console.log(`AGENT: ${line.slice(0, 300)}`);
      }
      console.log(`  [${ms}ms | ${res.toolResults.length} tools | ${res.rawLen}B]`);
    }

    totalTools += res.toolResults?.length || 0;

    // Show tool executions
    for (const tr of (res.toolResults || [])) {
      const name = tr.toolName || "?";
      const argStr = tr.args ? JSON.stringify(tr.args).slice(0, 200) : "";
      const resultStr = typeof tr.result === "string" ? tr.result.slice(0, 150) : "";
      console.log(`  -> ${name}(${argStr})`);
      if (resultStr) console.log(`     = ${resultStr}`);

      // Track request_publish
      if (name === "request_publish") {
        requestPublishCalled = true;
        console.log("  >> request_publish CALLED");
      }
    }

    // Anomaly checks
    checkAnomalies(res, msgNum, anomalies);

    // Register when agent asks to publish
    if (STATE.phase === "publish_gate" && STATE.publishAttempted) {
      console.log("\n  >> Attempting registration...");
      const regResult = await doRegister(sessionCookie, UAT_USERNAME);
      if (regResult.success && regResult.newSession) {
        sessionCookie = regResult.newSession;
        console.log(`  >> Registered! New session: ${sessionCookie.slice(0, 20)}...`);
        STATE.published = true;
      }
    }

    // DB snapshot every 5 msgs
    if (msgNum % 5 === 0 || msgNum === MAX_MESSAGES) {
      try {
        const db = openDb();
        const fc = db.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
        const mc = db.prepare("SELECT COUNT(*) as c FROM messages").get().c;
        const ac = db.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NOT NULL").get().c;
        const recent = db.prepare("SELECT category, key, value FROM facts WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 8").all();
        console.log(`\n  === DB @ msg #${msgNum}: ${fc} facts (+${fc - factsBefore}), ${ac} archived, ${mc} msgs ===`);
        for (const f of recent) console.log(`    [${f.category}] ${f.key}: ${(f.value || "").slice(0, 80)}`);
        db.close();
      } catch (e) { console.log(`  DB error: ${e.message}`); }
    }

    // Stop if closing
    if (STATE.phase === "closing" && msgNum > 10) {
      console.log("\n  >> Conversation complete.");
      break;
    }

    if (i < MAX_MESSAGES - 1) await sleep(DELAY_MS);
  }

  // ── Final report ──
  console.log("\n\n============================================================");
  console.log("  FINAL REPORT — Chiara Donati v2");
  console.log("============================================================\n");

  const db = openDb();
  const allFacts = db.prepare("SELECT * FROM facts ORDER BY created_at DESC").all();
  const active = allFacts.filter(f => !f.archived_at);
  const archived = allFacts.filter(f => !!f.archived_at);

  console.log(`Facts: ${active.length} active (+${active.length - factsBefore} new), ${archived.length} archived`);

  const cats = {};
  for (const f of active) cats[f.category] = (cats[f.category] || 0) + 1;
  console.log("By category:");
  for (const [k, v] of Object.entries(cats).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  const identityFacts = active.filter(f => f.category === "identity");
  console.log(`\nIdentity facts (${identityFacts.length}):`);
  for (const f of identityFacts) console.log(`  ${f.key}: ${f.value}`);

  const pages = db.prepare("SELECT id, config, updated_at FROM page ORDER BY updated_at DESC LIMIT 5").all();
  console.log(`\nPages: ${pages.length}`);
  for (const p of pages) {
    try { const c = JSON.parse(p.config); console.log(`  [${p.id}] ${c.sections?.length || 0} sections`); }
    catch { console.log(`  [${p.id}] unparseable`); }
  }
  db.close();

  // ── Fix verification ──
  console.log("\n--- FIX VERIFICATION ---");

  // FIX-1: Clarification limit
  const projectAsks = STATE.projectAskCount;
  const fix1Pass = projectAsks <= 2;
  console.log(`FIX-1 (clarification limit):    Agent asked about projects ${projectAsks} times — ${fix1Pass ? "PASS (≤2)" : "FAIL (>2)"}`);
  if (clarificationTracker.deflections.length > 0) {
    console.log("  Deflections:");
    for (const d of clarificationTracker.deflections) {
      console.log(`    msg #${d.msg}: asked "${d.asked}", user answered "${d.answeredWith}"`);
    }
  }

  // FIX-2: Auto-publish
  const fix2Pass = requestPublishCalled;
  console.log(`FIX-2 (auto-publish):           ${fix2Pass ? "PASS — request_publish was called" : "FAIL — request_publish was NOT called"}`);

  // BATCH DELETE VERIFICATION: Check that yoga, ceramica, cucina-toscana were actually deleted
  const db2 = openDb();
  const staleKeys = ["yoga", "ceramica", "cucina-toscana"];
  const surviving = db2.prepare(
    `SELECT key FROM facts WHERE key IN (${staleKeys.map(() => "?").join(",")}) AND archived_at IS NULL`
  ).all(...staleKeys);
  db2.close();
  const batchDeletePass = surviving.length === 0;
  if (!batchDeletePass) {
    console.log(`BATCH DELETE:                   FAIL — ${surviving.map(s => s.key).join(", ")} still in DB`);
    anomalies.push({ msg: 0, type: "BATCH_DELETE_FAIL" });
  } else {
    console.log(`BATCH DELETE:                   PASS — all 3 facts removed`);
  }

  // Bug checks
  const bug6 = anomalies.filter(a => a.type === "BUG-6_DELETE_CONFIRM_LOOP");
  const bug7 = anomalies.filter(a => a.type === "BUG-7_BATCH_IDENTITY_DELETE");
  const unbacked = anomalies.filter(a => a.type === "UNBACKED_CLAIM");
  const nonsense = anomalies.filter(a => a.type === "NONSENSE");
  const batchFail = anomalies.filter(a => a.type === "BATCH_DELETE_FAIL");

  console.log(`BUG-6 (delete confirm loop):    ${bug6.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`BUG-7 (batch identity):         ${bug7.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`Unbacked claims:                ${unbacked.length === 0 ? "PASS" : "WARN (" + unbacked.length + ")"}`);
  console.log(`Nonsense responses:             ${nonsense.length === 0 ? "PASS" : "FAIL (" + nonsense.length + ")"}`);

  console.log(`\nAll anomalies (${anomalies.length}):`);
  for (const a of anomalies) console.log(`  #${a.msg} [${a.type}]`);
  console.log(`Total tool executions: ${totalTools}`);
  console.log(`Errors: ${errors}`);

  const score = Math.max(0, 100
    - errors * 10
    - bug6.length * 20
    - bug7.length * 20
    - batchFail.length * 15
    - unbacked.length * 3
    - nonsense.length * 5
    - (fix1Pass ? 0 : 10)
    - (fix2Pass ? 0 : 10)
  );
  console.log(`\nScore: ${score}/100 ${score >= 80 ? "OK" : score >= 50 ? "NEEDS WORK" : "FAILING"}`);

  const fs = await import("fs");
  const reportPath = `/tmp/uat-chiara/report-v2-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify({
    anomalies, totalTools, errors, score,
    fix1: { projectAsks, pass: fix1Pass, deflections: clarificationTracker.deflections },
    fix2: { requestPublishCalled, pass: fix2Pass },
    identityFacts, history,
  }, null, 2));
  console.log(`Report saved: ${reportPath}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
