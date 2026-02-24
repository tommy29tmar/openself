#!/usr/bin/env node
/**
 * UAT E2E — 10 personas, each gets a session, chats, and publishes a page.
 *
 * Usage:  node uat-e2e.mjs
 * Requires: the Next.js dev server running at http://localhost:3000
 *           INVITE_CODES=code1 in .env
 */

const BASE = "http://localhost:3000";
const INVITE_CODE = "code1";

// ── Personas ────────────────────────────────────────────────────────────────

const personas = [
  {
    name: "Marco Bianchi",
    username: "marco-bianchi",
    language: "it",
    intro:
      "Ciao! Sono Marco Bianchi, chef napoletano con 15 anni di esperienza. Ho un ristorante che si chiama 'La Tavola di Marco' nel centro storico di Napoli. Sono specializzato in cucina tradizionale napoletana, specialmente la pizza e i piatti a base di pesce fresco. Ho vinto il premio 'Migliore Pizzaiolo Campano' nel 2022.",
    followUp:
      "Oltre al ristorante, tengo corsi di cucina per turisti e ho un canale YouTube dove condivido ricette della nonna. I miei piatti preferiti da preparare sono la parmigiana di melanzane e gli spaghetti alle vongole. Amo anche il calcio, sono tifosissimo del Napoli!",
  },
  {
    name: "Sarah Chen",
    username: "sarah-chen",
    language: "en",
    intro:
      "Hi! I'm Sarah Chen, a UX designer based in San Francisco. I've been working in tech for 8 years, currently leading the design team at a health-tech startup called MedFlow. I'm really passionate about accessible design — I believe great products should work for everyone, regardless of ability.",
    followUp:
      "Before MedFlow, I worked at Google on the Material Design team for 3 years. I have a master's degree in Human-Computer Interaction from Carnegie Mellon. Outside work, I teach a free UX workshop at a local community college and I'm an avid watercolor painter. I also run a design newsletter called 'Pixels & People' with about 5,000 subscribers.",
  },
  {
    name: "Akira Tanaka",
    username: "akira-tanaka",
    language: "en",
    intro:
      "Hello! I'm Akira Tanaka, a street photographer based in Tokyo. I've been capturing the energy of city life for over 10 years. My work focuses on the contrast between tradition and modernity in Japanese urban landscapes. I've had exhibitions in Tokyo, Osaka, New York, and Berlin.",
    followUp:
      "I shoot primarily with Leica cameras — there's something about the tactile, quiet experience that keeps me coming back. My latest project 'Neon & Silence' explores the quiet moments in Shinjuku after midnight. I also teach photography workshops and write for a Japanese photography magazine called 'Light & Shadow'. In my free time, I practice kendo and brew my own sake.",
  },
  {
    name: "Elena Volkov",
    username: "elena-volkov",
    language: "en",
    intro:
      "Hi there! I'm Elena Volkov, a data scientist originally from Moscow, now living in Berlin. I work at the Fraunhofer Institute focusing on climate modeling and predictive analytics. I have a PhD in Applied Mathematics from ETH Zurich and I'm passionate about using data to fight climate change.",
    followUp:
      "My recent work involves building machine learning models that predict extreme weather events in Central Europe. I've published 12 papers in top journals and I'm a regular speaker at NeurIPS and ICML. I also mentor young women in STEM through an initiative called 'Code & Climate'. When I'm not working, I love hiking in the Alps and playing classical piano — Chopin is my favorite composer.",
  },
  {
    name: "Liam O'Brien",
    username: "liam-obrien",
    language: "en",
    intro:
      "Hey! I'm Liam O'Brien, a folk musician and songwriter from Dublin, Ireland. I've been playing guitar and writing songs since I was 14. My music blends traditional Irish folk with indie and Americana influences. I've released three albums and toured across Europe and North America.",
    followUp:
      "My latest album 'Atlantic Winds' came out last year and hit #3 on the Irish charts. I also run a small recording studio in Temple Bar where I help independent artists produce their music. I play guitar, banjo, and tin whistle. Some of my biggest influences are Glen Hansard, Damien Rice, and Joni Mitchell. I'm currently writing songs for a new album about the Irish diaspora.",
  },
  {
    name: "Priya Sharma",
    username: "priya-sharma",
    language: "en",
    intro:
      "Hello! I'm Priya Sharma, founder and CEO of LearnBridge, an EdTech startup based in Bangalore. We're building AI-powered personalized learning tools for underserved communities in rural India. Before starting LearnBridge, I was a product manager at Flipkart for 5 years.",
    followUp:
      "LearnBridge has reached over 200,000 students across 6 Indian states. We recently raised a $2M seed round from Sequoia India. I have an MBA from IIM Ahmedabad and a computer science degree from IIT Delhi. I'm also a TEDx speaker — my talk 'Education Without Borders' has over 500K views. Outside work, I practice Bharatanatyam dance and volunteer at a local animal shelter.",
  },
  {
    name: "Carlos Mendez",
    username: "carlos-mendez",
    language: "es",
    intro:
      "¡Hola! Soy Carlos Méndez, arquitecto de Ciudad de México especializado en diseño sustentable. Dirijo mi propio estudio, 'Espacio Verde Arquitectos', donde diseñamos edificios que respetan el medio ambiente. Llevo 12 años en la profesión y he trabajado en proyectos residenciales y comerciales en México, Colombia y España.",
    followUp:
      "Mi proyecto más reciente es un complejo de viviendas ecológicas en Oaxaca que utiliza materiales locales y sistemas de captación de agua de lluvia. Gané el premio 'Arquitectura Sustentable México 2023'. También soy profesor invitado en la UNAM donde doy clases de diseño bioclimático. Me apasiona la fotografía de arquitectura y el ciclismo urbano — recorro la ciudad en bici todos los días.",
  },
  {
    name: "Astrid Nilsson",
    username: "astrid-nilsson",
    language: "en",
    intro:
      "Hi! I'm Astrid Nilsson, an environmental researcher from Stockholm, Sweden. I work at the Stockholm Resilience Centre studying ocean ecosystems and marine biodiversity. My research focuses on the impact of microplastics on Baltic Sea wildlife. I have a PhD in Marine Biology from Lund University.",
    followUp:
      "I lead a citizen science project called 'Baltic Watch' where volunteers help monitor water quality across 50 coastal sites. I've published over 20 peer-reviewed papers and I'm an advisor to the Swedish Environmental Protection Agency. I also co-host a science podcast called 'Blue Planet Talks'. In my free time, I love sailing, cross-country skiing, and foraging for wild mushrooms.",
  },
  {
    name: "David Kim",
    username: "david-kim",
    language: "en",
    intro:
      "Hey! I'm David Kim, a game developer originally from Seoul, South Korea, now based in Seattle. I'm a lead gameplay programmer at Riot Games, working on some exciting unannounced projects. Before Riot, I spent 4 years at Bungie working on Destiny 2. I've been making games since I was 16.",
    followUp:
      "I specialize in gameplay systems, AI behavior, and procedural generation. I studied Computer Science at KAIST in South Korea, then got my Master's at DigiPen. I'm also an indie developer on the side — my game 'Ember Trail', a roguelike about a lost firefly, won 'Best Indie Game' at PAX West 2023. I'm passionate about Korean gaming culture and I stream game development on Twitch every Friday.",
  },
  {
    name: "Fatima Hassan",
    username: "fatima-hassan",
    language: "en",
    intro:
      "Hello! I'm Fatima Hassan, a journalist and writer based in Amman, Jordan. I cover the Middle East tech scene and startup ecosystem for TechCrunch and Wired Middle East. I've been a journalist for 10 years and I'm passionate about telling the stories of innovators in the MENA region.",
    followUp:
      "I recently published a book called 'Silicon Sands: The Rise of Middle East Tech' which profiles 30 groundbreaking startups from the region. I have a journalism degree from the American University of Beirut and a fellowship from the Reuters Institute at Oxford. I also host a podcast called 'MENA Makers' interviewing founders and investors. Outside work, I'm a calligraphy enthusiast and I love exploring ancient ruins — Petra is my happy place.",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse Vercel AI SDK data-stream response.
 * Protocol: each line is `<type>:<json_value>\n`
 * Type 0 = text delta, 9 = tool call, a = tool result, d = finish
 */
function parseStreamText(body) {
  const lines = body.split("\n").filter((l) => l.trim());
  let text = "";
  for (const line of lines) {
    if (line.startsWith("0:")) {
      try {
        text += JSON.parse(line.slice(2));
      } catch {
        // skip
      }
    }
  }
  return text;
}

/** Count tool calls in the stream body */
function countToolCalls(body) {
  const lines = body.split("\n").filter((l) => l.startsWith("9:"));
  const tools = {};
  for (const line of lines) {
    try {
      const data = JSON.parse(line.slice(2));
      tools[data.toolName] = (tools[data.toolName] || 0) + 1;
    } catch {
      // skip
    }
  }
  return tools;
}

// ── API Calls ───────────────────────────────────────────────────────────────

async function createSession() {
  const res = await fetch(`${BASE}/api/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: INVITE_CODE }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Invite failed (${res.status}): ${errBody}`);
  }
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/os_session=([^;]+)/);
  if (!match) throw new Error("No session cookie returned");
  return match[1];
}

