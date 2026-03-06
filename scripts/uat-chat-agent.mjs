/**
 * UAT Chat Agent — Reactive Conversation
 *
 * Impersonates Marco Bellini (brand designer, Bologna).
 * Responds contextually to what the agent asks, like a real user.
 */

import Database from "better-sqlite3";

const BASE_URL = process.env.UAT_BASE_URL || "http://localhost:3001";
const DB_PATH = "db/openself.db";
const INVITE_CODE = "code1";
const LANGUAGE = "it";
const DELAY_MS = 60_000; // 1 minuto tra messaggi (evita rate limit Anthropic)
const MAX_MESSAGES = 50;
const MAX_RETRIES = 2;

// ── Marco's knowledge pool: topic → responses (consumed once) ──────────────
// Each key is a topic pattern the agent might ask about.
// The value is a queue of responses (first match wins, consumed in order).

const TOPIC_RESPONSES = {
  // Identity / name
  name: [
    "Mi chiamo Marco Bellini, ho 35 anni e vivo a Bologna.",
  ],
  // Work / profession
  work: [
    "Sono un brand designer e direttore creativo freelance. Ho il mio studio che si chiama Studio Forma, con due collaboratori: Anna e Luca.",
    "Lavoro nel design da circa 8 anni. Mi sono specializzato in branding e identita visiva, soprattutto per startup tech.",
  ],
  // Clients / projects
  clients: [
    "Tra i miei clienti piu importanti ci sono Velasca, Tannico e Satispay. Ho curato il rebranding completo di Velasca nel 2022.",
    "Ho anche collaborato con Google Italia per un evento di design a Milano nel 2023.",
  ],
  // Tools / skills
  tools: [
    "Uso principalmente Figma e Affinity Designer. Per le animazioni uso After Effects, e sto sperimentando con Blender per il 3D.",
  ],
  // Education
  education: [
    "Ho studiato al Politecnico di Milano, laurea in Design della Comunicazione.",
  ],
  // Hobbies / personal
  hobbies: [
    "Mi piace fare escursionismo sugli Appennini, soprattutto il Monte Cimone. Suono la chitarra da autodidatta, jazz e blues. Ho anche un cane, Pixel, un border collie di 3 anni.",
    "Sono appassionato di fotografia analogica, ho una Leica M6 che era di mio nonno. Faccio anche volontariato con Emergency a Bologna.",
  ],
  // YouTube / social
  social: [
    "Ho un canale YouTube che si chiama 'Design con Marco', faccio tutorial di design. Siamo a circa 18.000 iscritti.",
    "Il mio Instagram e @marco.bellini.design e su LinkedIn sono linkedin.com/in/marcobellini",
  ],
  // Awards / publications
  awards: [
    "Ho vinto il premio ADI Design Index nel 2024 per un progetto di packaging sostenibile. Ho anche pubblicato un articolo su Domus magazine sul design e sostenibilita.",
    "Ho scritto un mini-ebook sul design sostenibile, e su Gumroad: gumroad.com/marcobellini",
  ],
  // Teaching
  teaching: [
    "Tengo workshop di branding all'Accademia di Belle Arti di Bologna, due volte l'anno. Faccio anche mentoring per giovani designer con ADI Giovani.",
  ],
  // Languages
  languages: [
    "Parlo italiano, inglese fluente e un po' di spagnolo.",
  ],
  // Contact / website
  contact: [
    "La mia email e marco@studioforma.design. Il sito portfolio attuale e bellinidesign.it ma vorrei qualcosa di piu personale.",
  ],
  // Style preferences
  style: [
    "Mi piace uno stile minimale ma caldo, niente troppo freddo o corporate. I miei colori sono il bordeaux scuro e il beige caldo.",
    "Come layout mi piace tipo magazine, con tanto spazio bianco. Come i siti giapponesi minimali.",
  ],
  // Page / publish
  page: [
    "Come sta venendo la pagina? Mi piacerebbe vederla.",
    "Potresti mettere in evidenza i premi e le pubblicazioni? Sono importanti per i clienti.",
    "Vorrei che la sezione dei progetti fosse piu visibile, e il mio biglietto da visita.",
    "Mi piacerebbe avere una sezione 'Chi sono' che racconti un po' la mia storia.",
  ],
  // Corrections (test fact mutation)
  corrections: [
    "Una correzione: il mio studio prima si chiamava 'Bellini Design Studio', l'ho rinominato 'Studio Forma' l'anno scorso.",
    "Ah, e non uso piu tanto Illustrator, ormai faccio quasi tutto su Figma e Affinity Designer.",
  ],
  // Deletions
  deletions: [
    "Sai cosa, avevo un podcast 'Forma e Funzione' ma l'ho chiuso. Cancellalo se c'e.",
    "Stavo pensando a un corso su Domestika ma e ancora in fase di pianificazione, non metterlo ancora.",
  ],
  // Publish
  publish: [
    "Penso che possiamo pubblicare! Il mio username sarebbe 'uat-marco-bellini'.",
  ],
  // Generic / fallback (used when no topic matches)
  generic: [
    "Si, certo! Dimmi pure cosa ti serve.",
    "Va bene, continuiamo.",
    "Ok, hai altre domande?",
    "Perfetto, andiamo avanti.",
    "Si si, dimmi.",
  ],
  // Quote
  quote: [
    "Vorrei aggiungere una citazione che mi piace molto: 'Il buon design e il minimo design possibile' di Dieter Rams.",
  ],
  // Closing
  closing: [
    "Grazie mille per l'aiuto! La pagina sta venendo benissimo.",
  ],
};

