/**
 * UAT Chat Agent — Reactive Conversation with Publish Flow
 *
 * Persona: Marco Bellini (brand designer, Bologna).
 * Follows the journey: first_visit → draft_ready → register → active_fresh
 */

import Database from "better-sqlite3";

const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3001";
const DB_PATH = "db/openself.db";
const INVITE_CODE = "code1";
const LANGUAGE = "it";
const DELAY_MS = 60_000; // 1 minuto tra messaggi (evita rate limit Anthropic)
const MAX_MESSAGES = 50;
const MAX_RETRIES = 2;

// ── Marco's info pool ───────────────────────────────────────────────────────
// Consumed once per topic. Order matters — first item is used first.

const INFO = {
  name: ["Mi chiamo Marco Bellini, ho 35 anni e vivo a Bologna."],
  work: [
    "Sono un brand designer e direttore creativo freelance. Ho il mio studio, Studio Forma, con due collaboratori Anna e Luca. Lavoro nel design da 8 anni, specializzato in branding e identita visiva per startup tech.",
  ],
  projects: [
    "I miei clienti piu importanti sono Velasca, Tannico e Satispay. Ho curato il rebranding completo di Velasca nel 2022. Ho anche collaborato con Google Italia per un evento di design a Milano.",
  ],
  tools: [
    "Uso principalmente Figma e Affinity Designer. Per le animazioni After Effects, e sto sperimentando con Blender per il 3D.",
  ],
  education: [
    "Ho studiato al Politecnico di Milano, laurea in Design della Comunicazione.",
  ],
  hobbies: [
    "Mi piace fare escursionismo sugli Appennini. Suono la chitarra, jazz e blues. Ho un cane, Pixel, un border collie di 3 anni. Sono appassionato di fotografia analogica con la mia Leica M6 del nonno.",
  ],
  social: [
    "Ho un canale YouTube 'Design con Marco' con 18.000 iscritti, tutorial di design. Instagram: @marco.bellini.design, LinkedIn: linkedin.com/in/marcobellini",
  ],
  awards: [
    "Ho vinto il premio ADI Design Index nel 2024, packaging sostenibile. Ho pubblicato un articolo su Domus magazine. Ho anche un mini-ebook sul design sostenibile su Gumroad.",
  ],
  teaching: [
    "Tengo workshop di branding all'Accademia di Belle Arti di Bologna. Faccio mentoring con ADI Giovani.",
  ],
  languages: ["Parlo italiano, inglese fluente e un po' di spagnolo."],
  contact: ["La mia email e marco@studioforma.design"],
  style: [
    "Mi piace uno stile minimale ma caldo, bordeaux scuro e beige caldo. Layout tipo magazine, tanto spazio bianco.",
  ],
  volunteer: ["Faccio volontariato con Emergency a Bologna, una volta al mese."],

  // Post-publish corrections (Phase 2)
  corrections: [
    "Ah, una correzione: il mio studio prima si chiamava 'Bellini Design Studio', ora e 'Studio Forma'.",
    "Non uso piu Illustrator, faccio quasi tutto su Figma e Affinity Designer.",
    "Il premio ADI era 2024, non 2023.",
  ],
  deletions: [
    "Sai, avevo menzionato un podcast 'Forma e Funzione'? L'ho chiuso, cancellalo se c'e.",
  ],
  additions: [
    "Vorrei aggiungere una citazione: 'Il buon design e il minimo design possibile' di Dieter Rams.",
    "Ho in programma un corso su Domestika ma e ancora in pianificazione, non metterlo.",
  ],
  pageFeedback: [
    "Potresti mettere in evidenza i premi? Sono importanti per i clienti.",
    "La sezione progetti la vorrei piu visibile, e il mio biglietto da visita.",
    "Vorrei una sezione 'Chi sono' che racconti la mia storia.",
  ],
};

// Topic detection from agent's text
const DETECTORS = [
  { topic: "name", re: /come ti chiami|il tuo nome|chi sei|presentati|iniziamo|basi/i },
  { topic: "work", re: /cosa fai|lavoro|professione|occupazione|mestiere|ruolo/i },
  { topic: "projects", re: /clienti|progett[oi]|portfolio|orgoglioso|lavori.+importanti/i },
  { topic: "tools", re: /strumenti|tool|software|programm|usi per|competenz/i },
  { topic: "education", re: /studi|formazione|universit|laurea|istruzione|scuola|percorso/i },
  { topic: "hobbies", re: /hobby|tempo libero|passioni?|interessi|fuori.+lavoro|sport|personale|appassiona/i },
  { topic: "social", re: /social|instagram|linkedin|youtube|canale|online|seguirti|profili/i },
  { topic: "awards", re: /premi|riconosciment|pubblicazion|articol|ebook|scritto/i },
  { topic: "teaching", re: /insegn|workshop|mentor|corsi|didattica|formatore/i },
  { topic: "languages", re: /lingu[ae]|parl[aio]|inglese|spagnolo|internazional/i },
  { topic: "contact", re: /email|contatt|sito|website|telefono|raggiung/i },
  { topic: "style", re: /stile|colori?|font|layout|estetica|aspetto|visual|tema/i },
];