async function chat(sessionId, messages, language) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `os_session=${sessionId}`,
    },
    body: JSON.stringify({ messages, language }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Chat failed (${res.status}): ${errBody}`);
  }
  const body = await res.text();
  const text = parseStreamText(body);
  const tools = countToolCalls(body);
  return { text, tools, rawBody: body };
}

async function publish(sessionId, username) {
  const res = await fetch(`${BASE}/api/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `os_session=${sessionId}`,
    },
    body: JSON.stringify({ username }),
  });
  return { status: res.status, body: await res.json() };
}

async function register(sessionId, username) {
  const res = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `os_session=${sessionId}`,
    },
    body: JSON.stringify({ username }),
  });
  return { status: res.status, body: await res.json() };
}

async function verifyPage(username) {
  const res = await fetch(`${BASE}/${username}`, { redirect: "manual" });
  return res.status;
}

// ── Main flow per persona ───────────────────────────────────────────────────

async function runPersona(persona, index) {
  const label = `[${index + 1}/10] ${persona.name}`;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${label} — starting UAT`);
  console.log(`${"=".repeat(60)}`);

  // 1. Create session
  const sessionId = await createSession();
  console.log(`  Session created: ${sessionId.slice(0, 8)}...`);

  // 2. Turn 1: Introduction
  const messages = [{ role: "user", content: persona.intro }];
  console.log(`  Turn 1: sending intro (${persona.intro.length} chars)...`);
  const r1 = await chat(sessionId, messages, persona.language);
  console.log(`  Turn 1 reply: "${r1.text.slice(0, 120)}..."`);
  console.log(`  Turn 1 tools: ${JSON.stringify(r1.tools)}`);
  messages.push({ role: "assistant", content: r1.text });

  await sleep(3000);

  // 3. Turn 2: Follow-up details
  messages.push({ role: "user", content: persona.followUp });
  console.log(`  Turn 2: sending follow-up (${persona.followUp.length} chars)...`);
  const r2 = await chat(sessionId, messages, persona.language);
  console.log(`  Turn 2 reply: "${r2.text.slice(0, 120)}..."`);
  console.log(`  Turn 2 tools: ${JSON.stringify(r2.tools)}`);
  messages.push({ role: "assistant", content: r2.text });

  await sleep(3000);

  // 4. Turn 3: Ask for page generation + publish
  const publishRequest =
    persona.language === "it"
      ? `Perfetto, hai abbastanza info! Per favore genera la mia pagina e preparala per la pubblicazione. Come username vorrei usare "${persona.username}".`
      : persona.language === "es"
        ? `¡Perfecto, ya tienes suficiente info! Por favor genera mi página y prepárala para publicar. Como nombre de usuario quiero usar "${persona.username}".`
        : `Great, you have plenty of info! Please generate my page and prepare it for publishing. I'd like my username to be "${persona.username}".`;

  messages.push({ role: "user", content: publishRequest });
  console.log(`  Turn 3: requesting page generation...`);
  const r3 = await chat(sessionId, messages, persona.language);
  console.log(`  Turn 3 reply: "${r3.text.slice(0, 120)}..."`);
  console.log(`  Turn 3 tools: ${JSON.stringify(r3.tools)}`);

  await sleep(2000);

  // 5. Publish
  console.log(`  Publishing as /${persona.username}...`);
  let pubResult = await publish(sessionId, persona.username);

  // Fallback: if STALE_DRAFT or no draft, try register (which auto-regenerates)
  if (pubResult.status !== 200) {
    console.log(`  Publish failed (${pubResult.status}): ${pubResult.body?.code || pubResult.body?.error}`);
    console.log(`  Trying /api/register as fallback...`);
    pubResult = await register(sessionId, persona.username);
  }

  console.log(`  Publish result: ${pubResult.status} — ${JSON.stringify(pubResult.body)}`);

  // 6. Verify page
  await sleep(1000);
  const pageStatus = await verifyPage(persona.username);
  const ok = pageStatus === 200;
  console.log(`  Page GET /${persona.username}: ${pageStatus} ${ok ? "OK" : "FAIL"}`);

  return {
    name: persona.name,
    username: persona.username,
    published: pubResult.body?.success === true,
    pageStatus,
    ok,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("OpenSelf UAT E2E — 10 personas\n");
  console.log(`Target: ${BASE}`);
  console.log(`Provider: OpenAI (gpt-4o-mini)`);
  console.log(`Invite code: ${INVITE_CODE}\n`);

  // Sanity check: is the server up?
  try {
    const res = await fetch(`${BASE}/api/preferences`, {
      headers: { Cookie: "os_session=test" },
    });
    // Any response (even 401) means server is up
    console.log(`Server check: ${res.status} — OK\n`);
  } catch (err) {
    console.error(`Server not reachable at ${BASE}. Start it with: npm run dev`);
    process.exit(1);
  }

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < personas.length; i++) {
    try {
      const result = await runPersona(personas[i], i);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({
        name: personas[i].name,
        username: personas[i].username,
        published: false,
        pageStatus: 0,
        ok: false,
        error: err.message,
      });
    }
    // Pace between personas to avoid rate limits
    if (i < personas.length - 1) {
      console.log(`\n  --- waiting 3s before next persona ---`);
      await sleep(3000);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  // Summary
  console.log(`\n\n${"=".repeat(60)}`);
  console.log(`RESULTS SUMMARY (${elapsed}s total)`);
  console.log(`${"=".repeat(60)}\n`);

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;

  for (const r of results) {
    const icon = r.ok ? "PASS" : "FAIL";
    const extra = r.error ? ` — ${r.error}` : "";
    console.log(`  [${icon}] ${r.name.padEnd(20)} /${r.username.padEnd(18)} page=${r.pageStatus}${extra}`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed out of ${results.length}\n`);

  // Print URLs for easy review
  if (pass > 0) {
    console.log("Published pages:");
    for (const r of results.filter((r) => r.ok)) {
      console.log(`  ${BASE}/${r.username}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