// Topic detection: which keywords in agent's response trigger which topic
const TOPIC_PATTERNS = [
  { topic: "name", patterns: /come ti chiami|il tuo nome|chi sei|presentati|iniziamo|basi/i },
  { topic: "work", patterns: /cosa fai|lavoro|professione|occupazione|mestiere|attivit[aà]/i },
  { topic: "clients", patterns: /clienti|progett[oi]|portfolio|lavori importanti|orgoglioso/i },
  { topic: "tools", patterns: /strumenti|tool|software|programm[ai]|usi per|competenz/i },
  { topic: "education", patterns: /studi|formazione|universit[aà]|laurea|istruzione|scuola/i },
  { topic: "hobbies", patterns: /hobby|tempo libero|passioni|interessi|fuori dal lavoro|sport|personale/i },
  { topic: "social", patterns: /social|instagram|linkedin|youtube|canale|online|seguirti/i },
  { topic: "awards", patterns: /premi|riconosciment|pubblicazion|articol|ebook|scritto/i },
  { topic: "teaching", patterns: /insegn|workshop|mentor|formatore|corsi|didattica/i },
  { topic: "languages", patterns: /lingu[ae]|parl[aio]|inglese|spagnolo|internazional/i },
  { topic: "contact", patterns: /email|contatt[oi]|sito|website|telefono|raggiungerti/i },
  { topic: "style", patterns: /stile|colori?|font|layout|estetica|aspetto|design della pagina|visual/i },
  { topic: "page", patterns: /pagina|sezioni|anteprima|preview|struttura|come .* venendo|risultato/i },
  { topic: "publish", patterns: /pubblicar|username|online|live|pronta/i },
];

// ── Conversation phases: guide the conversation naturally ────────────────────
const PHASES = [
  // Phase 1 (msgs 1-3): Intro
  { until: 3, forceTopic: null, inject: null },
  // Phase 2 (msgs 4-10): Details — respond to agent questions
  { until: 10, forceTopic: null, inject: null },
  // Phase 3 (msgs 11-15): If agent hasn't asked, volunteer info
  { until: 15, forceTopic: null, volunteerTopics: ["hobbies", "social", "awards"] },
  // Phase 4 (msgs 16-20): Corrections phase
  { until: 20, forceTopic: null, volunteerTopics: ["corrections", "teaching"] },
  // Phase 5 (msgs 21-30): Page feedback
  { until: 30, forceTopic: null, volunteerTopics: ["page", "style"] },
  // Phase 6 (msgs 31-40): More details + deletions
  { until: 40, forceTopic: null, volunteerTopics: ["deletions", "contact", "quote"] },
  // Phase 7 (msgs 41-50): Wrap up
  { until: 50, forceTopic: null, volunteerTopics: ["publish", "closing"] },
];

function detectTopic(agentText) {
  for (const { topic, patterns } of TOPIC_PATTERNS) {
    if (patterns.test(agentText)) return topic;
  }
  return null;
}

function getResponse(topic) {
  if (topic && TOPIC_RESPONSES[topic]?.length > 0) {
    return { text: TOPIC_RESPONSES[topic].shift(), topic, source: "matched" };
  }
  // Fallback
  if (TOPIC_RESPONSES.generic.length > 0) {
    return { text: TOPIC_RESPONSES.generic.shift(), topic: "generic", source: "fallback" };
  }
  return { text: "Si, continua pure.", topic: "generic", source: "exhausted" };
}

