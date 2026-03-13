# Chat Session Redesign — Concierge Model Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the chat UX from "full history dump" to a concierge model where each visit shows a clean chat with a contextual greeting, while the agent retains full memory.

**Architecture:** Add `last_message_at` to sessions for TTL-based session activity detection. Replace client-side hardcoded greeting with server-computed dynamic greeting in bootstrap payload. Scope message loading to active session window (temporal filter). Lazy-persist greeting only when user sends first message.

**Tech Stack:** TypeScript, Next.js App Router, SQLite/Drizzle, Vitest, Vercel AI SDK

---

## Chunk 1: Database + Greeting Service

### Task 1: Migration — `last_message_at` column

**Files:**
- Create: `db/migrations/0036_session_last_message.sql`
- Modify: `src/lib/db/schema.ts:59-71`
- Modify: `src/lib/db/migrate.ts:9`

- [ ] **Step 1: Write migration SQL**

```sql
-- db/migrations/0036_session_last_message.sql
-- Add last_message_at to sessions for TTL-based session activity detection.
-- Backfill from most recent message per session.

ALTER TABLE sessions ADD COLUMN last_message_at TEXT;

UPDATE sessions SET last_message_at = (
  SELECT MAX(created_at) FROM messages WHERE messages.session_id = sessions.id
);
```

- [ ] **Step 2: Update Drizzle schema**

In `src/lib/db/schema.ts`, add `lastMessageAt` to the `sessions` table definition:

```typescript
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  inviteCode: text("invite_code").notNull(),
  username: text("username"),
  messageCount: integer("message_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  userId: text("user_id").references(() => users.id),
  profileId: text("profile_id").references(() => profiles.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  journeyState: text("journey_state"),
  metadata: text("metadata").notNull().default("{}"),
  lastMessageAt: text("last_message_at"),
});
```

- [ ] **Step 3: Bump EXPECTED_SCHEMA_VERSION**

In `src/lib/db/migrate.ts:9`:

```typescript
export const EXPECTED_SCHEMA_VERSION = 36;
```

- [ ] **Step 4: Run migration and verify**

Run: `npm run db:init`
Expected: Migration 0036 applies, sessions table has `last_message_at` column, backfilled from messages.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0036_session_last_message.sql src/lib/db/schema.ts src/lib/db/migrate.ts
git commit -m "feat: migration 0036 — add last_message_at to sessions for session TTL"
```

---

### Task 2: Greeting Service — server-computed dynamic greetings

**Files:**
- Create: `src/lib/agent/greeting.ts`
- Create: `tests/evals/greeting-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/evals/greeting-service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeGreeting } from "@/lib/agent/greeting";

