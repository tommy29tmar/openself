#!/usr/bin/env node
/**
 * UAT E2E — remaining 3 personas (8-10) after token limit was raised.
 */

const BASE = "http://localhost:3000";
const INVITE_CODE = "code1";

const personas = [
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseStreamText(body) {
  return body.split("\n").filter((l) => l.startsWith("0:")).map((l) => {
    try { return JSON.parse(l.slice(2)); } catch { return ""; }
  }).join("");
}

function countToolCalls(body) {
  const tools = {};
  for (const line of body.split("\n").filter((l) => l.startsWith("9:"))) {
    try { const d = JSON.parse(line.slice(2)); tools[d.toolName] = (tools[d.toolName] || 0) + 1; } catch {}
  }
  return tools;
}

async function createSession() {
  const res = await fetch(`${BASE}/api/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: INVITE_CODE }),
  });
  if (!res.ok) throw new Error(`Invite failed (${res.status}): ${await res.text()}`);
  const m = (res.headers.get("set-cookie") || "").match(/os_session=([^;]+)/);
  if (!m) throw new Error("No session cookie");
  return m[1];
}

async function chat(sessionId, messages, language) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `os_session=${sessionId}` },
    body: JSON.stringify({ messages, language }),
  });
  if (!res.ok) throw new Error(`Chat failed (${res.status}): ${await res.text()}`);
  const body = await res.text();
  return { text: parseStreamText(body), tools: countToolCalls(body) };
}

async function publish(sessionId, username) {
  const res = await fetch(`${BASE}/api/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `os_session=${sessionId}` },
    body: JSON.stringify({ username }),
  });
  return { status: res.status, body: await res.json() };
}

async function register(sessionId, username) {
  const res = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `os_session=${sessionId}` },
    body: JSON.stringify({ username }),
  });
  return { status: res.status, body: await res.json() };
}

async function verifyPage(username) {
  return (await fetch(`${BASE}/${username}`, { redirect: "manual" })).status;
}

async function runPersona(persona, index) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${index}/10] ${persona.name} — starting UAT`);
  console.log(`${"=".repeat(60)}`);

  const sessionId = await createSession();
  console.log(`  Session: ${sessionId.slice(0, 8)}...`);

  const messages = [{ role: "user", content: persona.intro }];
  console.log(`  Turn 1: sending intro...`);
  const r1 = await chat(sessionId, messages, persona.language);
  console.log(`  Turn 1: "${r1.text.slice(0, 120)}..."`);
  console.log(`  Turn 1 tools: ${JSON.stringify(r1.tools)}`);
  messages.push({ role: "assistant", content: r1.text });
  await sleep(3000);

  messages.push({ role: "user", content: persona.followUp });
  console.log(`  Turn 2: sending follow-up...`);
  const r2 = await chat(sessionId, messages, persona.language);
  console.log(`  Turn 2: "${r2.text.slice(0, 120)}..."`);
  console.log(`  Turn 2 tools: ${JSON.stringify(r2.tools)}`);
  messages.push({ role: "assistant", content: r2.text });
  await sleep(3000);

  const pubMsg = `Great, you have plenty of info! Please generate my page and prepare it for publishing. I'd like my username to be "${persona.username}".`;
  messages.push({ role: "user", content: pubMsg });
  console.log(`  Turn 3: requesting page generation...`);
  const r3 = await chat(sessionId, messages, persona.language);
  console.log(`  Turn 3: "${r3.text.slice(0, 120)}..."`);
  console.log(`  Turn 3 tools: ${JSON.stringify(r3.tools)}`);
  await sleep(2000);

  console.log(`  Publishing as /${persona.username}...`);
  let pub = await publish(sessionId, persona.username);
  if (pub.status !== 200) {
    console.log(`  Publish failed (${pub.status}): ${pub.body?.code}. Trying register...`);
    pub = await register(sessionId, persona.username);
  }
  console.log(`  Publish: ${pub.status} — ${JSON.stringify(pub.body)}`);

  await sleep(1000);
  const pageStatus = await verifyPage(persona.username);
  console.log(`  Page /${persona.username}: ${pageStatus} ${pageStatus === 200 ? "OK" : "FAIL"}`);

  return { name: persona.name, username: persona.username, ok: pageStatus === 200 };
}

async function main() {
  console.log("UAT E2E — remaining 3 personas (8-10)\n");
  const results = [];
  for (let i = 0; i < personas.length; i++) {
    try {
      results.push(await runPersona(personas[i], i + 8));
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ name: personas[i].name, username: personas[i].username, ok: false, error: err.message });
    }
    if (i < personas.length - 1) await sleep(3000);
  }

  console.log(`\n\n${"=".repeat(60)}`);
  console.log("RESULTS");
  console.log(`${"=".repeat(60)}\n`);
  for (const r of results) {
    console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name.padEnd(20)} /${r.username}`);
  }
  console.log(`\nPublished pages:`);
  for (const r of results.filter((r) => r.ok)) {
    console.log(`  http://localhost:3000/${r.username}`);
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