function getPhase(msgNum) {
  for (const p of PHASES) {
    if (msgNum <= p.until) return p;
  }
  return PHASES[PHASES.length - 1];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function openDb() {
  return new Database(DB_PATH, { readonly: true });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseDataStream(raw) {
  const lines = raw.split("\n").filter(Boolean);
  let text = "";
  const toolCalls = [];
  const toolResults = [];
  let finishData = null;
  let error = null;

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const prefix = line.slice(0, colonIdx);
    const payload = line.slice(colonIdx + 1);

    try {
      switch (prefix) {
        case "0": text += JSON.parse(payload); break;
        case "9": toolResults.push(JSON.parse(payload)); break;
        case "b": toolCalls.push(JSON.parse(payload)); break;
        case "d": finishData = JSON.parse(payload); break;
        case "e": error = JSON.parse(payload); break;
      }
    } catch { /* skip */ }
  }
  return { text, toolCalls, toolResults, finishData, error };
}

async function getSession() {
  const res = await fetch(`${BASE_URL}/api/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: INVITE_CODE }),
  });
  if (!res.ok) throw new Error(`Invite failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") || res.headers.getSetCookie?.()[0];
  const match = setCookie?.match(/os_session=([^;]+)/);
  if (!match) throw new Error("No session cookie");
  return match[1];
}

async function sendMessage(sessionCookie, conversationHistory) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": `os_session=${sessionCookie}`,
        },
        body: JSON.stringify({ messages: conversationHistory, language: LANGUAGE }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 500 && attempt < MAX_RETRIES) {
          console.log(`    [retry ${attempt + 1}/${MAX_RETRIES}] Server 500, waiting 30s...`);
          await sleep(30_000);
          continue;
        }
        return { status: res.status, error: errText, text: "", toolCalls: [], toolResults: [] };
      }

      const raw = await res.text();
      const parsed = parseDataStream(raw);
      return { status: res.status, ...parsed, rawLength: raw.length };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.log(`    [retry ${attempt + 1}/${MAX_RETRIES}] ${err.message}, waiting 30s...`);
        await sleep(30_000);
        continue;
      }
      return { status: 0, error: err.message, text: "", toolCalls: [], toolResults: [] };
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const anomalies = [];
function logAnomaly(msgNum, type, detail) {
  anomalies.push({ messageNumber: msgNum, type, detail });
  console.error(`  !! ANOMALY [${type}] @ msg #${msgNum}: ${detail}`);
}

