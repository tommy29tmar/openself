/**
 * Seed script: creates a realistic test account with ~2 months of simulated interaction.
 *
 * Usage:
 *   EXTENDED_SECTIONS=true INVITE_CODES=code1 npx tsx scripts/seed-realistic.ts
 *
 * Credentials:
 *   Email:    tommaso@openself.dev
 *   Password: openself2026
 *   Username: tommaso
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/index";
import { facts } from "../src/lib/db/schema";
import {
  createUser,
  createProfile,
  linkProfileToUser,
  setProfileUsername,
  createAuthSession,
} from "../src/lib/services/auth-service";
import { registerUsername } from "../src/lib/services/session-service";
import { updateSoulOverlay } from "../src/lib/services/soul-service";
import { saveMemory } from "../src/lib/services/memory-service";
import { composeOptimisticPage } from "../src/lib/services/page-composer";
import { upsertDraft, requestPublish, confirmPublish } from "../src/lib/services/page-service";

// ─── Config ──────────────────────────────────────────────────────────────────

const EMAIL = "tommaso@openself.dev";
const PASSWORD = "openself2026";
const DISPLAY_NAME = "Tommaso Marrone";
const USERNAME = "tommaso";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFact(
  sessionId: string,
  profileId: string,
  category: string,
  key: string,
  value: Record<string, unknown>,
) {
  return {
    id: randomUUID(),
    sessionId,
    profileId,
    category,
    key,
    value,
    source: "chat" as const,
    confidence: 1.0,
    visibility: "public" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Creating user account...");
  const user = await createUser(EMAIL, PASSWORD, DISPLAY_NAME);

  console.log("🌱 Creating profile...");
  const profile = createProfile(user.id);
  linkProfileToUser(profile.id, user.id);
  setProfileUsername(profile.id, USERNAME);

  console.log("🌱 Creating auth session...");
  const sessionId = createAuthSession(user.id, profile.id);
  registerUsername(sessionId, USERNAME);

  const ownerKey = profile.id; // cognitiveOwnerKey for authenticated users

  // ─── Facts ───────────────────────────────────────────────────────────────

  console.log("🌱 Inserting facts...");

  const allFacts = [
    // Identity
    makeFact(sessionId, profile.id, "identity", "full-name", {
      full: "Tommaso Marrone",
      name: "Tommaso Marrone",
    }),
    makeFact(sessionId, profile.id, "identity", "role", {
      role: "Full-Stack Developer",
      title: "Full-Stack Developer",
    }),
    makeFact(sessionId, profile.id, "identity", "tagline", {
      tagline: "Building tools that put people in control of their data",
    }),
    makeFact(sessionId, profile.id, "identity", "location", {
      value: "Berlin, Germany",
    }),
    makeFact(sessionId, profile.id, "identity", "bio", {
      value: "Software developer passionate about local-first software, open source, and empowering users through technology. I believe the best tools are the ones that respect your privacy and give you ownership of your data.",
    }),

    // Experience (3 jobs)
    makeFact(sessionId, profile.id, "experience", "job-1", {
      role: "Senior Full-Stack Developer",
      company: "OpenSelf",
      period: "2025 – Present",
      description: "Building an AI-powered personal page builder. Conversation-first UX, local-first architecture with SQLite, Next.js App Router.",
      current: true,
    }),
    makeFact(sessionId, profile.id, "experience", "job-2", {
      role: "Software Engineer",
      company: "Vercel",
      period: "2022 – 2025",
      description: "Worked on the Next.js framework team. Contributed to App Router, Server Components, and developer tooling.",
    }),
    makeFact(sessionId, profile.id, "experience", "job-3", {
      role: "Frontend Developer",
      company: "Zalando",
      period: "2019 – 2022",
      description: "Built and maintained the design system used across 30+ internal tools. Led migration from Angular to React.",
    }),

    // Education (2 entries)
    makeFact(sessionId, profile.id, "education", "edu-1", {
      institution: "Technical University of Munich",
      degree: "M.Sc.",
      field: "Computer Science",
      period: "2017 – 2019",
      description: "Thesis on decentralized identity systems and self-sovereign data.",
    }),
    makeFact(sessionId, profile.id, "education", "edu-2", {
      institution: "Politecnico di Bari",
      degree: "B.Sc.",
      field: "Computer Engineering",
      period: "2014 – 2017",
    }),

    // Skills (10)
    makeFact(sessionId, profile.id, "skill", "skill-typescript", { name: "TypeScript" }),
    makeFact(sessionId, profile.id, "skill", "skill-react", { name: "React" }),
    makeFact(sessionId, profile.id, "skill", "skill-nextjs", { name: "Next.js" }),
    makeFact(sessionId, profile.id, "skill", "skill-nodejs", { name: "Node.js" }),
    makeFact(sessionId, profile.id, "skill", "skill-sqlite", { name: "SQLite" }),
    makeFact(sessionId, profile.id, "skill", "skill-tailwind", { name: "Tailwind CSS" }),
    makeFact(sessionId, profile.id, "skill", "skill-rust", { name: "Rust" }),
    makeFact(sessionId, profile.id, "skill", "skill-python", { name: "Python" }),
    makeFact(sessionId, profile.id, "skill", "skill-docker", { name: "Docker" }),
    makeFact(sessionId, profile.id, "skill", "skill-git", { name: "Git" }),

    // Projects (4)
    makeFact(sessionId, profile.id, "project", "project-openself", {
      title: "OpenSelf",
      description: "AI-powered personal page builder. Talk for 5 minutes, get a living page. Local-first with SQLite.",
      url: "https://openself.dev",
      tags: ["Next.js", "AI", "SQLite", "TypeScript"],
    }),
    makeFact(sessionId, profile.id, "project", "project-localfirst-crdt", {
      title: "local-first-crdt",
      description: "A lightweight CRDT library for building collaborative local-first applications without a central server.",
      url: "https://github.com/tommaso/local-first-crdt",
      tags: ["Rust", "CRDT", "Local-first"],
    }),
    makeFact(sessionId, profile.id, "project", "project-devlog", {
      title: "devlog.sh",
      description: "Minimal CLI tool for keeping a developer journal. Entries stored as plain markdown files.",
      url: "https://github.com/tommaso/devlog",
      tags: ["Go", "CLI", "Productivity"],
    }),
    makeFact(sessionId, profile.id, "project", "project-dotfiles", {
      title: "dotfiles",
      description: "My personal dotfiles: Neovim, tmux, zsh, and Nix configurations. Battle-tested across macOS and Linux.",
      url: "https://github.com/tommaso/dotfiles",
      tags: ["Nix", "Neovim", "Shell"],
    }),

    // Interests (5)
    makeFact(sessionId, profile.id, "interest", "interest-1", {
      name: "Local-first software",
      detail: "CRDTs, offline-first, user-owned data",
    }),
    makeFact(sessionId, profile.id, "interest", "interest-2", {
      name: "Open source",
      detail: "Contributor and maintainer",
    }),
    makeFact(sessionId, profile.id, "interest", "interest-3", {
      name: "AI/LLM tooling",
      detail: "Building practical tools with language models",
    }),
    makeFact(sessionId, profile.id, "interest", "interest-4", {
      name: "Photography",
      detail: "Street and architecture photography",
    }),
    makeFact(sessionId, profile.id, "interest", "interest-5", {
      name: "Specialty coffee",
      detail: "Home roasting and pour-over brewing",
    }),

    // Activities (3)
    makeFact(sessionId, profile.id, "activity", "activity-1", {
      name: "Running",
      activityType: "sport",
      frequency: "3x/week",
      description: "Half-marathon runner, training for Berlin Marathon 2026",
    }),
    makeFact(sessionId, profile.id, "activity", "activity-2", {
      name: "Open source contributions",
      activityType: "community",
      frequency: "weekly",
      description: "Regular contributor to Next.js, Drizzle ORM, and various TypeScript tooling",
    }),
    makeFact(sessionId, profile.id, "activity", "activity-3", {
      name: "Meetup speaking",
      activityType: "community",
      frequency: "monthly",
      description: "Regular speaker at Berlin.js and React Berlin meetups",
    }),

    // Achievements (3)
    makeFact(sessionId, profile.id, "achievement", "achievement-1", {
      title: "Next.js Contributor Award",
      description: "Recognized as a top community contributor for the App Router migration guides",
      date: "2024",
      issuer: "Vercel",
    }),
    makeFact(sessionId, profile.id, "achievement", "achievement-2", {
      title: "HackZurich Winner",
      description: "1st place with a decentralized identity verification prototype",
      date: "2023",
      issuer: "HackZurich",
    }),
    makeFact(sessionId, profile.id, "achievement", "achievement-3", {
      title: "Open Source Maintainer",
      description: "Maintaining 3 libraries with 2k+ combined GitHub stars",
      date: "2022 – Present",
    }),

    // Stats (4)
    makeFact(sessionId, profile.id, "stat", "stat-repos", {
      label: "Public Repos",
      value: "47",
    }),
    makeFact(sessionId, profile.id, "stat", "stat-contributions", {
      label: "Contributions (2025)",
      value: "1,284",
    }),
    makeFact(sessionId, profile.id, "stat", "stat-stars", {
      label: "GitHub Stars",
      value: "2.3k",
    }),
    makeFact(sessionId, profile.id, "stat", "stat-coffees", {
      label: "Coffees Brewed",
      value: "∞",
    }),

    // Social (5)
    makeFact(sessionId, profile.id, "social", "github", {
      platform: "GitHub",
      url: "https://github.com/tommaso",
      label: "tommaso",
    }),
    makeFact(sessionId, profile.id, "social", "linkedin", {
      platform: "LinkedIn",
      url: "https://linkedin.com/in/tommasomarrone",
      label: "tommasomarrone",
    }),
    makeFact(sessionId, profile.id, "social", "twitter", {
      platform: "Twitter",
      url: "https://twitter.com/tommasodev",
      label: "@tommasodev",
    }),
    makeFact(sessionId, profile.id, "social", "website", {
      platform: "Website",
      url: "https://openself.dev",
      label: "openself.dev",
    }),
    makeFact(sessionId, profile.id, "social", "mastodon", {
      platform: "Mastodon",
      url: "https://fosstodon.org/@tommaso",
      label: "@tommaso@fosstodon.org",
    }),

    // Reading (3)
    makeFact(sessionId, profile.id, "reading", "book-1", {
      title: "Designing Data-Intensive Applications",
      author: "Martin Kleppmann",
      note: "The bible for distributed systems. Re-read it every year.",
    }),
    makeFact(sessionId, profile.id, "reading", "book-2", {
      title: "A Philosophy of Software Design",
      author: "John Ousterhout",
      note: "Changed how I think about complexity and abstraction.",
    }),
    makeFact(sessionId, profile.id, "reading", "book-3", {
      title: "The Pragmatic Programmer",
      author: "David Thomas & Andrew Hunt",
      note: "Classic. Still relevant after 25 years.",
    }),

    // Music (3)
    makeFact(sessionId, profile.id, "music", "music-1", {
      title: "Random Access Memories",
      artist: "Daft Punk",
      note: "Perfect coding album",
    }),
    makeFact(sessionId, profile.id, "music", "music-2", {
      title: "In Rainbows",
      artist: "Radiohead",
      note: "The album that never gets old",
    }),
    makeFact(sessionId, profile.id, "music", "music-3", {
      title: "Blonde",
      artist: "Frank Ocean",
      note: "For late-night debugging sessions",
    }),

    // Languages (3)
    makeFact(sessionId, profile.id, "language", "lang-italian", {
      language: "Italian",
      proficiency: "native",
    }),
    makeFact(sessionId, profile.id, "language", "lang-english", {
      language: "English",
      proficiency: "fluent",
    }),
    makeFact(sessionId, profile.id, "language", "lang-german", {
      language: "German",
      proficiency: "intermediate",
    }),

    // Contact (1)
    makeFact(sessionId, profile.id, "contact", "email", {
      type: "email",
      value: "tommaso@openself.dev",
      label: "Email",
    }),
  ];

  // Batch insert
  for (const fact of allFacts) {
    db.insert(facts).values(fact).run();
  }
  console.log(`   Inserted ${allFacts.length} facts`);

  // ─── Soul Profile ────────────────────────────────────────────────────────

  console.log("🌱 Creating soul profile...");
  updateSoulOverlay(ownerKey, {
    voice: "Warm, technically precise, with a dry sense of humor. Writes like a developer who also reads literature.",
    tone: "Conversational yet knowledgeable. Avoids corporate jargon. Prefers concrete examples over abstractions.",
    values: [
      "User ownership of data",
      "Simplicity over cleverness",
      "Open source as a public good",
      "Building tools that last",
      "Respecting people's attention",
    ],
    selfDescription: "A developer who cares more about the people using the software than the technology itself. I build local-first tools because I believe your data should be yours. Currently obsessed with making AI useful without making it creepy.",
    communicationStyle: "Direct and specific. Uses analogies from cooking and running. Occasionally drops Italian expressions. Prefers bullet points over paragraphs when explaining technical concepts.",
  });

  // ─── Agent Memories ──────────────────────────────────────────────────────

  console.log("🌱 Saving agent memories...");
  const memories: Array<{ content: string; type: "observation" | "preference" | "insight" | "pattern"; category?: string }> = [
    {
      content: "Tommaso prefers minimal, clean designs. He specifically asked for the 'editorial-360' theme but later switched to 'minimal' because he values whitespace and readability above all.",
      type: "preference",
      category: "design",
    },
    {
      content: "When discussing his work history, Tommaso emphasizes impact over titles. He's prouder of the design system migration at Zalando (used by 30+ teams) than his Senior title.",
      type: "observation",
      category: "career",
    },
    {
      content: "Tommaso is Italian but lives in Berlin. He switches to Italian expressions when excited or frustrated. His page should feel international but with subtle Italian warmth.",
      type: "insight",
      category: "personality",
    },
    {
      content: "He's training for the Berlin Marathon 2026. Running is his primary way to decompress. He often draws parallels between endurance running and software development.",
      type: "observation",
      category: "lifestyle",
    },
    {
      content: "Tommaso strongly prefers local-first architecture. He's skeptical of cloud-only solutions and gets animated when discussing data sovereignty. This is a core value, not just a technical preference.",
      type: "insight",
      category: "values",
    },
    {
      content: "His coffee setup is a Comandante C40 grinder + Hario V60. He treats coffee brewing as a ritual. Mentioned wanting to add a 'coffee' section to his page someday.",
      type: "observation",
      category: "lifestyle",
    },
    {
      content: "When reviewing his page, Tommaso consistently asks for shorter sentences. He follows the principle: 'If you can say it in fewer words, do it.'",
      type: "pattern",
      category: "writing",
    },
    {
      content: "Tommaso's communication style in conversations follows a pattern: starts with a high-level question, dives into specifics, then steps back to verify the big picture. He appreciates when the agent mirrors this structure.",
      type: "pattern",
      category: "communication",
    },
    {
      content: "He's particularly proud of the OpenSelf project and considers it his magnum opus. He wants the page to subtly reflect this without being self-promotional.",
      type: "insight",
      category: "projects",
    },
    {
      content: "Prefers dark mode but wants his public page to default to light. He tested both and decided light mode 'feels more inviting for visitors'.",
      type: "preference",
      category: "design",
    },
  ];

  for (const mem of memories) {
    saveMemory(ownerKey, mem.content, mem.type, mem.category);
  }
  console.log(`   Saved ${memories.length} memories`);

  // ─── Compose & Publish ───────────────────────────────────────────────────

  console.log("🌱 Composing page...");

  // Read back facts as FactRow[]
  const insertedFacts = db.select().from(facts).where(
    eq(facts.sessionId, sessionId),
  ).all();

  const config = composeOptimisticPage(insertedFacts, USERNAME, "en", "monolith");
  console.log(`   Composed ${config.sections.length} sections`);

  console.log("🌱 Upserting draft...");
  upsertDraft(USERNAME, config, sessionId, profile.id);

  console.log("🌱 Publishing...");
  requestPublish(USERNAME, sessionId);
  confirmPublish(USERNAME, sessionId);

  console.log("");
  console.log("✅ Seed complete!");
  console.log("");
  console.log("Credentials:");
  console.log(`   Email:    ${EMAIL}`);
  console.log(`   Password: ${PASSWORD}`);
  console.log(`   Username: ${USERNAME}`);
  console.log("");
  console.log("URLs:");
  console.log("   Login:     http://localhost:3000/login");
  console.log("   Published: http://localhost:3000/tommaso");
  console.log("   Builder:   http://localhost:3000/builder");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
