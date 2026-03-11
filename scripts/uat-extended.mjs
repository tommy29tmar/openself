/**
 * UAT Extended — Marco Rossetti (Two-Phase: Onboarding + Return)
 *
 * Phase 1: Full onboarding → publish → post-publish edits (active_fresh)
 * Phase 2: DB time-hack → return visit after "8 days" (active_stale)
 *
 * Tests:
 * - 2-STRIKE clarification rule (deflection during onboarding)
 * - auto-publish after corrections
 * - Batch delete (multi-delete)
 * - active_stale greeting (name + time acknowledgment)
 * - Fact CRUD across both phases
 * - No unbacked claims, no nonsense, no passive deferrals
 */

import Database from "better-sqlite3";

const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3000";
const DB_PATH = process.env.OPENSELF_DB_PATH || "db/openself.db";
const INVITE_CODE = "code1";
const LANGUAGE = "it";
const DELAY_MS = parseInt(process.env.UAT_DELAY_MS || "60000", 10);
const UAT_USERNAME = `uat-marco-${Date.now().toString(36)}`;
const MAX_RETRIES = 2;

// ── Marco's persona ─────────────────────────────────────────────────────────

const INFO = {
  name: ["Mi chiamo Marco Rossetti, ho 34 anni e vivo a Bologna."],
  work: [
    "Sono un fotografo freelance specializzato in reportage e ritratti. Lavoro con riviste, brand e privati da 7 anni.",
  ],
  projects: [
    "Ho fatto un reportage per National Geographic Italia sulla via Emilia, una campagna per Ducati e ho fotografato 3 matrimoni importanti quest'anno. Il progetto Ducati è stato il più grande, 6 mesi di lavoro.",
  ],
  tools: [
    "Uso una Canon R5, Lightroom e Photoshop per il post. Per il sito uso Squarespace e per i social Later per la programmazione.",
  ],
  education: [
    "Ho studiato all'Accademia di Belle Arti di Bologna, diploma in fotografia nel 2014.",
  ],
  hobbies: [
    "Mi piace il trekking in Appennino, cucino molto — soprattutto pasta fresca. Gioco a basket il mercoledì sera. Colleziono vinili.",
  ],
  social: [
    "Instagram: @marco.rossetti.photo con 28.000 follower, sito marcorossetti.it. Ho anche un canale YouTube con tutorial di fotografia.",
  ],
  contact: ["Email: marco@marcorossetti.it, telefono studio: 051-555-1234"],
};

// Phase 1 — post-publish edits
const IDENTITY_CHANGES = [
  "Ah, una cosa — il mio nome completo è 'Marco Alessandro Rossetti', aggiornalo per favore.",
];

const MULTI_DELETIONS = [
  "Senti, ho smesso di giocare a basket e non colleziono più vinili. Togli queste due cose.",
];

const POST_PUBLISH_ADDITIONS = [
  "Vorrei aggiungere che ho vinto il premio 'Young Italian Photographer 2025' al PhotoFestival di Arles.",
  "Aggiungi anche che faccio workshop di fotografia il sabato — 'Workshop Luce Naturale', 80 euro a persona.",
];

// Phase 2 — return visit updates
const RETURN_UPDATES = [
  "Ho una novità grossa: ho iniziato a collaborare stabilmente con Condé Nast Italia come fotografo contributore!",
  "Ah e ho iniziato a fare bouldering, mi sono iscritto a una palestra di arrampicata qui a Bologna.",
  "Il canale YouTube è cresciuto a 15.000 iscritti! Aggiorna il numero per favore.",
  "Sto lavorando a un libro fotografico sulla Bologna notturna, si chiama 'Bologna After Dark'. Aggiungilo ai progetti.",
];

// ── Topic detection (reused from v3) ────────────────────────────────────────

const DETECTORS = [
  { topic: "name", re: /come ti chiami|il tuo nome|chi sei|presentati|iniziamo|basi|raccontami/i },
  { topic: "work", re: /cosa fai|lavoro|professione|occupazione|mestiere|ruolo|fai nella vita/i },
  { topic: "projects", re: /clienti|progett[oi]|portfolio|lavori.+importanti|orgoglio|soddisfatt|successo|campagna|caso/i },
  { topic: "tools", re: /strumenti|tool|software|programm|usi per|competenz|attrezzatur/i },
  { topic: "education", re: /studi|formazione|universit|laurea|istruzione|scuola|percorso|accademia|diploma/i },
  { topic: "hobbies", re: /hobby|tempo libero|passioni?|interessi|fuori.+lavoro|sport|personale/i },
  { topic: "social", re: /social|instagram|linkedin|youtube|canale|online|seguirti|profili|blog/i },
  { topic: "contact", re: /email|contatt|sito|website|telefono|raggiung/i },
];