async function main() {
  console.log("============================================================");
  console.log("  UAT Chat Agent — Marco Bellini (reactive conversation)");
  console.log("============================================================\n");

  const sessionCookie = await getSession();
  console.log(`Session: ${sessionCookie.slice(0, 20)}...\n`);

  const conversationHistory = [];
  let totalToolCalls = 0;
  let totalToolResults = 0;
  let errors = 0;

  const db0 = openDb();
  const factCountBefore = db0.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
  db0.close();
  console.log(`Facts before: ${factCountBefore}\n`);

  // First message is always the opener
  const opener = "Ciao! Sono qui per creare la mia pagina personale.";

  for (let i = 0; i < MAX_MESSAGES; i++) {
    const msgNum = i + 1;

    // ── Decide what Marco says ──
    let userMsg;
    let topicUsed = "opener";

    if (i === 0) {
      userMsg = opener;
    } else {
      const lastAgentText = conversationHistory[conversationHistory.length - 1]?.content || "";
      const detectedTopic = detectTopic(lastAgentText);
      const phase = getPhase(msgNum);

      if (detectedTopic) {
        // Agent asked something specific — answer it
        const resp = getResponse(detectedTopic);
        userMsg = resp.text;
        topicUsed = resp.topic;
      } else if (phase.volunteerTopics?.length > 0) {
        // No clear question — volunteer info from phase topics
        for (const vt of phase.volunteerTopics) {
          if (TOPIC_RESPONSES[vt]?.length > 0) {
            const resp = getResponse(vt);
            userMsg = resp.text;
            topicUsed = resp.topic;
            break;
          }
        }
      }

      if (!userMsg) {
        const resp = getResponse(null);
        userMsg = resp.text;
        topicUsed = resp.topic;
      }
    }

    console.log(`\n-- #${msgNum}/${MAX_MESSAGES} [${topicUsed}] -------------------------`);
    console.log(`  MARCO: ${userMsg}`);

    conversationHistory.push({ role: "user", content: userMsg });

    // ── Send & receive ──
    const t0 = Date.now();
    const response = await sendMessage(sessionCookie, conversationHistory);
    const elapsed = Date.now() - t0;

    if (response.status !== 200) {
      logAnomaly(msgNum, "HTTP_ERROR", `Status ${response.status}`);
      errors++;
      // Don't add failed response to history
    } else if (!response.text?.trim()) {
      logAnomaly(msgNum, "EMPTY_RESPONSE", "No text in response");
      errors++;
    } else {
      conversationHistory.push({ role: "assistant", content: response.text });
    }

    totalToolCalls += response.toolResults.length; // results = completed tool calls
    totalToolResults += response.toolResults.length;

    // ── Display agent response ──
    const agentText = response.text || "(empty/error)";
    const lines = agentText.split("\n").filter(Boolean);
    for (const line of lines) {
      console.log(`  AGENT: ${line.slice(0, 200)}`);
    }
    console.log(`  [${elapsed}ms | ${response.toolResults.length} tools | ${response.rawLength || 0}B]`);

    // ── Show tool details ──
    for (const tr of response.toolResults) {
      const name = tr.toolName || "?";
      const args = tr.args ? JSON.stringify(tr.args).slice(0, 100) : "";
      console.log(`    -> ${name}(${args})`);
    }

    // ── Quality checks ──
    if (response.text) {
      const t = response.text;
      // Action claim without tools
      if (/ho (aggiornato|creato|modificato|aggiunto|rimosso|cambiato|salvato)/i.test(t)
          && response.toolResults.length === 0) {
        logAnomaly(msgNum, "UNBACKED_CLAIM", "Claims action but 0 tool calls");
      }
      // Response too short
      if (t.length < 15) {
        logAnomaly(msgNum, "TOO_SHORT", `Only ${t.length} chars`);
      }
      // Nonsense / confusion
      if (/non l'ho ancora eseguito|non sono in grado/i.test(t)) {
        logAnomaly(msgNum, "NONSENSE", "Agent response seems incoherent");
      }
    }

    // ── DB snapshot every 10 msgs ──
    if (msgNum % 10 === 0) {
      const db = openDb();
      const fc = db.prepare("SELECT COUNT(*) as c FROM facts WHERE archived_at IS NULL").get().c;
      const mc = db.prepare("SELECT COUNT(*) as c FROM messages").get().c;
      const pc = db.prepare("SELECT COUNT(*) as c FROM page").get().c;
      const recent = db.prepare(`
        SELECT category, key, value FROM facts
        WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 5
      `).all();
      console.log(`\n  == DB @ msg #${msgNum}: ${fc} facts (+${fc - factCountBefore}), ${mc} msgs, ${pc} pages ==`);
      for (const f of recent) {
        console.log(`     [${f.category}] ${f.key}: ${(f.value || "").slice(0, 60)}`);
      }
      db.close();
    }

    // ── Wait ──
    if (i < MAX_MESSAGES - 1) {
      await sleep(DELAY_MS);
    }
  }

  // ── Final report ──
  console.log("\n\n============================================================");
  console.log("  FINAL REPORT");
  console.log("============================================================\n");

  const db = openDb();
  const allFacts = db.prepare("SELECT * FROM facts ORDER BY created_at DESC").all();
  const active = allFacts.filter(f => !f.archived_at);
  const archived = allFacts.filter(f => !!f.archived_at);

  console.log(`Facts: ${active.length} active (+${active.length - factCountBefore} new), ${archived.length} archived`);

  const cats = {};
  for (const f of active) cats[f.category] = (cats[f.category] || 0) + 1;
  console.log("By category:", JSON.stringify(cats));

  const pages = db.prepare("SELECT id, config, updated_at FROM page ORDER BY updated_at DESC LIMIT 5").all();
  console.log(`\nPages: ${pages.length}`);
  for (const p of pages) {
    try {
      const cfg = JSON.parse(p.config);
      console.log(`  [${p.id}] ${cfg.sections?.length || 0} sections, updated ${p.updated_at}`);
    } catch { console.log(`  [${p.id}] unparseable`); }
  }

  const souls = db.prepare("SELECT owner_key, tone, voice, updated_at FROM soul_profiles ORDER BY created_at DESC LIMIT 3").all();
  console.log(`\nSoul profiles: ${souls.length}`);
  for (const s of souls) console.log(`  tone=${s.tone}, voice=${s.voice}`);

  db.close();

  console.log(`\nAnomalies (${anomalies.length}):`);
  for (const a of anomalies) console.log(`  #${a.messageNumber} [${a.type}]: ${a.detail}`);

  console.log(`\nTotal tool executions: ${totalToolResults}`);
  console.log(`Errors: ${errors}`);

  const score = Math.max(0, 100 - errors * 10 - anomalies.length * 3);
  console.log(`\nScore: ${score}/100 ${score >= 80 ? "OK" : score >= 50 ? "NEEDS WORK" : "FAILING"}`);

  // Save report
  const fs = await import("fs");
  fs.writeFileSync(`scripts/uat-report-${Date.now()}.json`, JSON.stringify({
    anomalies, totalToolResults, errors, score,
    exchanges: conversationHistory,
  }, null, 2));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