function detectTopic(text) {
  for (const { topic, re } of DETECTORS) {
    if (re.test(text)) return topic;
  }
  return null;
}

function consumeInfo(topic) {
  if (INFO[topic]?.length > 0) return INFO[topic].shift();
  return null;
}

// ── Conversation state machine ──────────────────────────────────────────────

const STATE = {
  phase: "onboarding", // onboarding | page_feedback | publish_gate | post_publish | closing
  agentAskedPublish: false,
  published: false,
  publishAttempted: false,
  genericIdx: 0,
};

const GENERIC = [
  "Si, certo!",
  "Ok, dimmi pure.",
  "Va bene!",
  "Perfetto, continuiamo.",
  "Si!",
];

function pickResponse(agentText, msgNum) {
  const topic = detectTopic(agentText);

  // ── Detect agent wants to publish ──
  if (/pubblicar|pubblica|publish|username|pronta per/i.test(agentText)) {
    STATE.agentAskedPublish = true;
  }

  // ── Phase: ONBOARDING (msgs 1-~10) ──
  if (STATE.phase === "onboarding") {
    // If agent proposes publish, accept and transition
    if (STATE.agentAskedPublish && msgNum >= 6) {
      STATE.phase = "publish_gate";
      return { text: "Si, pubblichiamo! Come username vorrei 'uat-marco-bellini'.", topic: "publish" };
    }

    // Respond to detected topic
    if (topic) {
      const answer = consumeInfo(topic);
      if (answer) return { text: answer, topic };
    }

    // Volunteer info the agent hasn't asked about yet (after msg 5)
    if (msgNum >= 5) {
      for (const vt of ["hobbies", "social", "awards", "teaching", "education", "volunteer", "languages"]) {
        const answer = consumeInfo(vt);
        if (answer) return { text: answer, topic: vt };
      }
    }

    // Generic
    const g = GENERIC[STATE.genericIdx % GENERIC.length];
    STATE.genericIdx++;
    return { text: g, topic: "generic" };
  }

  // ── Phase: PUBLISH GATE ──
  if (STATE.phase === "publish_gate") {
    if (!STATE.publishAttempted) {
      STATE.publishAttempted = true;
      return { text: "Si, registriamoci! Email: marco@studioforma.design, password: TestPassword123!", topic: "register" };
    }
    // After publish attempt, move to post_publish
    STATE.phase = "post_publish";
    return { text: "Perfetto! Ora che la pagina e online, vorrei fare qualche modifica.", topic: "transition" };
  }

  // ── Phase: POST PUBLISH ──
  if (STATE.phase === "post_publish") {
    // Corrections, additions, deletions, page feedback
    for (const pool of ["corrections", "pageFeedback", "additions", "deletions", "contact", "style"]) {
      const answer = consumeInfo(pool);
      if (answer) return { text: answer, topic: pool };
    }

    // Also try any remaining info
    for (const pool of Object.keys(INFO)) {
      const answer = consumeInfo(pool);
      if (answer) return { text: answer, topic: pool };
    }

    // Running out of things to say
    STATE.phase = "closing";
    return { text: "Grazie mille per l'aiuto! La pagina sta venendo benissimo.", topic: "closing" };
  }

  // ── Phase: CLOSING ──
  return { text: "Grazie, ci vediamo!", topic: "closing" };
}

// ── Network helpers ──────────────────────────────────────────────────────────

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
      body: JSON.stringify({ username, email: "marco@studioforma.design", password: "TestPassword123!" }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json();
    console.log(`  [REGISTER] ${res.status}: ${JSON.stringify(body)}`);
    // Return new session cookie if provided
    const newCookie = (res.headers.get("set-cookie") || "").match(/os_session=([^;]+)/);
    return { success: body.success, newSession: newCookie?.[1] || null };
  } catch (err) {
    console.log(`  [REGISTER] Error: ${err.message}`);
    return { success: false, newSession: null };
  }
}

