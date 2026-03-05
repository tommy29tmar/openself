#!/usr/bin/env node
/**
 * simulate-chat.mjs — Headless agent conversation simulator (50-turn)
 *
 * Creates a persona (Elena Ferraris), chats with the agent,
 * measures token budget per context block, and verifies DB state.
 *
 * Usage: node scripts/simulate-chat.mjs
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../db/openself.db");
const BASE_URL = "http://localhost:3000";
const LANGUAGE = "it";
const FETCH_TIMEOUT_MS = 120_000; // 2 min per turn (generate_page is slow)

// ── Persona: Elena Ferraris ──────────────────────────────────────
// 50 messages — progressive self-disclosure, responses to typical agent
// questions, corrections, style requests, and page generation.
const PERSONA_MESSAGES = [
  // --- Phase 1: Introduction (1-6) ---
  "Ciao! Mi chiamo Elena Ferraris, sono un'architetta paesaggista di Torino.",
  "Lavoro da 6 anni nello studio Verdecittà, dove progetto parchi urbani e giardini terapeutici.",
  "Ho studiato architettura al Politecnico di Torino e poi ho fatto un master in Landscape Architecture a Barcellona, alla UPC.",
  "I miei progetti più importanti? Il Parco della Biodiversità a Moncalieri e il Giardino Sensoriale dell'ospedale Regina Margherita.",
  "Parlo italiano, inglese fluente e un po' di spagnolo. Nel tempo libero faccio bouldering e coltivo piante carnivore.",
  "Genera la mia pagina per favore!",

  // --- Phase 2: Deeper work details (7-14) ---
  "Il Giardino Sensoriale è stato il progetto che mi ha cambiato la vita. Ho lavorato con terapisti occupazionali per un anno intero.",
  "A Verdecittà siamo un team di 12 persone. Io guido il reparto di progettazione biofilica.",
  "Prima di Verdecittà ho lavorato due anni come freelance, subito dopo il master. Facevo soprattutto piccoli giardini privati a Barcellona.",
  "Ho anche una certificazione LEED Green Associate, l'ho presa nel 2022.",
  "Il Parco della Biodiversità ha vinto il premio Urbanpromo Green nel 2024. Ne sono molto orgogliosa.",
  "Sto lavorando a un nuovo progetto: la riqualificazione del Parco Sempione a Milano. È ancora in fase preliminare.",
  "Ho una skill particolare: la modellazione 3D con Rhino e Grasshopper per il landscape design.",
  "Uso anche AutoCAD, SketchUp, e un po' di QGIS per le analisi territoriali.",

  // --- Phase 3: Personal life & interests (15-24) ---
  "Il bouldering lo faccio tre volte a settimana alla palestra Monkey Island di Torino. Sono al livello 6b.",
  "Le piante carnivore sono una passione da quando avevo 15 anni. Ho una collezione di circa 40 esemplari, soprattutto Nepenthes e Sarracenia.",
  "Leggo molto. Ultimamente ho finito 'L'architettura della felicità' di Alain de Botton — bellissimo.",
  "Un altro libro che mi ha influenzato molto è 'The Hidden Life of Trees' di Peter Wohlleben.",
  "Ascolto tantissima musica quando progetto. Il mio album preferito è 'In Rainbows' dei Radiohead.",
  "Mi piace anche la musica elettronica ambient — Nils Frahm soprattutto.",
  "Ho un cane, si chiama Fern (come la felce). È un border collie di 3 anni.",
  "Viaggio molto per lavoro. L'anno scorso sono stata a Copenhagen per studiare i parchi di Superkilen e Amager Strandpark.",
  "Il mio social principale è Instagram: @elena.ferraris.landscape. Lo uso come portfolio.",
  "Ho anche un profilo LinkedIn, ovviamente: linkedin.com/in/elenaferraris",

  // --- Phase 4: Values & personality (25-30) ---
  "Per me il design del paesaggio non è estetica — è giustizia ambientale. I quartieri più poveri hanno meno verde.",
  "Credo molto nella progettazione partecipata. Ogni progetto dovrebbe coinvolgere i residenti fin dall'inizio.",
  "Il mio motto professionale? 'Ogni metro quadro di verde è un metro quadro di salute pubblica.'",
  "Sono vegetariana da 8 anni. Non per ideologia, ma perché lavorare con la natura mi ha cambiato il rapporto col cibo.",
  "Mi definirei una persona curiosa, pragmatica e un po' testarda. Quando inizio un progetto non mollo finché non è perfetto.",
  "Ah, parlo anche un po' di catalano — l'ho imparato durante il master a Barcellona.",

  // --- Phase 5: Style & page refinement (31-38) ---
  "Puoi cambiare lo stile della pagina? Vorrei qualcosa di più naturale e organico.",
  "Mi piacerebbe il layout con la sidebar a sinistra.",
  "Puoi mettere le esperienze lavorative prima delle competenze?",
  "Ah aspetta, il mio ruolo attuale non è più 'architetta paesaggista' generico. Sono 'Lead Biophilic Designer' a Verdecittà.",
  "Puoi aggiungere il mio email di lavoro? elena.ferraris@verdecitta.it",
  "Ho anche un sito portfolio personale: www.elenaferraris.design",
  "Togli le piante carnivore dagli interessi — preferisco metterle come attività, dato che è una cosa che faccio attivamente.",
  "Anzi, ripensandoci, tieni le piante carnivore come interesse. Scusa per il cambio di idea!",

  // --- Phase 6: Education corrections (39-42) ---
  "Il mio periodo al Politecnico era dal 2013 al 2018, cinque anni.",
  "E il master a Barcellona era dal 2018 al 2020.",
  "Ah, ho anche fatto un workshop di due settimane al MIT Media Lab nel 2021, su 'Responsive Environments'. Puoi aggiungerlo?",
  "Ho dimenticato di dirti che ho anche un attestato di guida escursionistica — me lo sono preso nel 2019.",

  // --- Phase 7: More projects & achievements (43-47) ---
  "Un altro progetto che ho fatto: il cortile verde della Fondazione Sandretto Re Rebaudengo. Piccolo ma significativo.",
  "Ho tenuto un TEDx talk a TEDxTorino nel 2023 — il titolo era 'Healing Landscapes: When Gardens Become Medicine'.",
  "Sono stata intervistata da Domus magazine l'anno scorso, sull'approccio biofilico nel design urbano.",
  "Sono anche membro dell'AIAPP — Associazione Italiana di Architettura del Paesaggio.",
  "Quest'anno sono stata nominata tra i '30 Under 35' di Architectural Digest Italia.",

  // --- Phase 8: Final page generation & review (48-50) ---
  "Rigenera la pagina con tutte le informazioni nuove, per favore.",
  "Come viene? Puoi farmi un riassunto di quello che c'è nella pagina?",
  "Mi sembra tutto giusto. Grazie mille, è venuta benissimo!",
];

// ── State ────────────────────────────────────────────────────────
let SESSION_ID = null;
let SESSION_COOKIE = null;

// ── Helpers ──────────────────────────────────────────────────────
function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function openDb() {
  return new Database(DB_PATH, { readonly: true });
}

function queryDb(sql, params = []) {
  const db = openDb();
  try { return db.prepare(sql).all(...params); }
  finally { db.close(); }
}

function queryOne(sql, params = []) {
  const db = openDb();
  try { return db.prepare(sql).get(...params); }
  finally { db.close(); }
}

function getFactCount() {
  return queryOne(
    "SELECT COUNT(*) as cnt FROM facts WHERE session_id = ? AND archived_at IS NULL",
    [SESSION_ID]
  )?.cnt ?? 0;
}

function getFactsByCategory() {
  return queryDb(
    `SELECT category, COUNT(*) as cnt FROM facts
     WHERE session_id = ? AND archived_at IS NULL
     GROUP BY category ORDER BY cnt DESC`,
    [SESSION_ID]
  );
}

function getRecentFacts(limit = 20) {
  return queryDb(
    `SELECT category, key, value, visibility, confidence
     FROM facts WHERE session_id = ? AND archived_at IS NULL
     ORDER BY rowid DESC LIMIT ?`,
    [SESSION_ID, limit]
  );
}

function getAllFacts() {
  return queryDb(
    `SELECT category, key, value, visibility, confidence
     FROM facts WHERE session_id = ? AND archived_at IS NULL
     ORDER BY category, key`,
    [SESSION_ID]
  );
}

function getMessages() {
  return queryDb(
    `SELECT role, substr(content, 1, 120) as preview, created_at
     FROM messages WHERE session_id = ?
     ORDER BY rowid`,
    [SESSION_ID]
  );
}

function getDraftPage() {
  return queryDb(
    `SELECT id, config FROM page WHERE session_id = ? AND id = 'draft'`,
    [SESSION_ID]
  );
}

// ── Parse Vercel AI SDK data stream ──────────────────────────────
function parseDataStream(raw) {
  const lines = raw.split("\n");
  let text = "";
  const toolCalls = [];
  const toolResults = [];

  for (const line of lines) {
    if (line.startsWith("0:")) {
      try { text += JSON.parse(line.slice(2)); } catch {}
    } else if (line.startsWith("9:")) {
      try { toolCalls.push(JSON.parse(line.slice(2))); } catch {}
    } else if (line.startsWith("a:")) {
      try { toolResults.push(JSON.parse(line.slice(2))); } catch {}
    }
  }
  return { text, toolCalls, toolResults };
}

// ── Obtain session via invite API ────────────────────────────────
async function createSession() {
  const res = await fetch(`${BASE_URL}/api/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "code1" }),
    redirect: "manual",
  });

  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/os_session=([^;]+)/);
  if (!match) throw new Error(`No session cookie. Status: ${res.status}`);

  SESSION_COOKIE = `os_session=${match[1]}`;
  SESSION_ID = match[1];
  return SESSION_ID;
}

// ── Call chat API — read SSE stream incrementally ────────────────
async function sendMessage(conversationHistory) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": SESSION_COOKIE,
      },
      body: JSON.stringify({
        messages: conversationHistory,
        language: LANGUAGE,
        sessionId: SESSION_ID,
      }),
      redirect: "manual",
      signal: controller.signal,
    });

    if (res.status >= 300 && res.status < 400) {
      throw new Error(`Redirect to ${res.headers.get("location")} — session invalid?`);
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API ${res.status}: ${errText.slice(0, 300)}`);
    }

    // Read the stream incrementally to avoid "terminated" on long multi-step responses
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    const raw = chunks.join("");
    return { raw, headers: Object.fromEntries(res.headers.entries()) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Measure context blocks from DB state ─────────────────────────
function measureContextBlocks() {
  const db = openDb();
  try {
    const factCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM facts WHERE session_id = ? AND archived_at IS NULL"
    ).get(SESSION_ID)?.cnt ?? 0;

    const facts = db.prepare(
      `SELECT category, key, value FROM facts
       WHERE session_id = ? AND archived_at IS NULL`
    ).all(SESSION_ID);

    const factsText = facts
      .map(f => `- [${f.category}/${f.key}]: ${f.value}`)
      .join("\n");

    const soul = db.prepare(
      "SELECT compiled FROM soul_profiles WHERE owner_key = ? AND is_active = 1"
    ).get(SESSION_ID);

    const summary = db.prepare(
      "SELECT summary FROM conversation_summaries WHERE owner_key = ? ORDER BY rowid DESC LIMIT 1"
    ).get(SESSION_ID);

    const memories = db.prepare(
      "SELECT content, memory_type FROM agent_memory WHERE owner_key = ? AND deactivated_at IS NULL"
    ).all(SESSION_ID);

    const memoriesText = memories
      .map(m => `- [${m.memory_type}] ${m.content}`)
      .join("\n");

    const draft = db.prepare(
      "SELECT config FROM page WHERE session_id = ? AND id = 'draft'"
    ).get(SESSION_ID);

    const BASE_PROMPT_TOKENS = 5500;

    return {
      "System Prompt": BASE_PROMPT_TOKENS,
      [`Facts (${factCount})`]: estimateTokens(factsText ? `KNOWN FACTS (${factCount}):\n${factsText}` : ""),
      "Soul Profile": estimateTokens(soul?.compiled ?? ""),
      "Summary (T2)": estimateTokens(summary?.summary ?? ""),
      "Memories (T3)": estimateTokens(memoriesText),
      "Page State": estimateTokens(draft?.config ? JSON.stringify(JSON.parse(draft.config)).slice(0, 6000) : ""),
    };
  } finally {
    db.close();
  }
}

// ── Compact display helpers ──────────────────────────────────────
function progressBar(pct, width = 40) {
  const filled = Math.min(Math.round(pct / (100 / width)), width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function tokenBar(tokens, scale = 500, maxWidth = 30) {
  return "█".repeat(Math.min(Math.ceil(tokens / scale), maxWidth));
}

// ── Print turn summary ───────────────────────────────────────────
function printTurnSummary(turnNum, total, userMsg, assistantText, toolCalls, toolResults, elapsed, conversationHistory) {
  const SEP = "─".repeat(72);
  console.log(`\n${SEP}`);
  console.log(`  TURN ${turnNum}/${total}`);
  console.log(SEP);

  // User message
  console.log(`\n  [ELENA] ${userMsg}\n`);

  // Agent response
  const agentReply = (assistantText || "(no text — tool-only turn)").slice(0, 400);
  console.log(`  [AGENT] ${agentReply}`);
  if (assistantText && assistantText.length > 400) console.log("          ...(truncated)");

  // Timing
  console.log(`\n  Time: ${(elapsed / 1000).toFixed(1)}s | Tools: ${toolCalls.length} calls, ${toolResults.length} results`);

  // Tool calls (compact)
  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      const args = typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args);
      console.log(`    -> ${tc.toolName}(${args.slice(0, 100)}${args.length > 100 ? "…" : ""})`);
    }
  }

  // Token breakdown
  const blocks = measureContextBlocks();
  let total_tok = 0;
  const blockLines = [];
  for (const [name, tokens] of Object.entries(blocks)) {
    if (tokens > 0) {
      blockLines.push(`    ${tokenBar(tokens)} ${name}: ${tokens.toLocaleString()}`);
      total_tok += tokens;
    }
  }
  const historyTokens = estimateTokens(conversationHistory.map(m => m.content).join("\n"));
  blockLines.push(`    ${tokenBar(historyTokens)} History (${conversationHistory.length} msgs): ${historyTokens.toLocaleString()}`);
  total_tok += historyTokens + 200; // static blocks estimate

  const pct = ((total_tok / 65000) * 100).toFixed(1);
  console.log(`\n  Tokens: ~${total_tok.toLocaleString()}/65,000 [${progressBar(Number(pct))}] ${pct}%`);
  for (const l of blockLines) console.log(l);

  // DB state (compact)
  const factCount = getFactCount();
  const byCategory = getFactsByCategory();
  const draft = getDraftPage();
  const msgCount = getMessages().length;
  const hasDraft = draft.length > 0;
  let draftInfo = "none";
  if (hasDraft) {
    try {
      const cfg = JSON.parse(draft[0].config);
      draftInfo = `${cfg.sections?.length ?? 0} sections`;
    } catch { draftInfo = "parse error"; }
  }

  console.log(`\n  DB: ${factCount} facts [${byCategory.map(r => `${r.category}:${r.cnt}`).join(" ")}] | ${msgCount} msgs | draft: ${draftInfo}`);
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const TOTAL = PERSONA_MESSAGES.length;
  console.log("╔" + "═".repeat(70) + "╗");
  console.log("║  OPENSELF AGENT SIMULATOR — 50-turn conversation                    ║");
  console.log("║  Persona: Elena Ferraris, architetta paesaggista, Torino            ║");
  console.log("╚" + "═".repeat(70) + "╝");

  await createSession();
  console.log(`  Session: ${SESSION_ID}\n`);

  const conversationHistory = [];
  let errors = 0;
  let totalApiTime = 0;
  let totalToolCalls = 0;

  for (let i = 0; i < TOTAL; i++) {
    const userMsg = PERSONA_MESSAGES[i];
    conversationHistory.push({ role: "user", content: userMsg });

    const startTime = Date.now();
    let response;
    try {
      response = await sendMessage(conversationHistory);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.log(`\n  TURN ${i + 1}/${TOTAL} — ERROR after ${(elapsed / 1000).toFixed(1)}s: ${err.message.slice(0, 150)}`);
      errors++;
      // Don't add assistant reply — wait 30s on error to let rate limit recover
      await new Promise(r => setTimeout(r, 30000));
      continue;
    }
    const elapsed = Date.now() - startTime;
    totalApiTime += elapsed;

    const { text: assistantText, toolCalls, toolResults } = parseDataStream(response.raw);
    totalToolCalls += toolCalls.length;

    if (assistantText) {
      conversationHistory.push({ role: "assistant", content: assistantText });
    }

    printTurnSummary(i + 1, TOTAL, userMsg, assistantText, toolCalls, toolResults, elapsed, conversationHistory);

    // Pace: 15s minimum to avoid Anthropic rate limit (50k input tokens/min)
    const delay = Math.max(15000, elapsed > 10000 ? 5000 : 3000);
    if (i < TOTAL - 1) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // ── Final Report ──
  console.log(`\n\n${"═".repeat(72)}`);
  console.log("  FINAL REPORT");
  console.log("═".repeat(72));

  console.log(`\n  Session: ${SESSION_ID}`);
  console.log(`  Turns: ${TOTAL} (${errors} errors)`);
  console.log(`  Total API time: ${(totalApiTime / 1000).toFixed(1)}s (avg ${(totalApiTime / (TOTAL - errors) / 1000).toFixed(1)}s/turn)`);
  console.log(`  Total tool calls: ${totalToolCalls}`);

  // All facts
  const allFacts = getAllFacts();
  console.log(`\n  FACTS (${allFacts.length} total):`);
  const catMap = new Map();
  for (const f of allFacts) {
    if (!catMap.has(f.category)) catMap.set(f.category, []);
    catMap.get(f.category).push(f);
  }
  for (const [cat, facts] of catMap) {
    console.log(`\n    ${cat.toUpperCase()} (${facts.length}):`);
    for (const f of facts) {
      const val = typeof f.value === "string" ? f.value.slice(0, 90) : JSON.stringify(f.value).slice(0, 90);
      console.log(`      ${f.key}: ${val}`);
    }
  }

  // Draft page
  const finalDraft = getDraftPage();
  if (finalDraft.length > 0) {
    try {
      const config = JSON.parse(finalDraft[0].config);
      console.log(`\n  DRAFT PAGE (${config.sections?.length ?? 0} sections):`);
      for (const s of (config.sections || [])) {
        console.log(`    - ${s.type} [slot:${s.slot || "?"}] widget:${s.widgetId || "?"}`);
      }
    } catch {}
  } else {
    console.log("\n  DRAFT PAGE: none");
  }

  // Messages
  const msgs = getMessages();
  console.log(`\n  MESSAGES (${msgs.length}):`);
  for (const m of msgs) {
    const icon = m.role === "user" ? "[USER]" : "[BOT] ";
    console.log(`    ${icon} ${m.preview}…`);
  }

  // Token breakdown final
  const blocks = measureContextBlocks();
  let totalTok = 0;
  console.log("\n  FINAL TOKEN PROFILE:");
  for (const [name, tokens] of Object.entries(blocks)) {
    if (tokens > 0) {
      console.log(`    ${tokenBar(tokens)} ${name}: ${tokens.toLocaleString()} tok`);
      totalTok += tokens;
    }
  }
  const histTok = estimateTokens(conversationHistory.map(m => m.content).join("\n"));
  console.log(`    ${tokenBar(histTok)} History: ${histTok.toLocaleString()} tok`);
  totalTok += histTok + 200;
  const pct = ((totalTok / 65000) * 100).toFixed(1);
  console.log(`    TOTAL: ~${totalTok.toLocaleString()}/65,000 (${pct}%)`);

  console.log(`\n${"═".repeat(72)}`);
  console.log("  SIMULATION COMPLETE");
  console.log("═".repeat(72) + "\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