const PROJECT_RE = DETECTORS.find(d => d.topic === "projects").re;

function detectTopic(text) {
  for (const { topic, re } of DETECTORS) if (re.test(text)) return topic;
  return null;
}

function consumeInfo(topic) {
  if (INFO[topic]?.length > 0) return INFO[topic].shift();
  return null;
}

/** Extract only question sentences from text */
function questionSentences(text) {
  return text.match(/[^.!?]*\?/g) ?? [];
}

/** Check if any question sentence matches a keyword regex */
function hasQuestionWith(text, re) {
  return questionSentences(text).some(s => re.test(s));
}

/** Message-level delete confirmation check */
function isDeleteConfirmPrompt(text) {
  const hasDeleteContext = /elimin\w*|cancell\w*|rimuov\w*|toglie\w*|toglio|tolgo/i.test(text);
  const hasConfirmQuestion = hasQuestionWith(text, /conferm\w*|sicur\w*|proced\w*|vuoi/i);
  return hasDeleteContext && hasConfirmQuestion;
}

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
  lastAgentQuestion: null,
  projectAskCount: 0,
  confirmsSent: 0,
  justConfirmedDelete: false,
  // Phase 2 state
  returnUpdateIdx: 0,
  returnAskedAboutPage: false,
  returnPublishRequested: false,
};

const GENERIC = ["Si, certo!", "Ok, dimmi pure.", "Va bene!", "Perfetto!", "Si!"];

// ── Phase 1 response picker ─────────────────────────────────────────────────

function pickResponsePhase1(agentText, msgNum) {
  const topic = detectTopic(agentText);

  if (/pubblicar|pubblica|publish|username|pronta? per/i.test(agentText)) {
    STATE.agentAskedPublish = true;
  }

  // Track project QUESTIONS only (FIX-1 / 2-STRIKE)
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

    // FIX-1 TEST: deflect project questions
    if (STATE.lastAgentQuestion === "projects" && STATE.projectAskCount <= 2) {
      STATE.lastAgentQuestion = null;
      for (const vt of ["hobbies", "social", "education", "tools", "contact"]) {
        const answer = consumeInfo(vt);
        if (answer) return { text: answer, topic: vt };
      }
    }

    if (STATE.lastAgentQuestion === "projects" && STATE.projectAskCount > 2) {
      STATE.lastAgentQuestion = null;
      const answer = consumeInfo("projects");
      if (answer) {
        console.log(`  !! FIX-1 FAIL: Agent asked about projects ${STATE.projectAskCount} times (limit is 2)`);
        return { text: answer, topic: "projects_late" };
      }
    }

    if (topic && topic !== "projects") {
      const answer = consumeInfo(topic);
      if (answer) return { text: answer, topic };
    }

    if (msgNum >= 5) {
      for (const vt of ["hobbies", "social", "education", "tools", "contact"]) {
        const answer = consumeInfo(vt);
        if (answer) return { text: answer, topic: vt };
      }
    }

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
      return { text: "Si, registriamoci! Email: marco@marcorossetti.it, password: TestPassword123!", topic: "register" };
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
    if (STATE.confirmsSent > 0) {
      STATE.multiDeleteDone = true;
      STATE.phase = "post_publish_add";
      return { text: "Perfetto, grazie!", topic: "transition" };
    }
    if (isDeleteConfirmPrompt(agentText)) {
      STATE.confirmsSent++;
      STATE.justConfirmedDelete = true;
      STATE.confirmPending = false;
      return { text: "Si, confermo! Elimina tutto.", topic: "confirm_delete" };
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
    STATE.phase = "expect_publish_1";
    return { text: "Basta cosi per ora, pubblica le modifiche!", topic: "request_publish" };
  }

  // ── EXPECT PUBLISH (end of phase 1) ──
  if (STATE.phase === "expect_publish_1") {
    STATE.phase = "phase1_done";
    return { text: "Grazie! A presto.", topic: "phase1_closing" };
  }

  return { text: "Ok!", topic: "generic" };
}

// ── Phase 2 response picker (return visit) ──────────────────────────────────