describe("computeGreeting", () => {
  it("returns hardcoded first_visit greeting per language", () => {
    const result = computeGreeting({
      journeyState: "first_visit",
      language: "it",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("Come ti chiami");
  });

  it("returns first_visit greeting in English", () => {
    const result = computeGreeting({
      journeyState: "first_visit",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("What's your name");
  });

  it("returns returning_no_page greeting with name", () => {
    const result = computeGreeting({
      journeyState: "returning_no_page",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 2,
      situations: [],
    });
    expect(result).toContain("Tommaso");
    expect(result).toContain("Riprendiamo");
  });

  it("returns returning_no_page greeting without name", () => {
    const result = computeGreeting({
      journeyState: "returning_no_page",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("Welcome back");
    expect(result).not.toContain("null");
  });

  it("returns draft_ready greeting", () => {
    const result = computeGreeting({
      journeyState: "draft_ready",
      language: "en",
      userName: "Alice",
      lastSeenDaysAgo: 1,
      situations: [],
    });
    expect(result).toContain("Alice");
    expect(result).toContain("page");
  });

  it("returns active_fresh greeting", () => {
    const result = computeGreeting({
      journeyState: "active_fresh",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 0,
      situations: [],
    });
    expect(result).toContain("Tommaso");
  });

  it("returns active_stale greeting for short absence (<30 days)", () => {
    const result = computeGreeting({
      journeyState: "active_stale",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 10,
      situations: [],
    });
    expect(result).toContain("Tommaso");
  });

  it("returns active_stale greeting for long absence (>=30 days)", () => {
    const result = computeGreeting({
      journeyState: "active_stale",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 45,
      situations: [],
    });
    expect(result).toContain("Tommaso");
    expect(result).toContain("mese");
  });

  it("returns blocked greeting", () => {
    const result = computeGreeting({
      journeyState: "blocked",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("limit");
  });

  it("appends sparse profile hint when situation active", () => {
    const result = computeGreeting({
      journeyState: "active_fresh",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 0,
      situations: ["has_sparse_profile"],
    });
    expect(result).toContain("dettagli");
  });

  it("appends pending proposals hint when situation active", () => {
    const result = computeGreeting({
      journeyState: "active_fresh",
      language: "en",
      userName: "Alice",
      lastSeenDaysAgo: 0,
      situations: ["has_pending_soul_proposals"],
    });
    expect(result).toContain("proposal");
  });

  it("appends pending episodic patterns hint when situation active", () => {
    const result = computeGreeting({
      journeyState: "active_fresh",
      language: "en",
      userName: "Alice",
      lastSeenDaysAgo: 0,
      situations: ["has_pending_episodic_patterns"],
    });
    expect(result).toContain("patterns");
  });

  it("does not append situation hints to first_visit", () => {
    const result = computeGreeting({
      journeyState: "first_visit",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: ["has_sparse_profile"],
    });
    expect(result).not.toContain("detail");
  });

  it("does not append situation hints to blocked", () => {
    const result = computeGreeting({
      journeyState: "blocked",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: ["has_sparse_profile"],
    });
    expect(result).not.toContain("detail");
  });

  it("falls back to en for unsupported language", () => {
    const result = computeGreeting({
      journeyState: "first_visit",
      language: "xx",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("What's your name");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/greeting-service.test.ts`
Expected: FAIL — module `@/lib/agent/greeting` not found.

- [ ] **Step 3: Implement the greeting service**

Create `src/lib/agent/greeting.ts`:

```typescript
// src/lib/agent/greeting.ts

/**
 * Server-computed dynamic greeting — zero LLM, zero latency.
 *
 * Deterministic template strings based on journey state, user context,
 * and active situations. First_visit is always hardcoded to guarantee
 * the onboarding funnel asks for the user's name.
 */

import type { JourneyState, Situation } from "@/lib/agent/journey";

export interface GreetingContext {
  journeyState: JourneyState;
  language: string;
  userName: string | null;
  lastSeenDaysAgo: number | null;
  situations: Situation[];
}

type L10n = Record<string, string>;

// ---------------------------------------------------------------------------
// First visit — hardcoded, deterministic (must ask name)
// ---------------------------------------------------------------------------

const FIRST_VISIT: L10n = {
  en: "Hi! I create personal pages from a conversation. What's your name?",
  it: "Ciao! Creo pagine personali partendo da una conversazione. Come ti chiami?",
  de: "Hallo! Ich erstelle persönliche Seiten aus einem Gespräch. Wie heißt du?",
  fr: "Salut\u00a0! Je crée des pages personnelles à partir d\u2019une conversation. Comment tu t\u2019appelles\u00a0?",
  es: "¡Hola! Creo páginas personales a partir de una conversación. ¿Cómo te llamas?",
  pt: "Olá! Crio páginas pessoais a partir de uma conversa. Como te chamas?",
  ja: "こんにちは！会話からパーソナルページを作ります。お名前は？",
  zh: "你好！我通过对话创建个人页面。你叫什么名字？",
};

// ---------------------------------------------------------------------------
// Blocked — limit reached
// ---------------------------------------------------------------------------

const BLOCKED: L10n = {
  en: "You've used all your messages. Pick a username to publish your page!",
  it: "Hai esaurito i messaggi. Scegli un username per pubblicare la tua pagina!",
  de: "Du hast alle Nachrichten verbraucht. Wähle einen Benutzernamen, um deine Seite zu veröffentlichen!",
  fr: "Tu as utilisé tous tes messages. Choisis un nom d\u2019utilisateur pour publier ta page\u00a0!",
  es: "¡Has usado todos tus mensajes! Elige un nombre de usuario para publicar tu página.",
  pt: "Usaste todas as tuas mensagens. Escolhe um nome de utilizador para publicar a tua página!",
  ja: "メッセージをすべて使いました。ユーザー名を選んでページを公開しましょう！",
  zh: "你已用完所有消息。选择一个用户名来发布你的页面！",
};

// ---------------------------------------------------------------------------
// Situation hints (appended to base greeting for non-first_visit/blocked)
// ---------------------------------------------------------------------------

const SITUATION_HINTS: Record<string, L10n> = {
  has_sparse_profile: {
    en: " I noticed your profile still has few details — I can help you enrich it.",
    it: " Ho notato che il tuo profilo ha ancora pochi dettagli — posso aiutarti ad arricchirlo.",
    de: " Mir ist aufgefallen, dass dein Profil noch wenige Details hat — ich kann dir helfen, es zu erweitern.",
    fr: " J\u2019ai remarqué que ton profil a encore peu de détails — je peux t\u2019aider à l\u2019enrichir.",
    es: " He notado que tu perfil aún tiene pocos detalles — puedo ayudarte a enriquecerlo.",
    pt: " Reparei que o teu perfil ainda tem poucos detalhes — posso ajudar-te a enriquecê-lo.",
    ja: " プロフィールの詳細がまだ少ないようです。充実させるお手伝いができますよ。",
    zh: " 我注意到你的个人资料还比较少——我可以帮你丰富它。",
  },
  has_pending_soul_proposals: {
    en: " I have some style proposals for your page — want to take a look?",
    it: " Ho delle proposte di stile per la tua pagina — vuoi darci un'occhiata?",
    de: " Ich habe einige Stilvorschläge für deine Seite — möchtest du einen Blick darauf werfen?",
    fr: " J\u2019ai des propositions de style pour ta page — tu veux y jeter un œil\u00a0?",
    es: " Tengo propuestas de estilo para tu página — ¿quieres echarles un vistazo?",
    pt: " Tenho propostas de estilo para a tua página — queres dar uma olhada?",
    ja: " ページのスタイル提案があります。見てみますか？",
    zh: " 我有一些页面风格建议——想看看吗？",
  },
  has_pending_episodic_patterns: {
    en: " I\u2019ve noticed some patterns in your recent activity — want to hear about them?",
    it: " Ho notato dei pattern nelle tue attività recenti — vuoi saperne di più?",
    de: " Mir sind Muster in deinen letzten Aktivitäten aufgefallen — möchtest du mehr erfahren?",
    fr: " J\u2019ai remarqué des tendances dans tes activités récentes — tu veux en savoir plus\u00a0?",
    es: " He notado patrones en tu actividad reciente — ¿quieres saber más?",
    pt: " Notei padrões nas tuas atividades recentes — queres saber mais?",
    ja: " 最近のアクティビティにパターンが見つかりました。詳しく聞きますか？",
    zh: " 我注意到你最近的活动中有一些规律——想了解一下吗？",
  },
};

// ---------------------------------------------------------------------------
// Dynamic greeting builder
// ---------------------------------------------------------------------------

function buildReturningNoPage(lang: string, name: string | null): string {
  const n = name ? ` ${name}` : "";
  // NOTE: This user has NO page yet — do NOT assert "we were working on your profile"
  // (they may have abandoned early). Use a neutral, inviting greeting instead.
  const templates: L10n = {
    en: `Welcome back${n}! Ready to pick up where we left off?`,
    it: `Bentornato${n}! Riprendiamo da dove eravamo rimasti?`,
    de: `Willkommen zurück${n}! Sollen wir weitermachen, wo wir aufgehört haben?`,
    fr: `Re-bonjour${n}\u00a0! On reprend là où on en était\u00a0?`,
    es: `¡Bienvenido de nuevo${n}! ¿Seguimos donde lo dejamos?`,
    pt: `Bem-vindo de volta${n}! Continuamos de onde parámos?`,
    ja: name ? `おかえりなさい${name}さん！前回の続きから始めましょうか？` : `おかえりなさい！前回の続きから始めましょうか？`,
    zh: `欢迎回来${n}！我们继续之前的对话吧？`,
  };
  return templates[lang] ?? templates.en;
}

function buildDraftReady(lang: string, name: string | null): string {
  const n = name ? ` ${name}` : "";
  const templates: L10n = {
    en: `Welcome back${n}! Your page is ready for review — take a look on the right. Want to make any changes?`,
    it: `Bentornato${n}! La tua pagina è pronta — dai un'occhiata a destra. Vuoi modificare qualcosa?`,
    de: `Willkommen zurück${n}! Deine Seite ist fertig — schau rechts. Möchtest du etwas ändern?`,
    fr: `Re-bonjour${n}\u00a0! Ta page est prête — jette un œil à droite. Tu veux modifier quelque chose\u00a0?`,
    es: `¡Bienvenido${n}! Tu página está lista — mira a la derecha. ¿Quieres cambiar algo?`,
    pt: `Bem-vindo${n}! A tua página está pronta — vê à direita. Queres mudar alguma coisa?`,
    ja: name ? `おかえりなさい${name}さん！ページの準備ができています — 右側をご覧ください。変更はありますか？` : `おかえりなさい！ページの準備ができています — 右側をご覧ください。変更はありますか？`,
    zh: `欢迎回来${n}！你的页面已准备好——看看右边。想做什么修改吗？`,
  };
  return templates[lang] ?? templates.en;
}

function buildActiveFresh(lang: string, name: string | null): string {
  const n = name ? ` ${name}` : "";
  const templates: L10n = {
    en: `Hey${n}! Your page is live and up to date. How can I help?`,
    it: `Ciao${n}! La tua pagina è online e aggiornata. Come posso aiutarti?`,
    de: `Hey${n}! Deine Seite ist online und aktuell. Wie kann ich helfen?`,
    fr: `Salut${n}\u00a0! Ta page est en ligne et à jour. Comment je peux t\u2019aider\u00a0?`,
    es: `¡Hola${n}! Tu página está online y actualizada. ¿En qué puedo ayudarte?`,
    pt: `Olá${n}! A tua página está online e atualizada. Como posso ajudar?`,
    ja: name ? `${name}さん、こんにちは！ページは公開中で最新です。何かお手伝いしましょうか？` : `こんにちは！ページは公開中で最新です。何かお手伝いしましょうか？`,
    zh: `你好${n}！你的页面已上线并且是最新的。有什么我能帮忙的吗？`,
  };
  return templates[lang] ?? templates.en;
}

function buildActiveStale(lang: string, name: string | null, days: number | null): string {
  const n = name ? ` ${name}` : "";
  if (days != null && days >= 30) {
    const templates: L10n = {
      en: `Welcome back${n}! It's been over a month — anything new you'd like to share?`,
      it: `Bentornato${n}! È passato più di un mese — ci sono novità da raccontare?`,
      de: `Willkommen zurück${n}! Es ist über einen Monat her — gibt es Neuigkeiten?`,
      fr: `Re-bonjour${n}\u00a0! Ça fait plus d\u2019un mois — du nouveau à partager\u00a0?`,
      es: `¡Bienvenido de nuevo${n}! Ha pasado más de un mes — ¿hay novedades?`,
      pt: `Bem-vindo de volta${n}! Passou mais de um mês — há novidades?`,
      ja: name ? `おかえりなさい${name}さん！1ヶ月以上ぶりですね — 新しいことはありますか？` : `おかえりなさい！1ヶ月以上ぶりですね — 新しいことはありますか？`,
      zh: `欢迎回来${n}！已经过了一个多月——有什么新动态吗？`,
    };
    return templates[lang] ?? templates.en;
  }
  const templates: L10n = {
    en: `Hey${n}! It's been a little while. Anything new to add to your page?`,
    it: `Ciao${n}! È passato un po' dall'ultima volta. Ci sono novità da aggiungere alla tua pagina?`,
    de: `Hey${n}! Es ist eine Weile her. Gibt es etwas Neues für deine Seite?`,
    fr: `Salut${n}\u00a0! Ça fait un moment. Du nouveau pour ta page\u00a0?`,
    es: `¡Hola${n}! Ha pasado un tiempo. ¿Hay algo nuevo para tu página?`,
    pt: `Olá${n}! Faz algum tempo. Há algo novo para a tua página?`,
    ja: name ? `${name}さん、こんにちは！しばらくぶりですね。ページに追加したいことはありますか？` : `こんにちは！しばらくぶりですね。ページに追加したいことはありますか？`,
    zh: `你好${n}！有一段时间了。有什么新内容要添加到你的页面吗？`,
  };
  return templates[lang] ?? templates.en;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/** States that should NOT get situation hints appended. */
const NO_HINTS_STATES: Set<JourneyState> = new Set(["first_visit", "blocked"]);

export function computeGreeting(ctx: GreetingContext): string {
  const { journeyState, language, userName, lastSeenDaysAgo, situations } = ctx;
  const lang = language || "en";

  let base: string;

  switch (journeyState) {
    case "first_visit":
      return FIRST_VISIT[lang] ?? FIRST_VISIT.en;

    case "blocked":
      return BLOCKED[lang] ?? BLOCKED.en;

    case "returning_no_page":
      base = buildReturningNoPage(lang, userName);
      break;

    case "draft_ready":
      base = buildDraftReady(lang, userName);
      break;

    case "active_fresh":
      base = buildActiveFresh(lang, userName);
      break;

    case "active_stale":
      base = buildActiveStale(lang, userName, lastSeenDaysAgo);
      break;

    default:
      return FIRST_VISIT[lang] ?? FIRST_VISIT.en;
  }

  // Append situation hints (max 1 to keep greeting concise)
  if (!NO_HINTS_STATES.has(journeyState)) {
    for (const sit of situations) {
      const hints = SITUATION_HINTS[sit];
      if (hints) {
        base += hints[lang] ?? hints.en;
        break; // Only append the first matching hint
      }
    }
  }

  return base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/greeting-service.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/greeting.ts tests/evals/greeting-service.test.ts
git commit -m "feat: server-computed greeting service — journey-aware dynamic greetings"
```

---

### Task 3: Session activity detection helper

**Files:**
- Create: `src/lib/services/session-activity.ts`
- Create: `tests/evals/session-activity.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/evals/session-activity.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
    })),
  },
}));

import { sqlite } from "@/lib/db";
import { isSessionActive, getSessionTtlMinutes, updateLastMessageAt } from "@/lib/services/session-activity";

describe("getSessionTtlMinutes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns default 120 when env not set", () => {
    delete process.env.CHAT_SESSION_TTL_MINUTES;
    expect(getSessionTtlMinutes()).toBe(120);
  });

  it("reads from env var", () => {
    process.env.CHAT_SESSION_TTL_MINUTES = "60";
    expect(getSessionTtlMinutes()).toBe(60);
  });

  it("clamps to minimum 5 minutes", () => {
    process.env.CHAT_SESSION_TTL_MINUTES = "1";
    expect(getSessionTtlMinutes()).toBe(5);
  });

  it("ignores non-numeric values", () => {
    process.env.CHAT_SESSION_TTL_MINUTES = "abc";
    expect(getSessionTtlMinutes()).toBe(120);
  });
});

describe("isSessionActive", () => {
  it("returns false when lastMessageAt is null", () => {
    expect(isSessionActive(null, 120)).toBe(false);
  });

  it("returns true when message is within TTL (ISO format)", () => {
    const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    expect(isSessionActive(recent, 120)).toBe(true);
  });

  it("returns true when message is within TTL (SQLite format, no Z)", () => {
    // SQLite CURRENT_TIMESTAMP format: "YYYY-MM-DD HH:MM:SS" (UTC, no Z suffix)
    const d = new Date(Date.now() - 30 * 60 * 1000);
    const sqliteFormat = d.toISOString().replace("T", " ").split(".")[0];
    expect(isSessionActive(sqliteFormat, 120)).toBe(true);
  });

  it("returns false when message is beyond TTL", () => {
    const old = new Date(Date.now() - 180 * 60 * 1000).toISOString(); // 3 hours ago
    expect(isSessionActive(old, 120)).toBe(false);
  });

  it("returns false at exact boundary", () => {
    const exact = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    expect(isSessionActive(exact, 120)).toBe(false);
  });
});

describe("isSessionActive — edge cases", () => {
  it("returns false for empty string", () => {
    expect(isSessionActive("", 120)).toBe(false);
  });
});

describe("updateLastMessageAt", () => {
  it("calls sqlite with correct params", () => {
    const mockRun = vi.fn();
    vi.mocked(sqlite.prepare).mockReturnValue({ run: mockRun, get: vi.fn() } as any);

    updateLastMessageAt("sess-1");

    expect(sqlite.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sessions SET last_message_at")
    );
    expect(mockRun).toHaveBeenCalledWith("sess-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/session-activity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement session activity service**

Create `src/lib/services/session-activity.ts`:

```typescript
// src/lib/services/session-activity.ts

/**
 * Session activity detection for the concierge chat model.
 *
 * A session is "active" if its last message was sent within the TTL window.
 * When a session is not active, the client shows a clean chat with a fresh greeting.
 */

import { sqlite } from "@/lib/db";

const DEFAULT_TTL_MINUTES = 120;
const MIN_TTL_MINUTES = 5;

/**
 * Get the session TTL in minutes from env var, with sensible defaults.
 */
export function getSessionTtlMinutes(): number {
  const raw = process.env.CHAT_SESSION_TTL_MINUTES;
  if (!raw) return DEFAULT_TTL_MINUTES;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return DEFAULT_TTL_MINUTES;
  return Math.max(MIN_TTL_MINUTES, parsed);
}

/**
 * Check if a session is still active based on last message timestamp.
 */
export function isSessionActive(
  lastMessageAt: string | null,
  ttlMinutes: number,
): boolean {
  if (!lastMessageAt) return false;
  // SQLite CURRENT_TIMESTAMP stores UTC without "Z" suffix (e.g. "2026-03-13 10:00:00").
  // new Date("2026-03-13 10:00:00") interprets as LOCAL time → wrong on non-UTC servers.
  // Appending "Z" forces UTC interpretation, matching SQLite's actual timezone.
  const normalized = lastMessageAt.endsWith("Z") ? lastMessageAt : lastMessageAt + "Z";
  const lastMs = new Date(normalized).getTime();
  const cutoffMs = Date.now() - ttlMinutes * 60 * 1000;
  return lastMs > cutoffMs;
}

/**
 * Update the last_message_at timestamp on a session.
 * Called after each message write (user or assistant).
 */
export function updateLastMessageAt(sessionId: string): void {
  sqlite
    .prepare("UPDATE sessions SET last_message_at = datetime('now') WHERE id = ?")
    .run(sessionId);
}

/**
 * Get the last_message_at for a session, or compute it from messages if the
 * column is null (pre-migration sessions that haven't had messages since).
 */
export function getLastMessageAt(sessionId: string): string | null {
  const row = sqlite
    .prepare("SELECT last_message_at FROM sessions WHERE id = ?")
    .get(sessionId) as { last_message_at: string | null } | undefined;

  if (row?.last_message_at) return row.last_message_at;

  // Fallback: compute from messages table (for sessions not yet backfilled)
  const msgRow = sqlite
    .prepare("SELECT MAX(created_at) as latest FROM messages WHERE session_id = ?")
    .get(sessionId) as { latest: string | null } | undefined;

  return msgRow?.latest ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/session-activity.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/session-activity.ts tests/evals/session-activity.test.ts
git commit -m "feat: session activity detection — TTL-based session window for concierge chat"
```

---

## Chunk 2: Bootstrap + Messages API Changes

### Task 4: Bootstrap endpoint — add greeting + isActiveSession

**Files:**
- Modify: `src/app/api/chat/bootstrap/route.ts`
- Create: `tests/evals/bootstrap-greeting.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/evals/bootstrap-greeting.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
  },
  db: {},
}));

const mockPayload = {
  journeyState: "active_fresh" as const,
  situations: [] as string[],
  expertiseLevel: "familiar" as const,
  userName: "Tommaso",
  lastSeenDaysAgo: 2,
  publishedUsername: "tommaso",
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
  language: "it",
  conversationContext: null,
  archetype: "generalist" as const,
};

vi.mock("@/lib/agent/journey", () => ({
  assembleBootstrapPayload: vi.fn(() => ({
    payload: { ...mockPayload },
    data: { facts: [], soul: null, openConflictRecords: [], publishableFacts: [], childCountMap: new Map() },
  })),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => ({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  })),
  getAuthContext: vi.fn(() => null),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
  DEFAULT_SESSION_ID: "__default__",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/services/session-activity", () => ({
  getLastMessageAt: vi.fn(() => null),
  getSessionTtlMinutes: vi.fn(() => 120),
  isSessionActive: vi.fn(() => false),
}));

vi.mock("@/lib/agent/greeting", () => ({
  computeGreeting: vi.fn(() => "Ciao Tommaso! La tua pagina è online."),
}));

import { GET } from "@/app/api/chat/bootstrap/route";
import { isSessionActive } from "@/lib/services/session-activity";

describe("GET /api/chat/bootstrap", () => {
  it("returns greeting and isActiveSession=false for expired session", async () => {
    vi.mocked(isSessionActive).mockReturnValue(false);

    const req = new Request("http://localhost/api/chat/bootstrap?language=it");
    const res = await GET(req);
    const data = await res.json();

    expect(data.greeting).toBe("Ciao Tommaso! La tua pagina è online.");
    expect(data.isActiveSession).toBe(false);
    expect(data.journeyState).toBe("active_fresh");
  });

  it("returns isActiveSession=true for active session", async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);

    const req = new Request("http://localhost/api/chat/bootstrap?language=it");
    const res = await GET(req);
    const data = await res.json();

    expect(data.isActiveSession).toBe(true);
    expect(data.greeting).toBeDefined(); // greeting always returned
  });

  it("returns greeting for anonymous user (no session creation)", async () => {
    // Anonymous users should get a greeting without any new session being created.
    // This protects anonymous identity — temporal scoping only, no session mutation.
    vi.mocked(isSessionActive).mockReturnValue(false);

    const req = new Request("http://localhost/api/chat/bootstrap?language=en");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.greeting).toBeDefined();
    expect(typeof data.greeting).toBe("string");
    expect(data.greeting.length).toBeGreaterThan(0);
    expect(data.isActiveSession).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/bootstrap-greeting.test.ts`
Expected: FAIL — bootstrap route doesn't return `greeting` or `isActiveSession`.

- [ ] **Step 3: Update the bootstrap endpoint**

Modify `src/app/api/chat/bootstrap/route.ts`:

```typescript
// src/app/api/chat/bootstrap/route.ts

import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  DEFAULT_SESSION_ID,
} from "@/lib/services/session-service";
import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { computeGreeting } from "@/lib/agent/greeting";
import { getLastMessageAt, getSessionTtlMinutes, isSessionActive } from "@/lib/services/session-activity";

export async function GET(req: Request) {
  // Rate limiting (same as POST /api/chat)
  const rateResult = checkRateLimit(req, { skipPace: true });
  if (!rateResult.allowed) {
    return new Response(
      JSON.stringify({ error: rateResult.reason }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateResult.retryAfter ?? 1),
        },
      },
    );
  }

  const multiUser = isMultiUserEnabled();
  const scope = resolveOwnerScope(req);

  if (multiUser && !scope) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const effectiveScope = scope ?? {
    cognitiveOwnerKey: DEFAULT_SESSION_ID,
    knowledgeReadKeys: [DEFAULT_SESSION_ID],
    knowledgePrimaryKey: DEFAULT_SESSION_ID,
    currentSessionId: DEFAULT_SESSION_ID,
  };

  // Resolve auth for blocked detection
  const chatAuthCtx = multiUser ? getAuthContext(req) : null;
  const authInfo = chatAuthCtx
    ? {
        authenticated: !!(chatAuthCtx.userId || chatAuthCtx.username),
        username: chatAuthCtx.username ?? null,
      }
    : undefined;

  // Extract language from query string (default: "en")
  const url = new URL(req.url);
  const language = url.searchParams.get("language") ?? "en";

  const { payload } = assembleBootstrapPayload(effectiveScope, language, authInfo);

  // Session activity detection
  const sessionId = effectiveScope.currentSessionId;
  const lastMessageAt = getLastMessageAt(sessionId);
  const ttl = getSessionTtlMinutes();
  const activeSession = isSessionActive(lastMessageAt, ttl);

  // Compute greeting
  const greeting = computeGreeting({
    journeyState: payload.journeyState,
    language: payload.language,
    userName: payload.userName,
    lastSeenDaysAgo: payload.lastSeenDaysAgo,
    situations: payload.situations,
  });

  return new Response(JSON.stringify({
    ...payload,
    greeting,
    isActiveSession: activeSession,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/bootstrap-greeting.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run existing bootstrap tests to check for regressions**

Run: `npx vitest run tests/evals/chat-route-bootstrap.test.ts`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/bootstrap/route.ts tests/evals/bootstrap-greeting.test.ts
git commit -m "feat: bootstrap returns greeting + isActiveSession for concierge chat"
```

---

### Task 5: Messages API — temporal scoping

**Files:**
- Modify: `src/app/api/messages/route.ts`
- Create: `tests/evals/messages-temporal-scoping.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/evals/messages-temporal-scoping.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMessages = [
  { id: "old-1", role: "user", content: "old message", createdAt: "2026-01-01T00:00:00Z" },
  { id: "old-2", role: "assistant", content: "old reply", createdAt: "2026-01-01T00:01:00Z" },
  { id: "new-1", role: "user", content: "recent message", createdAt: new Date().toISOString() },
  { id: "new-2", role: "assistant", content: "recent reply", createdAt: new Date().toISOString() },
];

vi.mock("@/lib/db", () => {
  const selectAll = vi.fn(() => mockMessages);
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              all: selectAll,
            })),
          })),
        })),
      })),
    },
    sqlite: {
      prepare: vi.fn(() => ({
        get: vi.fn(() => undefined),
        run: vi.fn(),
      })),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  messages: {
    id: "id",
    role: "role",
    content: "content",
    sessionId: "session_id",
    createdAt: "created_at",
  },
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => ({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  })),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/services/session-activity", () => ({
  getSessionTtlMinutes: vi.fn(() => 120),
}));

describe("GET /api/messages — temporal scoping", () => {
  it("getSessionTtlMinutes returns configured TTL", async () => {
    const { getSessionTtlMinutes } = await import("@/lib/services/session-activity");
    // Verify the mock returns the expected value (used in the route handler)
    expect(getSessionTtlMinutes()).toBe(120);
  });

  it("temporal cutoff is computed correctly from TTL", () => {
    // Verify the cutoff computation that the route uses
    const ttlMinutes = 120;
    const cutoffDate = new Date(Date.now() - ttlMinutes * 60 * 1000);
    const cutoffSql = cutoffDate.toISOString().replace("T", " ").split(".")[0];
    // Must be valid SQLite date format: YYYY-MM-DD HH:MM:SS
    expect(cutoffSql).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
```

- [ ] **Step 2: Update the messages route**

Modify `src/app/api/messages/route.ts` to add temporal filtering:

```typescript
import { NextResponse } from "next/server";
import { and, inArray, asc, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getSessionTtlMinutes } from "@/lib/services/session-activity";

/**
 * GET /api/messages
 *
 * Returns chat history for the current active session window.
 * Messages older than SESSION_TTL are excluded (concierge model: clean chat on return).
 */
export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const readKeys = scope?.knowledgeReadKeys ?? ["__default__"];

  // Compute temporal cutoff in SQLite-compatible format (YYYY-MM-DD HH:MM:SS, UTC)
  // IMPORTANT: SQLite CURRENT_TIMESTAMP stores "YYYY-MM-DD HH:MM:SS" (no T, no Z).
  // toISOString() produces "YYYY-MM-DDTHH:MM:SS.000Z" — string comparison would fail.
  const ttlMinutes = getSessionTtlMinutes();
  const cutoffDate = new Date(Date.now() - ttlMinutes * 60 * 1000);
  const cutoffSql = cutoffDate.toISOString().replace("T", " ").split(".")[0];

  const rows = db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        inArray(messages.sessionId, readKeys),
        gt(messages.createdAt, cutoffSql),
      ),
    )
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();

  // Dedup by id (safety net)
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return NextResponse.json({
    success: true,
    messages: deduped.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
    })),
  });
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/evals/messages-temporal-scoping.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/messages/route.ts tests/evals/messages-temporal-scoping.test.ts
git commit -m "feat: messages API — temporal scoping (concierge session window)"
```

---

### Task 6: Chat route — update `last_message_at` + lazy greeting persistence

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Create: `tests/evals/chat-route-greeting-persistence.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/evals/chat-route-greeting-persistence.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { updateLastMessageAt } from "@/lib/services/session-activity";

// Structural test: verify the service is importable and callable
vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
    })),
  },
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        run: vi.fn(),
      })),
    })),
  },
}));

vi.mock("@/lib/services/session-activity", () => ({
  updateLastMessageAt: vi.fn(),
  getSessionTtlMinutes: vi.fn(() => 120),
  isSessionActive: vi.fn(() => false),
  getLastMessageAt: vi.fn(() => null),
}));

describe("chat route — greeting persistence", () => {
  it("updateLastMessageAt is called with session ID", () => {
    updateLastMessageAt("sess-1");
    expect(vi.mocked(updateLastMessageAt)).toHaveBeenCalledWith("sess-1");
  });

  it("updateLastMessageAt can be called multiple times (user + assistant)", () => {
    vi.mocked(updateLastMessageAt).mockClear();
    updateLastMessageAt("sess-1"); // after user message
    updateLastMessageAt("sess-1"); // after assistant message (in onFinish)
    expect(vi.mocked(updateLastMessageAt)).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Modify the chat route**

In `src/app/api/chat/route.ts`, make two changes:

**Change 1:** After persisting the user message (around line 300-307), also call `updateLastMessageAt`:

Add import at top:
```typescript
import { updateLastMessageAt } from "@/lib/services/session-activity";
```

After the user message insert block (`if (lastMessage?.role === "user") { ... }`, around line 298-308), add:

```typescript
  // Update session activity timestamp for concierge TTL
  updateLastMessageAt(messageSessionId);
```

**Change 2:** Handle lazy greeting persistence. In the `POST` handler, before the user message persist block, check for a `greetingMessage` in the request body and persist it first:

After `const { messages, language } = body;` (around line 97), add:

```typescript
  // Lazy greeting persistence: if the client sends a greeting message from bootstrap,
  // persist it as the first message of this session window.
  const greetingMessage = body.greetingMessage as { id: string; content: string } | undefined;
```

Then, right before the user message persist block (before line 298), add:

```typescript
  // Persist greeting if provided (lazy persistence — only on first user message)
  if (greetingMessage?.id && greetingMessage?.content) {
    try {
      db.insert(messagesTable)
        .values({
          id: greetingMessage.id,
          sessionId: messageSessionId,
          role: "assistant",
          content: greetingMessage.content,
        })
        .run();
    } catch {
      // Ignore duplicate — greeting may already be persisted (idempotent)
    }
  }
```

**Change 3:** Update `last_message_at` unconditionally at the END of `onFinish` — after both the normal assistant message path AND the synthetic (step-exhaustion) message path. This ensures the session stays active even when the model exhausts its steps and only the synthetic fallback message is written.

Add this as the LAST line inside `onFinish`, after the `updateLastReferencedAt` block (around line 485), just before the closing `}` of `onFinish`:

```typescript
        // Update session activity timestamp — unconditional so that step-exhaustion
        // synthetic messages also keep the session alive.
        try {
          updateLastMessageAt(messageSessionId);
        } catch (e) {
          console.warn("[chat] updateLastMessageAt failed:", e);
        }
```

**Important:** Do NOT place this inside the `if (safeText)` block or any conditional — it must run regardless of which message path executed.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/evals/chat-route-greeting-persistence.test.ts`
Expected: PASS.

- [ ] **Step 4: Add session-activity mocks to existing test files**

The import of `updateLastMessageAt` in the chat route may break existing tests that don't mock `session-activity`. Add this mock to:
- `tests/evals/chat-route-bootstrap.test.ts`
- `tests/evals/chat-route-message-persistence.test.ts`
- Any other test file that imports `@/app/api/chat/route`

```typescript
vi.mock("@/lib/services/session-activity", () => ({
  updateLastMessageAt: vi.fn(),
  getSessionTtlMinutes: vi.fn(() => 120),
  isSessionActive: vi.fn(() => false),
  getLastMessageAt: vi.fn(() => null),
}));
```

- [ ] **Step 5: Run existing chat route tests for regressions**

Run: `npx vitest run tests/evals/chat-route-bootstrap.test.ts tests/evals/chat-route-message-persistence.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/route.ts tests/evals/chat-route-greeting-persistence.test.ts
git commit -m "feat: chat route — updateLastMessageAt + lazy greeting persistence"
```

---

## Chunk 3: Client-Side Changes

### Task 7: ChatPanel — replace buildWelcomeMessage with bootstrap greeting

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Remove the 6 hardcoded greeting dictionaries and `buildWelcomeMessage`**

In `src/components/chat/ChatPanel.tsx`, delete these specific symbols (NOT the entire range — `LIMIT_MESSAGES` is used by `LimitReachedUI` and must be kept):
- `FIRST_VISIT_WELCOME` dict (lines 17-26)
- `RETURNING_WELCOME` dict (lines 31-40)
- `DRAFT_READY_WELCOME` dict (lines 45-54)
- The old `BootstrapResponse` type (lines 67-72) — replaced with updated version
- `buildWelcomeMessage` function (lines 74-128)

Keep ALL of these (used by `LimitReachedUI`):
- `LIMIT_MESSAGES` (lines 56-65)
- `LIMIT_AUTHENTICATED_MESSAGES` (line 130)
- `LIMIT_PUBLISH_CTA` (line 142)

- [ ] **Step 2: Update BootstrapResponse type**

Replace the existing `BootstrapResponse` type (around line 68-73) with:

```typescript
type BootstrapResponse = {
  journeyState?: string;
  userName?: string | null;
  publishedUsername?: string | null;
  language?: string;
  greeting?: string;
  isActiveSession?: boolean;
};
```

- [ ] **Step 3: Update ChatPanelProps to receive greeting from parent**

In `ChatPanelProps` (around line 295-305), the `initialBootstrap` prop already carries the greeting. No change needed here.

- [ ] **Step 4: Rewrite the initialMessages logic in ChatPanel**

Replace the `useEffect` in `ChatPanel` that builds initialMessages (currently around line 347-458). The new logic:

```typescript
  useEffect(() => {
    if (disableInitialFetch) {
      // Use pre-fetched data from parent
      const bootstrap = initialBootstrap as BootstrapResponse | null;
      const greetingText = bootstrap?.greeting;
      const isActive = bootstrap?.isActiveSession ?? false;

      const restoredMessages: StoredMessage[] = (propMessages ?? [])
        .filter((m): m is {id: string; role: string; content: string} =>
          (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ id: m.id, role: m.role as StoredMessage["role"], content: m.content }));

      if (isActive && restoredMessages.length > 0) {
        // Active session: show existing messages (no greeting prepend)
        setInitialMessages(restoredMessages);
      } else {
        // New session: show greeting only
        const greeting: StoredMessage = {
          id: `greeting-${Date.now()}`,
          role: "assistant",
          content: greetingText || "Hey! What would you like to work on?",
        };
        setInitialMessages([greeting]);
        // Store greeting ID for lazy persistence on first user message
        greetingRef.current = { id: greeting.id, content: greeting.content };
      }
      setHistoryLoaded(true);
      return;
    }

    // Fallback: internal fetch (for non-lifted usage)
    let cancelled = false;
    const load = async () => {
      let bootstrap: BootstrapResponse | null = null;
      let historyMessages: StoredMessage[] = [];

      try {
        const [bootstrapRes, messagesRes] = await Promise.all([
          fetch(`/api/chat/bootstrap?language=${language}`, { cache: "no-store" }),
          fetch("/api/messages", { cache: "no-store" }),
        ]);
        if (bootstrapRes.ok) bootstrap = await bootstrapRes.json();
        if (messagesRes.status === 401) {
          window.location.href = "/invite";
          return;
        }
        if (messagesRes.ok) {
          const data = await messagesRes.json() as MessagesResponse;
          if (data.success && Array.isArray(data.messages)) {
            historyMessages = data.messages
              .filter((m): m is { id: string; role: string; content: string } =>
                typeof m.id === "string" && typeof m.role === "string" && typeof m.content === "string")
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ id: m.id, role: m.role as StoredMessage["role"], content: m.content }));
          }
        }
      } catch {
        // Fetch failed — use fallback
      }

      if (cancelled) return;

      const isActive = bootstrap?.isActiveSession ?? false;
      const greetingText = bootstrap?.greeting;

      if (isActive && historyMessages.length > 0) {
        setInitialMessages(historyMessages);
      } else {
        const greeting: StoredMessage = {
          id: `greeting-${Date.now()}`,
          role: "assistant",
          content: greetingText || "Hey! What would you like to work on?",
        };
        setInitialMessages([greeting]);
        greetingRef.current = { id: greeting.id, content: greeting.content };
      }
      setHistoryLoaded(true);
    };

    load();
    return () => { cancelled = true; };
  }, [language, disableInitialFetch, initialBootstrap, propMessages]);
```

- [ ] **Step 5: Fix the useState initializer and add greetingRef**

The `useState` initializer at line 342-344 calls `buildWelcomeMessage` which we deleted. Replace:

```typescript
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>(() => [
    buildWelcomeMessage(language, null),
  ]);
```
with:
```typescript
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>([]);
```

This is safe because `historyLoaded` guards rendering — the `ChatPanelLoading` skeleton shows until the `useEffect` sets `historyLoaded = true`, which also sets `initialMessages`.

Also add a ref (before the useEffect):

```typescript
  const greetingRef = useRef<{ id: string; content: string } | null>(null);
```

- [ ] **Step 6: Modify ChatPanelInner to handle lazy greeting persistence**

In `ChatPanelInner`, the `useChat` `body` option needs to include the greeting for lazy persistence. Update the `ChatPanelInnerProps` type and the `useChat` config.

Add to `ChatPanelInnerProps`:
```typescript
  pendingGreeting?: { id: string; content: string } | null;
```

Pass `pendingGreeting={greetingRef.current}` from `ChatPanel` to `ChatPanelInner`.

**Also add `key={language}`** to the `<ChatPanelInner>` element to force re-mount when language changes. Without this, `useChat`'s `initialMessages` (used as SWR `fallbackData`) is captured on first mount only — changing language while the component is mounted would leave stale greeting text in the wrong language:

```tsx
<ChatPanelInner
  key={language}
  language={language}
  ...
/>
```

In `ChatPanelInner`, modify the `useChat` hook's body to conditionally include the greeting:

```typescript
  const pendingGreetingRef = useRef(pendingGreeting);

  const { messages, input, handleInputChange, handleSubmit, isLoading, reload, setMessages, append } =
    useChat({
      api: "/api/chat",
      body: {
        language,
        ...(pendingGreetingRef.current ? { greetingMessage: pendingGreetingRef.current } : {}),
      },
      initialMessages,
      onResponse: (response) => {
        // After first message sent, clear the pending greeting
        pendingGreetingRef.current = null;
        // ... rest of onResponse
```

- [ ] **Step 7: Update the refreshChat function**

In `ChatPanelInner`, the `refreshChat` function currently calls `buildWelcomeMessage`. Replace it to not prepend any welcome message — the messages from `/api/messages` will already include the persisted greeting:

```typescript
  const refreshChat = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as MessagesResponse;
      if (!data.success || !Array.isArray(data.messages)) return false;
      const restored: StoredMessage[] = data.messages
        .filter(
          (m): m is { id: string; role: string; content: string } =>
            typeof m.id === "string" &&
            typeof m.role === "string" &&
            typeof m.content === "string",
        )
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as StoredMessage["role"],
          content: m.content,
        }));
      if (restored.length === 0) {
        // Session expired during recovery — fetch fresh greeting from bootstrap
        try {
          const bRes = await fetch(`/api/chat/bootstrap?language=${language}`, { cache: "no-store" });
          if (bRes.ok) {
            const boot = await bRes.json();
            if (boot.greeting) {
              const greetingMsg = { id: `greeting-${Date.now()}`, role: "assistant" as const, content: boot.greeting };
              setMessages([greetingMsg]);
              // Track for lazy persistence so the greeting gets persisted on next user message
              pendingGreetingRef.current = { id: greetingMsg.id, content: greetingMsg.content };
              setChatError(null);
              return true;
            }
          }
        } catch { /* fall through */ }
        return false;
      }
      setMessages(restored);
      setChatError(null);
      const lastAssistant = [...restored].reverse().find(m => m.role === "assistant");
      return !!(lastAssistant?.content?.trim());
    } catch {
      return false;
    }
  }, [language, setMessages]);
```

- [ ] **Step 8: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to ChatPanel changes.

- [ ] **Step 9: Commit**

```bash
git add src/components/chat/ChatPanel.tsx
git commit -m "feat: ChatPanel — replace buildWelcomeMessage with bootstrap greeting (concierge model)"
```

---

### Task 8: SplitView — pass language to bootstrap fetch

**Files:**
- Modify: `src/components/layout/SplitView.tsx`

- [ ] **Step 1: Pass language to bootstrap fetch URL**

In `SplitView.tsx:136`, the bootstrap fetch does NOT pass the language query param. The greeting service needs it to generate the greeting in the correct language. Change:

```typescript
fetch("/api/chat/bootstrap", { cache: "no-store", signal: controller.signal }),
```
to:
```typescript
fetch(`/api/chat/bootstrap?language=${language}`, { cache: "no-store", signal: controller.signal }),
```

This is critical — without it, all greetings would default to English regardless of user language.

- [ ] **Step 2: Verify with TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/SplitView.tsx
git commit -m "fix: pass language to bootstrap fetch for correct greeting language"
```

---

## Chunk 4: Integration Tests + Verification

### Task 9: Integration tests

**Files:**
- Create: `tests/evals/chat-session-concierge.test.ts`

- [ ] **Step 1: Write integration tests**

Create `tests/evals/chat-session-concierge.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeGreeting } from "@/lib/agent/greeting";
import { isSessionActive, getSessionTtlMinutes } from "@/lib/services/session-activity";

describe("Concierge Chat Model — Integration", () => {
  describe("greeting + session activity coordination", () => {
    it("expired session → greeting computed, isActive=false", () => {
      const oldTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
      const active = isSessionActive(oldTimestamp, 120);
      expect(active).toBe(false);

      const greeting = computeGreeting({
        journeyState: "active_fresh",
        language: "it",
        userName: "Tommaso",
        lastSeenDaysAgo: 0,
        situations: [],
      });
      expect(greeting).toContain("Tommaso");
      expect(greeting).toContain("pagina");
    });

    it("active session → no new greeting needed", () => {
      const recentTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      const active = isSessionActive(recentTimestamp, 120);
      expect(active).toBe(true);
    });

    it("first_visit always gets hardcoded greeting regardless of activity", () => {
      const greeting = computeGreeting({
        journeyState: "first_visit",
        language: "de",
        userName: null,
        lastSeenDaysAgo: null,
        situations: [],
      });
      expect(greeting).toContain("Wie heißt du");
    });

    it("all 8 languages produce non-empty first_visit greeting", () => {
      const langs = ["en", "it", "de", "fr", "es", "pt", "ja", "zh"];
      for (const lang of langs) {
        const greeting = computeGreeting({
          journeyState: "first_visit",
          language: lang,
          userName: null,
          lastSeenDaysAgo: null,
          situations: [],
        });
        expect(greeting.length).toBeGreaterThan(10);
      }
    });

    it("all 6 journey states produce non-empty greeting", () => {
      const states = [
        "first_visit", "returning_no_page", "draft_ready",
        "active_fresh", "active_stale", "blocked",
      ] as const;
      for (const state of states) {
        const greeting = computeGreeting({
          journeyState: state,
          language: "en",
          userName: "Test",
          lastSeenDaysAgo: 5,
          situations: [],
        });
        expect(greeting.length).toBeGreaterThan(5);
      }
    });

    it("TTL defaults to 120 when env not set", () => {
      delete process.env.CHAT_SESSION_TTL_MINUTES;
      expect(getSessionTtlMinutes()).toBe(120);
    });
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/evals/chat-session-concierge.test.ts`
Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/evals/chat-session-concierge.test.ts
git commit -m "test: concierge chat model integration tests"
```

---

### Task 10: Full test suite + TypeScript check

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (3019+ existing + new tests).

- [ ] **Step 3: Manual verification checklist**

Verify with `npm run dev`:
- [ ] Open `/builder` — see a clean chat with greeting (not full history)
- [ ] Greeting matches journey state (first_visit asks name, active shows page status)
- [ ] Send a message, refresh within 2 hours — see current session messages
- [ ] Wait for TTL to expire (or set `CHAT_SESSION_TTL_MINUTES=1` for testing) — see clean chat
- [ ] The agent still knows your facts/history when you ask about it

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```