function openDb() { return new Database(DB_PATH, { readonly: true }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────────────────────

const anomalies = [];

async function main() {
  console.log("============================================================");
  console.log("  UAT: Marco Bellini — Full Journey Test");
  console.log("============================================================\n");

  let sessionCookie = await getSession();
  console.log(`Session: ${sessionCookie.slice(0, 24)}...\n`);

  const history = [];
  let totalTools = 0;
  let errors = 0;

  const db0 = openDb();
  const factsBefore = db0.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
  db0.close();
  console.log(`Facts before: ${factsBefore}\n`);

  for (let i = 0; i < MAX_MESSAGES; i++) {
    const msgNum = i + 1;

    // ── Pick user message ──
    let userMsg, topicUsed;
    if (i === 0) {
      userMsg = "Ciao! Sono qui per creare la mia pagina personale.";
      topicUsed = "opener";
    } else {
      const lastAgent = history[history.length - 1]?.content || "";
      const pick = pickResponse(lastAgent, msgNum);
      userMsg = pick.text;
      topicUsed = pick.topic;
    }

    console.log(`\n== #${msgNum}/${MAX_MESSAGES} [${STATE.phase}/${topicUsed}] ==`);
    console.log(`MARCO: ${userMsg}`);

    history.push({ role: "user", content: userMsg });

    // ── Send ──
    const t0 = Date.now();
    const res = await chat(sessionCookie, history);
    const ms = Date.now() - t0;

    // ── Handle response ──
    if (res.status !== 200 || !res.text?.trim()) {
      const reason = res.status !== 200 ? `HTTP ${res.status}` : "empty response";
      console.log(`AGENT: (${reason})`);
      console.log(`  [${ms}ms | ${res.toolResults?.length || 0} tools]`);
      anomalies.push({ msg: msgNum, type: reason });
      errors++;
    } else {
      history.push({ role: "assistant", content: res.text });
      // Print reasoning if present
      if (res.reasoning) {
        console.log(`THINKING: ${res.reasoning.slice(0, 500)}`);
      }
      // Print agent response
      for (const line of res.text.split("\n").filter(Boolean)) {
        console.log(`AGENT: ${line.slice(0, 250)}`);
      }
      console.log(`  [${ms}ms | ${res.toolResults.length} tools | ${res.rawLen}B]`);
    }

    totalTools += res.toolResults?.length || 0;

    // ── Show tool executions ──
    for (const tr of (res.toolResults || [])) {
      const name = tr.toolName || "?";
      const argStr = tr.args ? JSON.stringify(tr.args).slice(0, 120) : "";
      console.log(`  -> ${name}(${argStr})`);
    }

    // ── Quality checks ──
    if (res.text) {
      if (/ho (aggiornato|creato|modificato|aggiunto|rimosso|salvato)/i.test(res.text) && (res.toolResults?.length || 0) === 0) {
        anomalies.push({ msg: msgNum, type: "UNBACKED_CLAIM" });
        console.log("  !! UNBACKED_CLAIM");
      }
      if (/non l'ho ancora eseguito/i.test(res.text)) {
        anomalies.push({ msg: msgNum, type: "NONSENSE" });
        console.log("  !! NONSENSE response");
      }
    }

    // ── Register when agent asks to publish ──
    if (STATE.phase === "publish_gate" && STATE.publishAttempted) {
      console.log("\n  >> Attempting registration...");
      const regResult = await doRegister(sessionCookie, "uat-marco-bellini");
      if (regResult.success && regResult.newSession) {
        sessionCookie = regResult.newSession;
        console.log(`  >> Registered! New session: ${sessionCookie.slice(0, 20)}...`);
        STATE.published = true;
      } else {
        console.log("  >> Registration failed, continuing with current session");
      }
    }

    // ── DB snapshot every 10 msgs ──
    if (msgNum % 10 === 0 || msgNum === MAX_MESSAGES) {
      const db = openDb();
      const fc = db.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
      const mc = db.prepare("SELECT COUNT(*) as c FROM messages").get().c;
      const pc = db.prepare("SELECT COUNT(*) as c FROM page").get().c;
      const recent = db.prepare("SELECT category, key, value FROM facts WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 8").all();
      console.log(`\n  === DB @ msg #${msgNum}: ${fc} facts (+${fc - factsBefore}), ${mc} msgs, ${pc} pages ===`);
      for (const f of recent) console.log(`    [${f.category}] ${f.key}: ${(f.value || "").slice(0, 70)}`);
      db.close();
    }

    // ── Stop if closing ──
    if (STATE.phase === "closing" && msgNum > 10) {
      console.log("\n  >> Conversation complete (all info exhausted).");
      break;
    }

    // ── Wait ──
    if (i < MAX_MESSAGES - 1) await sleep(DELAY_MS);
  }

  // ── Final report ──
  console.log("\n\n============================================================");
  console.log("  FINAL REPORT");
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

  const pages = db.prepare("SELECT id, config, updated_at FROM page ORDER BY updated_at DESC LIMIT 5").all();
  console.log(`\nPages: ${pages.length}`);
  for (const p of pages) {
    try { const c = JSON.parse(p.config); console.log(`  [${p.id}] ${c.sections?.length || 0} sections`); }
    catch { console.log(`  [${p.id}] unparseable`); }
  }

  db.close();

  console.log(`\nAnomalies (${anomalies.length}):`);
  for (const a of anomalies) console.log(`  #${a.msg} [${a.type}]`);
  console.log(`\nTotal tool executions: ${totalTools}`);
  console.log(`Errors: ${errors}`);

  const score = Math.max(0, 100 - errors * 10 - anomalies.length * 3);
  console.log(`Score: ${score}/100 ${score >= 80 ? "OK" : score >= 50 ? "NEEDS WORK" : "FAILING"}`);

  // Save
  const fs = await import("fs");
  fs.writeFileSync(`scripts/uat-report-${Date.now()}.json`, JSON.stringify({ anomalies, totalTools, errors, score, history }, null, 2));
  console.log("Report saved.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