function pickResponsePhase2(agentText, msgNum) {
  // Share life updates one by one
  if (STATE.phase === "return_updates") {
    if (STATE.returnUpdateIdx < RETURN_UPDATES.length) {
      return { text: RETURN_UPDATES[STATE.returnUpdateIdx++], topic: "return_update" };
    }
    // After all updates, ask about page quality
    if (!STATE.returnAskedAboutPage) {
      STATE.returnAskedAboutPage = true;
      STATE.phase = "return_question";
      return { text: "Come sta la mia pagina? Manca qualcosa secondo te?", topic: "return_question" };
    }
  }

  if (STATE.phase === "return_question") {
    STATE.phase = "return_publish";
    return { text: "Perfetto, aggiorna tutto e pubblica le modifiche. Grazie!", topic: "return_publish" };
  }

  if (STATE.phase === "return_publish") {
    STATE.phase = "closing";
    return { text: "Grazie mille! Alla prossima.", topic: "closing" };
  }

  // Fallback: if agent asks something, share next update
  if (STATE.returnUpdateIdx < RETURN_UPDATES.length) {
    return { text: RETURN_UPDATES[STATE.returnUpdateIdx++], topic: "return_update" };
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
      body: JSON.stringify({ username, email: "marco@marcorossetti.it", password: "TestPassword123!" }),
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

// ── Anomaly tracking ────────────────────────────────────────────────────────

const anomalies = [];
const phaseStats = { phase1: { msgs: 0, tools: 0, errors: 0 }, phase2: { msgs: 0, tools: 0, errors: 0 } };
let requestPublishCount = 0;

function checkAnomalies(res, msgNum, currentPhase) {
  const text = res.text || "";
  const tools = res.toolResults || [];

  // BUG-7: batch_facts for identity delete
  for (const tr of tools) {
    const ops = tr.toolName === "batch_facts" ? (tr.args?.operations || []) : [];
    const idDeletes = ops.filter(op => op.action === "delete" && op.factId?.startsWith("identity/"));
    if (idDeletes.length > 0) {
      anomalies.push({ msg: msgNum, phase: currentPhase, type: "BUG-7_BATCH_IDENTITY_DELETE" });
      console.log("  !! BUG-7: batch_facts used for identity delete!");
    }
  }

  // BUG-6: delete confirm loop
  if (STATE.justConfirmedDelete) {
    STATE.justConfirmedDelete = false;
    if (isDeleteConfirmPrompt(text)) {
      anomalies.push({ msg: msgNum, phase: currentPhase, type: "BUG-6_DELETE_CONFIRM_LOOP" });
      console.log("  !! BUG-6: Agent re-asked for delete confirmation after user confirmed!");
    }
  }

  // Unbacked claim
  if (/ho (aggiornato|creato|modificato|aggiunto|rimosso|salvato|eliminat)/i.test(text) && tools.length === 0) {
    anomalies.push({ msg: msgNum, phase: currentPhase, type: "UNBACKED_CLAIM" });
    console.log("  !! UNBACKED_CLAIM");
  }

  // Nonsense
  if (/non l'ho ancora eseguito/i.test(text)) {
    anomalies.push({ msg: msgNum, phase: currentPhase, type: "NONSENSE" });
    console.log("  !! NONSENSE response");
  }

  // Passive deferral
  if (/fammi sapere se|sentiti liber[oa]|sono qui se|c'è altro/i.test(text)) {
    anomalies.push({ msg: msgNum, phase: currentPhase, type: "PASSIVE_DEFERRAL" });
    console.log("  !! PASSIVE_DEFERRAL");
  }

  // Track request_publish
  const hasPublish = tools.some(tr => tr.toolName === "request_publish");
  if (hasPublish) {
    requestPublishCount++;
    console.log("  >> request_publish CALLED");
  }
}

// ── Conversation runner ─────────────────────────────────────────────────────

async function runConversation(sessionCookie, history, picker, maxMsgs, phaseLabel, startMsgNum) {
  const stats = phaseStats[phaseLabel] || { msgs: 0, tools: 0, errors: 0 };
  let globalMsgNum = startMsgNum;

  for (let i = 0; i < maxMsgs; i++) {
    globalMsgNum++;
    stats.msgs++;

    let userMsg, topicUsed;
    if (i === 0 && phaseLabel === "phase1") {
      userMsg = "Ciao! Vorrei creare la mia pagina personale.";
      topicUsed = "opener";
    } else if (i === 0 && phaseLabel === "phase2") {
      userMsg = "Ciao! Sono tornato, volevo aggiornare alcune cose sulla mia pagina.";
      topicUsed = "return_opener";
    } else {
      const lastAgent = history[history.length - 1]?.content || "";
      const pick = picker(lastAgent, globalMsgNum);
      userMsg = pick.text;
      topicUsed = pick.topic;
    }

    console.log(`\n== #${globalMsgNum} [${STATE.phase}/${topicUsed}] ==`);
    console.log(`MARCO: ${userMsg}`);

    history.push({ role: "user", content: userMsg });

    const t0 = Date.now();
    const res = await chat(sessionCookie, history);
    const ms = Date.now() - t0;

    if (res.status !== 200 || !res.text?.trim()) {
      const reason = res.status !== 200 ? `HTTP ${res.status}` : "empty response";
      console.log(`AGENT: (${reason})`);
      anomalies.push({ msg: globalMsgNum, phase: phaseLabel, type: reason });
      stats.errors++;
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

    stats.tools += res.toolResults?.length || 0;

    // Show tool executions
    for (const tr of (res.toolResults || [])) {
      const name = tr.toolName || "?";
      const argStr = tr.args ? JSON.stringify(tr.args).slice(0, 200) : "";
      const resultStr = typeof tr.result === "string" ? tr.result.slice(0, 150) : "";
      console.log(`  -> ${name}(${argStr})`);
      if (resultStr) console.log(`     = ${resultStr}`);
    }

    // Anomaly checks
    checkAnomalies(res, globalMsgNum, phaseLabel);

    // Register when agent asks to publish (phase 1 only)
    if (phaseLabel === "phase1" && STATE.phase === "publish_gate" && STATE.publishAttempted) {
      console.log("\n  >> Attempting registration...");
      const regResult = await doRegister(sessionCookie, UAT_USERNAME);
      if (regResult.success && regResult.newSession) {
        sessionCookie = regResult.newSession;
        console.log(`  >> Registered! New session: ${sessionCookie.slice(0, 20)}...`);
        STATE.published = true;
      }
    }

    // DB snapshot every 5 msgs
    if (globalMsgNum % 5 === 0) {
      try {
        const db = openDb();
        const fc = db.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
        const mc = db.prepare("SELECT COUNT(*) as c FROM messages").get().c;
        const ac = db.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NOT NULL").get().c;
        const recent = db.prepare("SELECT category, key, value FROM facts WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 6").all();
        console.log(`\n  === DB @ msg #${globalMsgNum}: ${fc} facts, ${ac} archived, ${mc} msgs ===`);
        for (const f of recent) console.log(`    [${f.category}] ${f.key}: ${(f.value || "").slice(0, 80)}`);
        db.close();
      } catch (e) { console.log(`  DB error: ${e.message}`); }
    }

    // Stop conditions
    if (STATE.phase === "phase1_done") {
      console.log("\n  >> Phase 1 complete.");
      break;
    }
    if (STATE.phase === "closing" && phaseLabel === "phase2" && i > 2) {
      console.log("\n  >> Phase 2 complete.");
      break;
    }

    if (i < maxMsgs - 1) await sleep(DELAY_MS);
  }

  return { sessionCookie, globalMsgNum };
}

// ── DB time-hack ────────────────────────────────────────────────────────────

function hackDbForStale() {
  console.log("\n================================================================");
  console.log("  DB TIME-HACK: Setting page.updated_at to 8 days ago");
  console.log("  This forces active_stale detection for Phase 2");
  console.log("================================================================\n");

  const db = new Database(DB_PATH);
  const before = db.prepare("SELECT id, status, updated_at FROM page").all();
  console.log("  Before:");
  for (const p of before) console.log(`    [${p.id}] status=${p.status} updated=${p.updated_at}`);

  db.exec(`UPDATE page SET updated_at = datetime('now', '-8 days') WHERE status = 'published'`);

  const after = db.prepare("SELECT id, status, updated_at FROM page").all();
  console.log("  After:");
  for (const p of after) console.log(`    [${p.id}] status=${p.status} updated=${p.updated_at}`);

  db.close();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("================================================================");
  console.log("  UAT Extended: Marco Rossetti — Two-Phase Journey");
  console.log("  Phase 1: Onboarding → Publish → Post-publish edits");
  console.log("  Phase 2: Return visit (active_stale, 8-day gap)");
  console.log(`  Username: ${UAT_USERNAME}`);
  console.log(`  Delay: ${DELAY_MS}ms between messages`);
  console.log("================================================================\n");

  let sessionCookie = await getSession();
  console.log(`Session: ${sessionCookie.slice(0, 24)}...\n`);

  const db0 = openDb();
  const factsBefore = db0.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
  db0.close();
  console.log(`Facts before: ${factsBefore}\n`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Onboarding + post-publish edits
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 1: Onboarding → Publish → Edits                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const history1 = [];
  const phase1Result = await runConversation(
    sessionCookie, history1, pickResponsePhase1, 25, "phase1", 0
  );
  sessionCookie = phase1Result.sessionCookie;

  // DB snapshot after phase 1
  const db1 = openDb();
  const factsAfterP1 = db1.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
  db1.close();
  console.log(`\n  Phase 1 done: ${factsAfterP1} active facts, ${phaseStats.phase1.msgs} messages, ${phaseStats.phase1.tools} tools\n`);

  // ═══════════════════════════════════════════════════════════════════════════
  // DB TIME-HACK: Force active_stale
  // ═══════════════════════════════════════════════════════════════════════════

  hackDbForStale();

  // Small pause to ensure DB writes settle
  await sleep(3000);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Return visit (active_stale)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 2: Return Visit (active_stale, 8-day gap)           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  STATE.phase = "return_updates";
  const history2 = []; // Fresh history — simulates new visit

  const phase2Result = await runConversation(
    sessionCookie, history2, pickResponsePhase2, 15, "phase2", phase1Result.globalMsgNum
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n\n================================================================");
  console.log("  FINAL REPORT — Marco Rossetti Extended UAT");
  console.log("================================================================\n");

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

  const pages = db.prepare("SELECT id, status, config, updated_at FROM page ORDER BY updated_at DESC LIMIT 5").all();
  console.log(`\nPages: ${pages.length}`);
  for (const p of pages) {
    try { const c = JSON.parse(p.config); console.log(`  [${p.id}] status=${p.status} sections=${c.sections?.length || 0}`); }
    catch { console.log(`  [${p.id}] status=${p.status} unparseable`); }
  }
  db.close();

  // ── Verifications ──

  console.log("\n--- PHASE 1 VERIFICATION ---");

  const fix1Pass = STATE.projectAskCount <= 2;
  console.log(`2-STRIKE (clarification):       Agent asked about projects ${STATE.projectAskCount} times — ${fix1Pass ? "PASS (≤2)" : "FAIL (>2)"}`);

  const publishPass = requestPublishCount >= 1;
  console.log(`Auto-publish:                   ${publishPass ? `PASS (${requestPublishCount} calls)` : "FAIL — request_publish was NOT called"}`);

  // Check batch delete — basket and vinili should be gone
  const db2 = openDb();
  const staleKeys = ["basket", "vinili", "pallacanestro"];
  const surviving = db2.prepare(
    `SELECT key FROM facts WHERE key IN (${staleKeys.map(() => "?").join(",")}) AND archived_at IS NULL`
  ).all(...staleKeys);
  db2.close();
  const batchDeletePass = surviving.length === 0;
  console.log(`Batch delete:                   ${batchDeletePass ? "PASS — deleted activities removed" : `FAIL — ${surviving.map(s => s.key).join(", ")} still in DB`}`);

  // Identity update: name should be "Marco Alessandro Rossetti"
  const nameCorrect = identityFacts.some(f => {
    try { return JSON.parse(f.value).full?.includes("Alessandro"); } catch { return false; }
  });
  console.log(`Identity update:                ${nameCorrect ? "PASS — name includes 'Alessandro'" : "FAIL — name not updated"}`);

  console.log("\n--- PHASE 2 VERIFICATION ---");

  // Check if agent used name in Phase 2 greeting
  const phase2FirstAgent = history2.find(m => m.role === "assistant")?.content || "";
  const usedName = /marco/i.test(phase2FirstAgent);
  console.log(`Stale greeting (used name):     ${usedName ? "PASS" : "FAIL — agent didn't use Marco's name"}`);

  const ackedTimeGap = /un po'|tempo|settiman|giorn|while|tornato|rivedert|bentornat/i.test(phase2FirstAgent);
  console.log(`Stale greeting (time ack):      ${ackedTimeGap ? "PASS" : "WARN — no time gap acknowledgment"}`);

  // Check if Phase 2 updates were saved (Condé Nast, bouldering, Bologna After Dark)
  const db3 = openDb();
  const phase2Facts = db3.prepare("SELECT category, key, value FROM facts WHERE archived_at IS NULL").all();
  db3.close();

  const allValues = phase2Facts.map(f => `${f.category} ${f.key} ${f.value}`).join(" ").toLowerCase();
  const condeNast = /cond[eé]\s*nast/i.test(allValues);
  const bouldering = /bouldering|arrampicata/i.test(allValues);
  const bolognaDark = /bologna.*dark|notturna/i.test(allValues);

  console.log(`Return: Condé Nast saved:       ${condeNast ? "PASS" : "FAIL"}`);
  console.log(`Return: Bouldering saved:       ${bouldering ? "PASS" : "FAIL"}`);
  console.log(`Return: Bologna After Dark:     ${bolognaDark ? "PASS" : "FAIL"}`);

  const phase2Publish = requestPublishCount >= 2;
  console.log(`Return: Re-publish called:      ${phase2Publish ? "PASS" : "WARN — only published once"}`);

  console.log("\n--- BUG CHECKS ---");

  const bug6 = anomalies.filter(a => a.type === "BUG-6_DELETE_CONFIRM_LOOP");
  const bug7 = anomalies.filter(a => a.type === "BUG-7_BATCH_IDENTITY_DELETE");
  const unbacked = anomalies.filter(a => a.type === "UNBACKED_CLAIM");
  const nonsense = anomalies.filter(a => a.type === "NONSENSE");
  const passive = anomalies.filter(a => a.type === "PASSIVE_DEFERRAL");
  const emptyResp = anomalies.filter(a => a.type === "empty response");

  console.log(`BUG-6 (delete confirm loop):    ${bug6.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`BUG-7 (batch identity):         ${bug7.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`Unbacked claims:                ${unbacked.length === 0 ? "PASS" : `WARN (${unbacked.length})`}`);
  console.log(`Nonsense responses:             ${nonsense.length === 0 ? "PASS" : `FAIL (${nonsense.length})`}`);
  console.log(`Passive deferrals:              ${passive.length === 0 ? "PASS" : `WARN (${passive.length})`}`);
  console.log(`Empty responses:                ${emptyResp.length === 0 ? "PASS" : `WARN (${emptyResp.length})`}`);

  console.log("\n--- STATS ---");
  console.log(`Phase 1: ${phaseStats.phase1.msgs} msgs, ${phaseStats.phase1.tools} tools, ${phaseStats.phase1.errors} errors`);
  console.log(`Phase 2: ${phaseStats.phase2.msgs} msgs, ${phaseStats.phase2.tools} tools, ${phaseStats.phase2.errors} errors`);
  console.log(`Total: ${phaseStats.phase1.msgs + phaseStats.phase2.msgs} msgs, ${phaseStats.phase1.tools + phaseStats.phase2.tools} tools`);

  console.log(`\nAll anomalies (${anomalies.length}):`);
  for (const a of anomalies) console.log(`  #${a.msg} [${a.phase}] ${a.type}`);

  const score = Math.max(0, 100
    - (phaseStats.phase1.errors + phaseStats.phase2.errors) * 5
    - bug6.length * 20
    - bug7.length * 20
    - unbacked.length * 3
    - nonsense.length * 5
    - passive.length * 2
    - (fix1Pass ? 0 : 10)
    - (publishPass ? 0 : 10)
    - (batchDeletePass ? 0 : 10)
    - (nameCorrect ? 0 : 5)
    - (usedName ? 0 : 5)
    - (condeNast ? 0 : 5)
    - (bouldering ? 0 : 5)
    - (bolognaDark ? 0 : 5)
  );
  console.log(`\nScore: ${score}/100 ${score >= 80 ? "OK" : score >= 50 ? "NEEDS WORK" : "FAILING"}`);

  // Save report
  const fs = await import("fs");
  const reportDir = "/tmp/uat-marco";
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = `${reportDir}/report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify({
    anomalies, score, requestPublishCount,
    phase1: { ...phaseStats.phase1, history: history1 },
    phase2: { ...phaseStats.phase2, history: history2 },
    verifications: { fix1Pass, publishPass, batchDeletePass, nameCorrect, usedName, ackedTimeGap, condeNast, bouldering, bolognaDark },
  }, null, 2));
  console.log(`Report saved: ${reportPath}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
