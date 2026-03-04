# Agent Memory Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the agent from a constrained 7500-token context to a multi-tier memory architecture with expanded context, live page state awareness, and an async session compaction worker.

**Architecture:** Three independent phases delivered in order: (1) expand context budget and inject page state, (2) build a session compaction worker that converts raw chat history into structured semantic memory, (3) (deferred) semantic fact retrieval via embeddings. Each phase is independently shippable and testable.

**Tech Stack:** TypeScript, Vercel AI SDK v4, SQLite/Drizzle ORM, Vitest, existing `enqueueJob` / worker job pattern.

---

## Context: What exists today

- `src/lib/agent/context.ts` — `assembleContext()` assembles system prompt + context blocks, hard-capped at 7500 tokens
- `src/lib/agent/prompts.ts` — `buildSystemPrompt()` builds the system prompt, capped at 6000 tokens
- `src/app/api/chat/route.ts` — uses `getModelForTier("standard")` (Sonnet) for every chat turn
- `src/lib/services/summary-service.ts` — `generateSummary()` enqueued via `enqueueSummaryJob()` after each turn; plain text, one row per owner in `conversation_summaries`
- `src/lib/worker/index.ts` — job queue with `handlers` map; `enqueueJob(jobType, payload)` persists to `jobs` table
- Latest DB migration: `0025_presence_system.sql` → next is `0026`

## What we're building

```
Phase 1 — Context Expansion (Tasks 1–4)
  Task 1: Increase token budget + raise system prompt cap
  Task 2: Inject current page state snapshot into context
  Task 3: Switch chat turns to fast tier (Gemini Flash)
  Task 4: Tests

Phase 2 — Session Compaction Worker (Tasks 5–8)
  Task 5: DB migration for session_compaction_log
  Task 6: Session compaction service (structured LLM summarization)
  Task 7: Worker job handler (session_compaction job type)
  Task 8: Trigger compaction from route.ts
  Task 9: Tests

Phase 3 — Semantic Fact Retrieval (Task 10, deferred)
  Task 10: Architecture note + sqlite-vss spike (not implemented yet)
```

---

## Phase 1 — Context Expansion

### Task 1: Increase token budgets

**Files:**
- Modify: `src/lib/agent/context.ts` (BUDGET constants)
- Modify: `src/lib/agent/prompts.ts` (MAX_SYSTEM_PROMPT_TOKENS)

**Step 1: Update BUDGET in context.ts**

Find (lines ~67-75):
```typescript
const BUDGET = {
  soul: 1500,
  facts: 2000,
  summary: 800,
  memories: 400,
  conflicts: 200,
  recentTurns: 2600,
  total: 7500,
} as const;
```

Replace with:
```typescript
const BUDGET = {
  soul: 3000,
  facts: 8000,
  summary: 2000,
  memories: 800,
  conflicts: 400,
  pageState: 1500,
  recentTurns: 8000,
  total: 32000,
} as const;
```

**Step 2: Update CONTEXT_PROFILES to match new budgets**

In `CONTEXT_PROFILES`, update each profile's `facts.budget` and `soul.budget` to match the new BUDGET scale.
Rule of thumb: multiply old values by ~3.5 (proportional to the 7500→32000 increase):

```typescript
  first_visit: {
    facts: { include: true, budget: 8000 },
    // rest unchanged (soul/summary/etc already 0 for first_visit)
  },
  returning_no_page: {
    facts: { include: true, budget: 8000 },
    soul: { include: true, budget: 2500 },
    summary: { include: true, budget: 2000 },
    memories: { include: true, budget: 800 },
    conflicts: { include: true, budget: 400 },
    // richness/layoutIntelligence/schemaMode unchanged
  },
  draft_ready: {
    facts: { include: true, budget: 6000 },
    soul: { include: true, budget: 4000 },
    conflicts: { include: true, budget: 400 },
    // rest unchanged
  },
  active_fresh: {
    facts: { include: true, budget: 6000 },
    soul: { include: true, budget: 3000 },
    summary: { include: true, budget: 2000 },
    memories: { include: true, budget: 800 },
    conflicts: { include: true, budget: 400 },
  },
  active_stale: {
    facts: { include: true, budget: 8000 },
    soul: { include: true, budget: 3000 },
    summary: { include: true, budget: 2000 },
    memories: { include: true, budget: 800 },
    conflicts: { include: true, budget: 400 },
  },
  // blocked: all zeros — no change needed
```

Also update the cap in `sortFactsForContext` call from `50` to `120`:
```typescript
// In assembleContext(), line ~143:
const topFacts = sortFactsForContext(existingFacts, childCountMap, 120);
```

**Step 3: Update MAX_SYSTEM_PROMPT_TOKENS in prompts.ts**

Find (line ~258):
```typescript
const MAX_SYSTEM_PROMPT_TOKENS = 6000;
```
Replace with:
```typescript
const MAX_SYSTEM_PROMPT_TOKENS = 12000;
```

**Step 4: Update recentTurns cap**

In `assembleContext()`, find the `maxTurns` cap:
```typescript
const maxTurns = 12;
```
Replace with:
```typescript
const maxTurns = 20;
```

**Step 5: Run existing tests to confirm no regressions**

```bash
npx vitest run tests/evals/context-assembler.test.ts tests/evals/build-system-prompt.test.ts tests/evals/schema-mode.test.ts tests/evals/conditional-context.test.ts
```
Expected: all pass. The tests mock `buildSystemPrompt` so budget changes don't break them.

**Step 6: Commit**

```bash
git add src/lib/agent/context.ts src/lib/agent/prompts.ts
git commit -m "feat(agent): expand context budget 7.5K→32K, facts cap 50→120, turns 12→20"
```

---

### Task 2: Inject current page state snapshot into context

The agent currently cannot see what the draft page looks like without calling `inspect_page_state`. This task injects a compact page snapshot passively into every turn for steady_state users.

**Files:**
- Modify: `src/lib/agent/context.ts`
- Modify: `src/lib/agent/context.ts` (ContextProfile type + CONTEXT_PROFILES)

**Step 1: Add `pageState` to ContextProfile type**

Find the `ContextProfile` type definition:
```typescript
export type ContextProfile = {
  facts: { include: boolean; budget: number };
  soul: { include: boolean; budget: number };
  summary: { include: boolean; budget: number };
  memories: { include: boolean; budget: number };
  conflicts: { include: boolean; budget: number };
  richness: { include: boolean };
  layoutIntelligence: { include: boolean };
  schemaMode: "full" | "minimal" | "none";
};
```

Add `pageState` field:
```typescript
export type ContextProfile = {
  facts: { include: boolean; budget: number };
  soul: { include: boolean; budget: number };
  summary: { include: boolean; budget: number };
  memories: { include: boolean; budget: number };
  conflicts: { include: boolean; budget: number };
  pageState: { include: boolean; budget: number };  // NEW
  richness: { include: boolean };
  layoutIntelligence: { include: boolean };
  schemaMode: "full" | "minimal" | "none";
};
```

**Step 2: Set pageState in CONTEXT_PROFILES**

- `first_visit`: `pageState: { include: false, budget: 0 }` (no draft yet)
- `returning_no_page`: `pageState: { include: false, budget: 0 }` (no draft yet)
- `draft_ready`: `pageState: { include: true, budget: 1500 }`
- `active_fresh`: `pageState: { include: true, budget: 1500 }`
- `active_stale`: `pageState: { include: true, budget: 1500 }`
- `blocked`: `pageState: { include: false, budget: 0 }`

**Step 3: Add import for getDraft at top of context.ts**

```typescript
import { getDraft } from "@/lib/services/page-service";
```

**Step 4: Build the page state block in assembleContext()**

After the `conflictsBlock` section (around line ~200), add:

```typescript
// Page state block — compact snapshot of current draft
let pageStateBlock = "";
const includePageState = profile?.pageState.include ?? false;
if (includePageState) {
  const draft = getDraft(scope.knowledgePrimaryKey);
  if (draft?.config) {
    // Build a compact representation: layout + section list + slot assignments
    const cfg = draft.config as {
      layout?: string;
      sections?: Array<{ type: string; slot?: string; title?: string }>;
      presence?: { surface?: string; voice?: string; light?: string };
    };
    const sections = (cfg.sections ?? []).map(s =>
      `  - ${s.type}${s.slot ? ` [slot:${s.slot}]` : ""}${s.title ? ` "${s.title}"` : ""}`
    ).join("\n");
    const presence = cfg.presence
      ? `surface:${cfg.presence.surface ?? "?"} voice:${cfg.presence.voice ?? "?"} light:${cfg.presence.light ?? "?"}`
      : "not set";
    pageStateBlock = `CURRENT DRAFT PAGE:\nlayout: ${cfg.layout ?? "default"}\npresence: ${presence}\nsections:\n${sections || "  (none)"}`;
    pageStateBlock = truncateToTokenBudget(pageStateBlock, profile?.pageState.budget ?? BUDGET.pageState);
  }
}
```

**Step 5: Inject pageStateBlock into contextParts**

After the `conflictsBlock` injection, add:
```typescript
if (pageStateBlock) contextParts.push(`\n\n---\n\nPAGE STATE:\n${pageStateBlock}`);
```

Note: inject it BEFORE the auth context block so the agent sees page state before publishing guidance.

**Step 6: Add pageState to the post-assembly truncation loop**

In the `blocks` array in the truncation loop (around line ~290):
```typescript
const blocks = [
  { name: "facts", content: factsBlock, budget: BUDGET.facts },
  { name: "soul", content: soulBlock, budget: BUDGET.soul },
  { name: "summary", content: summaryBlock, budget: BUDGET.summary },
  { name: "memories", content: memoriesBlock, budget: BUDGET.memories },
  { name: "conflicts", content: conflictsBlock, budget: BUDGET.conflicts },
  { name: "pageState", content: pageStateBlock, budget: BUDGET.pageState },  // NEW
];
```

Also update the `label` switch inside the truncation loop to handle `"pageState"`:
```typescript
: b.name === "pageState"
  ? "PAGE STATE:\n"
  : "PENDING CONFLICTS:\n";
```

**Step 7: Run tests**

```bash
npx vitest run tests/evals/context-assembler.test.ts tests/evals/conditional-context.test.ts
```
Expected: all pass (getDraft is already mocked in many test setups via `vi.mock("@/lib/services/page-service", ...)`).

**Step 8: Commit**

```bash
git add src/lib/agent/context.ts
git commit -m "feat(agent): inject current draft page state into context for steady-state turns"
```

---

### Task 3: Switch chat turns to fast tier (Gemini Flash)

Currently `route.ts` uses `getModelForTier("standard")` (Sonnet) for every turn including simple conversational replies. Gemini Flash (`fast` tier) costs ~100× less, has 1M token context, and is fast. Reserve `standard` only for page generation and heavy reasoning.

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Step 1: Import fast tier helpers**

The import already has:
```typescript
import { getModelForTier, getModelIdForTier, getProviderForTier } from "@/lib/ai/provider";
```
No change needed.

**Step 2: Change the model used for streamText**

Find in `route.ts`:
```typescript
const provider = getProviderForTier("standard");
const modelId = getModelIdForTier("standard");
// ...
const model = getModelForTier("standard");
```

Replace with:
```typescript
const provider = getProviderForTier("fast");
const modelId = getModelIdForTier("fast");
// ...
const model = getModelForTier("fast");
```

Also update the `experimental_repairToolCall` handler to use `fast` as well (same variable now).

**Step 3: Verify .env has AI_MODEL_FAST set correctly**

```bash
grep AI_MODEL_FAST .env.local 2>/dev/null || grep AI_MODEL_FAST .env
```
Expected: `AI_MODEL_FAST=google:gemini-2.0-flash` (or already set in MEMORY.md).

**Step 4: Run model tier tests**

```bash
npx vitest run tests/evals/model-tiering.test.ts tests/evals/provider-tiers.test.ts
```
Expected: all pass.

**Step 5: Manual smoke test**

Start the app with `npm run dev:watch` and send one message in the builder. Confirm the response streams correctly and the page state block appears in the system prompt (add a temporary `console.log(systemPrompt.slice(0, 500))` in assembleContext if needed, remove it after).

**Step 6: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "perf(chat): switch chat turns to fast tier (Gemini Flash), reserve standard for heavy ops"
```

---

### Task 4: Tests for Phase 1

**Files:**
- Create: `tests/evals/context-expansion.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
  countFacts: vi.fn(() => 0),
}));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
}));
vi.mock("@/lib/services/summary-service", () => ({ getSummary: vi.fn(() => null) }));
vi.mock("@/lib/services/memory-service", () => ({ getActiveMemories: vi.fn(() => []) }));
vi.mock("@/lib/services/soul-service", () => ({ getActiveSoul: vi.fn(() => null) }));
vi.mock("@/lib/services/conflict-service", () => ({ getOpenConflicts: vi.fn(() => []) }));
vi.mock("@/lib/services/page-projection", () => ({ filterPublishableFacts: vi.fn(() => []) }));
vi.mock("@/lib/agent/prompts", () => ({ buildSystemPrompt: vi.fn(() => "PROMPT") }));
vi.mock("@/lib/agent/journey", () => ({ computeRelevance: vi.fn(() => 0.5) }));
vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn(() => ({})),
  mergeSessionMeta: vi.fn(),
}));
vi.mock("@/lib/connectors/magic-paste", () => ({ detectConnectorUrls: vi.fn(() => []) }));

import { assembleContext, BUDGET } from "@/lib/agent/context";
import { getDraft } from "@/lib/services/page-service";

const SCOPE = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-a"],
  knowledgePrimaryKey: "sess-a",
  currentSessionId: "sess-a",
};

const ACTIVE_FRESH_BOOTSTRAP = {
  journeyState: "active_fresh" as const,
  language: "en",
  situations: [],
  expertiseLevel: "novice" as const,
  userName: "Alice",
  lastSeenDaysAgo: 1,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
  conversationContext: null,
  archetype: "generalist" as const,
};

describe("Context expansion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("BUDGET.total is at least 32000", () => {
    expect(BUDGET.total).toBeGreaterThanOrEqual(32000);
  });

  it("pageState block absent when draft is null", () => {
    vi.mocked(getDraft).mockReturnValue(null);
    const result = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, ACTIVE_FRESH_BOOTSTRAP);
    expect(result.systemPrompt).not.toContain("CURRENT DRAFT PAGE:");
  });

  it("pageState block present when draft exists and journeyState=active_fresh", () => {
    vi.mocked(getDraft).mockReturnValue({
      config: {
        layout: "vertical",
        sections: [{ type: "hero", slot: "main" }],
        presence: { surface: "canvas", voice: "signal", light: "day" },
      } as never,
      username: "alice",
      status: "draft",
      configHash: "abc123",
      updatedAt: null,
    });
    const result = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, ACTIVE_FRESH_BOOTSTRAP);
    expect(result.systemPrompt).toContain("CURRENT DRAFT PAGE:");
    expect(result.systemPrompt).toContain("hero");
    expect(result.systemPrompt).toContain("canvas");
  });

  it("pageState block absent for first_visit", () => {
    vi.mocked(getDraft).mockReturnValue({ config: { sections: [] } as never, username: "x", status: "draft", configHash: null, updatedAt: null });
    const firstVisitBootstrap = { ...ACTIVE_FRESH_BOOTSTRAP, journeyState: "first_visit" as const };
    const result = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, firstVisitBootstrap);
    expect(result.systemPrompt).not.toContain("CURRENT DRAFT PAGE:");
  });

  it("recent turns cap is at least 20", () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));
    const result = assembleContext(SCOPE, "en", msgs, undefined, ACTIVE_FRESH_BOOTSTRAP);
    // Should keep at least 20 most recent messages
    expect(result.trimmedMessages.length).toBeGreaterThanOrEqual(20);
  });
});
```

**Step 2: Run new tests**

```bash
npx vitest run tests/evals/context-expansion.test.ts
```
Expected: all 4 tests pass.

**Step 3: Run full eval suite to confirm no regressions**

```bash
npx vitest run tests/evals/
```
Expected: 2209+ tests pass (same as before).

**Step 4: Commit**

```bash
git add tests/evals/context-expansion.test.ts
git commit -m "test(agent): add context expansion tests — budget, page state injection, turn cap"
```

---

## Phase 2 — Session Compaction Worker

The goal: after every chat session (or every N turns), an async job runs a structured LLM call that converts raw conversation history into a richer semantic summary. This replaces/augments the current plain-text `generateSummary` with a structured output that:
- Identifies new/updated facts discovered in the session
- Generates a structured session summary (what was discussed, what changed, user preferences observed)
- Detects behavioral patterns worth noting in agent memories

### Task 5: DB migration for session_compaction_log

**Files:**
- Create: `db/migrations/0026_session_compaction_log.sql`

**Step 1: Write migration**

```sql
-- Session compaction log: one row per compaction run per owner.
-- Tracks what was extracted and when, for debugging and idempotency.
CREATE TABLE IF NOT EXISTS session_compaction_log (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  session_key TEXT NOT NULL,
  cursor_message_id TEXT NOT NULL,
  facts_extracted INTEGER NOT NULL DEFAULT 0,
  facts_updated INTEGER NOT NULL DEFAULT 0,
  patterns_detected INTEGER NOT NULL DEFAULT 0,
  structured_summary TEXT,               -- JSON: { topics, factsChanged, patternsObserved, sessionMood }
  model TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',     -- ok | skipped | error
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compaction_log_owner ON session_compaction_log(owner_key, created_at);
```

**Step 2: Register migration in drizzle config**

Check `drizzle.config.ts` — migrations directory should be auto-detected as `db/migrations/`. No change needed.

**Step 3: Run migration in dev**

```bash
npx drizzle-kit migrate
```
Expected: migration applied, `session_compaction_log` table created.

**Step 4: Commit**

```bash
git add db/migrations/0026_session_compaction_log.sql
git commit -m "feat(db): add session_compaction_log table (migration 0026)"
```

---

### Task 6: Session compaction service

This is the core logic: given a session's recent messages, produce a structured summary and extract fact signals.

**Files:**
- Create: `src/lib/services/session-compaction-service.ts`

**Step 1: Write the service**

```typescript
/**
 * Session compaction service.
 *
 * Converts raw conversation messages into a structured semantic summary,
 * extracting fact signals and behavioral patterns for the agent's long-term memory.
 *
 * Called by the session_compaction worker job after a session ends or reaches
 * a message threshold.
 */
import { generateText } from "ai";
import { randomUUID } from "crypto";
import { getModelForTier, getModelIdForTier, getProviderForTier } from "@/lib/ai/provider";
import { checkBudget } from "@/lib/services/usage-service";
import { recordUsage } from "@/lib/services/usage-service";
import { sqlite } from "@/lib/db";
import type { FactRow } from "@/lib/services/kb-service";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getSummary } from "@/lib/services/summary-service";

export type CompactionInput = {
  ownerKey: string;
  sessionKey: string;
  /** All session messages to summarize (role + content pairs) */
  messages: Array<{ role: string; content: string; id?: string; createdAt?: string }>;
  /** Existing facts for this owner (used as context for the LLM) */
  existingFacts?: FactRow[];
};

export type CompactionResult = {
  success: boolean;
  factsExtracted: number;
  factsUpdated: number;
  patternsDetected: number;
  structuredSummary: CompactionSummary | null;
  error?: string;
};

export type CompactionSummary = {
  /** Key topics discussed this session */
  topics: string[];
  /** Facts that were changed or confirmed (human-readable descriptions) */
  factsChanged: string[];
  /** Behavioral patterns observed (communication style, preferences) */
  patternsObserved: string[];
  /** Overall session mood/tone */
  sessionMood: "productive" | "exploratory" | "corrective" | "casual";
  /** Key sentences the agent should remember about this session */
  keyTakeaways: string[];
};

const COMPACTION_PROMPT = (
  messagesText: string,
  existingFactsSummary: string,
  existingSummary: string,
) => `You are analyzing a conversation between a user and an AI assistant that is building their personal web page.

${existingSummary ? `PREVIOUS CONTEXT:\n${existingSummary}\n\n` : ""}${existingFactsSummary ? `EXISTING KNOWN FACTS:\n${existingFactsSummary}\n\n` : ""}CONVERSATION TO ANALYZE:
${messagesText}

Produce a JSON object with this exact shape:
{
  "topics": ["string"],           // 2-5 key topics discussed
  "factsChanged": ["string"],     // what facts were added/changed (e.g. "Added job at Acme Corp as CTO")
  "patternsObserved": ["string"], // behavioral patterns (e.g. "User prefers bullet points over prose", "User is detail-oriented about dates")
  "sessionMood": "productive|exploratory|corrective|casual",
  "keyTakeaways": ["string"]      // 2-3 most important things to remember about this session
}

Rules:
- Only report facts that were EXPLICITLY mentioned in this conversation
- "patternsObserved" is about HOW the user communicates, not WHAT they said
- Keep each string under 100 characters
- Output ONLY valid JSON — no markdown, no explanation`;

/**
 * Run session compaction for a single session.
 * Returns a structured summary; does NOT write to DB (caller handles persistence).
 */
export async function runSessionCompaction(
  input: CompactionInput,
): Promise<CompactionResult> {
  const budget = checkBudget();
  if (!budget.allowed) {
    return { success: false, factsExtracted: 0, factsUpdated: 0, patternsDetected: 0, structuredSummary: null, error: "budget_exceeded" };
  }

  if (input.messages.length < 4) {
    return { success: false, factsExtracted: 0, factsUpdated: 0, patternsDetected: 0, structuredSummary: null, error: "insufficient_messages" };
  }

  const messagesText = input.messages
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n");

  const existingFacts = input.existingFacts
    ?? getActiveFacts(input.sessionKey, [input.ownerKey]);
  const existingFactsSummary = existingFacts.length > 0
    ? existingFacts.slice(0, 30).map(f => `- ${f.category}/${f.key}: ${JSON.stringify(f.value)}`).join("\n")
    : "";

  const existingSummary = getSummary(input.ownerKey) ?? "";

  const prompt = COMPACTION_PROMPT(messagesText, existingFactsSummary, existingSummary);

  try {
    const model = getModelForTier("fast"); // use fast tier — this is background work
    const modelId = getModelIdForTier("fast");
    const provider = getProviderForTier("fast");

    const result = await generateText({
      model,
      prompt,
      maxTokens: 600,
    });

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    if (tokensIn > 0 || tokensOut > 0) {
      recordUsage(provider, modelId, tokensIn, tokensOut);
    }

    let parsed: CompactionSummary | null = null;
    try {
      parsed = JSON.parse(result.text.trim()) as CompactionSummary;
    } catch {
      // LLM returned non-JSON — extract best effort
      console.warn("[compaction] LLM returned non-JSON, storing raw text");
      parsed = {
        topics: [],
        factsChanged: [],
        patternsObserved: [],
        sessionMood: "casual",
        keyTakeaways: [result.text.slice(0, 200)],
      };
    }

    return {
      success: true,
      factsExtracted: parsed.factsChanged.filter(f => f.toLowerCase().startsWith("added")).length,
      factsUpdated: parsed.factsChanged.filter(f => f.toLowerCase().startsWith("updated")).length,
      patternsDetected: parsed.patternsObserved.length,
      structuredSummary: parsed,
    };
  } catch (error) {
    console.error("[compaction] Failed:", error);
    return {
      success: false,
      factsExtracted: 0,
      factsUpdated: 0,
      patternsDetected: 0,
      structuredSummary: null,
      error: String(error),
    };
  }
}

/**
 * Persist compaction result to session_compaction_log.
 */
export function persistCompactionLog(
  ownerKey: string,
  sessionKey: string,
  cursorMessageId: string,
  result: CompactionResult,
  modelId: string,
  tokensIn: number,
  tokensOut: number,
): void {
  sqlite.prepare(`
    INSERT INTO session_compaction_log
      (id, owner_key, session_key, cursor_message_id, facts_extracted, facts_updated,
       patterns_detected, structured_summary, model, tokens_in, tokens_out, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    ownerKey,
    sessionKey,
    cursorMessageId,
    result.factsExtracted,
    result.factsUpdated,
    result.patternsDetected,
    result.structuredSummary ? JSON.stringify(result.structuredSummary) : null,
    modelId,
    tokensIn,
    tokensOut,
    result.success ? "ok" : "error",
    result.error ?? null,
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep session-compaction
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/lib/services/session-compaction-service.ts
git commit -m "feat(agent): add session compaction service — structured LLM-powered session analysis"
```

---

### Task 7: Worker job handler for session_compaction

**Files:**
- Modify: `src/lib/worker/index.ts`

**Step 1: Import the compaction service at the top of index.ts**

```typescript
import { runSessionCompaction, persistCompactionLog } from "@/lib/services/session-compaction-service";
import { getModelIdForTier } from "@/lib/ai/provider";
```

**Step 2: Add the job handler**

In the `handlers` map (after the existing entries), add:

```typescript
handlers["session_compaction"] = async (payload: Record<string, unknown>) => {
  const ownerKey = payload.ownerKey as string;
  const sessionKey = payload.sessionKey as string;

  if (!ownerKey || !sessionKey) {
    console.warn("[worker] session_compaction: missing ownerKey or sessionKey", payload);
    return;
  }

  // Fetch messages from DB for this session (last 40 messages max)
  const rows = sqlite.prepare(`
    SELECT id, role, content, created_at as createdAt
    FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
    LIMIT 40
  `).all(sessionKey) as Array<{ id: string; role: string; content: string; createdAt: string }>;

  if (rows.length < 4) {
    console.info(`[worker] session_compaction: skipping ${sessionKey} — only ${rows.length} messages`);
    return;
  }

  const cursorMessageId = rows[rows.length - 1].id;
  const result = await runSessionCompaction({ ownerKey, sessionKey, messages: rows });

  // Persist log
  persistCompactionLog(
    ownerKey,
    sessionKey,
    cursorMessageId,
    result,
    getModelIdForTier("fast"),
    0, // tokens tracked inside runSessionCompaction via recordUsage
    0,
  );

  if (result.success && result.structuredSummary) {
    // Inject patterns into agent memories (Tier 3) if any were observed
    const patterns = result.structuredSummary.patternsObserved;
    for (const pattern of patterns.slice(0, 2)) { // max 2 per session
      const hash = Buffer.from(pattern).toString("base64").slice(0, 32);
      sqlite.prepare(`
        INSERT INTO agent_memory (id, owner_key, content, memory_type, content_hash, confidence, is_active)
        VALUES (?, ?, ?, 'pattern', ?, 0.7, 1)
        ON CONFLICT DO NOTHING
      `).run(randomUUID(), ownerKey, pattern, hash);
    }

    console.info(`[worker] session_compaction done: ${sessionKey} — ${result.factsExtracted} extracted, ${result.patternsDetected} patterns`);
  } else {
    console.warn(`[worker] session_compaction failed: ${sessionKey} — ${result.error}`);
  }
};
```

Note: you need to import `sqlite` from `@/lib/db` and `randomUUID` from `crypto` if not already imported.

**Step 3: Run tests**

```bash
npx vitest run tests/evals/scheduler.test.ts
```
Expected: pass (scheduler tests don't touch job handlers).

**Step 4: Commit**

```bash
git add src/lib/worker/index.ts
git commit -m "feat(worker): add session_compaction job handler — extracts patterns into Tier 3 memory"
```

---

### Task 8: Trigger compaction from route.ts

Currently `route.ts` calls `enqueueSummaryJob` after each turn. We add a `session_compaction` job alongside it, with a debounce: only enqueue if session has >= 6 messages.

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Step 1: Import enqueueJob**

```typescript
import { enqueueJob } from "@/lib/worker/index";
```

**Step 2: Add compaction trigger inside onFinish**

After `enqueueSummaryJob(...)`, add:

```typescript
// Enqueue session compaction job (best-effort, runs in background worker)
// Trigger at message milestones: every 10 messages or on explicit end signals.
try {
  const sessionMessageCount = multiUser
    ? (sqlite.prepare("SELECT message_count FROM sessions WHERE id = ?").get(messageSessionId) as { message_count: number } | undefined)?.message_count ?? 0
    : 0;
  const shouldCompact = sessionMessageCount > 0 && sessionMessageCount % 10 === 0;
  if (shouldCompact) {
    enqueueJob("session_compaction", {
      ownerKey: effectiveScope.cognitiveOwnerKey,
      sessionKey: writeSessionId,
    });
  }
} catch (e) {
  // best-effort: never block the response
  console.warn("[chat] Failed to enqueue session_compaction:", e);
}
```

**Step 3: Run chat route tests**

```bash
npx vitest run tests/evals/chat-route-bootstrap.test.ts tests/evals/chat-context-integration.test.ts
```
Expected: all pass.

**Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): trigger session_compaction worker job at 10-message milestones"
```

---

### Task 9: Tests for Phase 2

**Files:**
- Create: `tests/evals/session-compaction.test.ts`

**Step 1: Write tests**

```typescript
/**
 * Tests for the session compaction service.
 * Mocks the LLM call to test pure logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));
vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: vi.fn(() => ({ allowed: true })),
  recordUsage: vi.fn(),
}));
vi.mock("@/lib/ai/provider", () => ({
  getModelForTier: vi.fn(() => "mock-model"),
  getModelIdForTier: vi.fn(() => "gemini-2.0-flash"),
  getProviderForTier: vi.fn(() => "google"),
}));
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
}));
vi.mock("@/lib/services/summary-service", () => ({
  getSummary: vi.fn(() => null),
}));

import { runSessionCompaction } from "@/lib/services/session-compaction-service";
import { generateText } from "ai";

const MESSAGES = [
  { role: "user", content: "Hi, I'm Alice, a product manager at Stripe", id: "m1" },
  { role: "assistant", content: "Great to meet you, Alice! I've saved that.", id: "m2" },
  { role: "user", content: "I also have 8 years of experience and I love hiking", id: "m3" },
  { role: "assistant", content: "Added those details to your profile.", id: "m4" },
  { role: "user", content: "Can you make my page layout vertical?", id: "m5" },
  { role: "assistant", content: "Done, switched to vertical layout.", id: "m6" },
];

const VALID_JSON_RESPONSE = JSON.stringify({
  topics: ["professional background", "layout preferences"],
  factsChanged: ["Added job at Stripe as product manager", "Added hiking as activity"],
  patternsObserved: ["User prefers concise responses"],
  sessionMood: "productive",
  keyTakeaways: ["Alice is PM at Stripe with 8 years experience", "Prefers vertical layout"],
});

describe("runSessionCompaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success: false for fewer than 4 messages", async () => {
    const result = await runSessionCompaction({
      ownerKey: "owner-1",
      sessionKey: "sess-1",
      messages: MESSAGES.slice(0, 2),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("insufficient_messages");
  });

  it("returns success: false when budget exceeded", async () => {
    const { checkBudget } = await import("@/lib/services/usage-service");
    vi.mocked(checkBudget).mockReturnValueOnce({ allowed: false, warningMessage: "over budget" });
    const result = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MESSAGES });
    expect(result.success).toBe(false);
    expect(result.error).toBe("budget_exceeded");
  });

  it("returns structured summary on valid LLM response", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: VALID_JSON_RESPONSE,
      usage: { promptTokens: 100, completionTokens: 50 },
    } as never);

    const result = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MESSAGES });
    expect(result.success).toBe(true);
    expect(result.structuredSummary?.topics).toContain("professional background");
    expect(result.structuredSummary?.sessionMood).toBe("productive");
    expect(result.patternsDetected).toBe(1);
    expect(result.factsExtracted).toBe(2); // "Added ..." strings
  });

  it("handles non-JSON LLM response gracefully", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "I analyzed the conversation and found some facts.",
      usage: { promptTokens: 50, completionTokens: 20 },
    } as never);

    const result = await runSessionCompaction({ ownerKey: "o", sessionKey: "s", messages: MESSAGES });
    expect(result.success).toBe(true);
    expect(result.structuredSummary?.keyTakeaways[0]).toContain("I analyzed");
  });
});
```

**Step 2: Run new tests**

```bash
npx vitest run tests/evals/session-compaction.test.ts
```
Expected: all 4 tests pass.

**Step 3: Run full suite**

```bash
npx vitest run tests/evals/
```
Expected: 2213+ tests pass (4 new tests added).

**Step 4: Commit**

```bash
git add tests/evals/session-compaction.test.ts
git commit -m "test(agent): add session compaction tests — budget guard, JSON parsing, pattern detection"
```

---

## Phase 3 — Semantic Fact Retrieval (Deferred)

> **Note:** This phase is documented as architecture but NOT implemented in this plan. It requires a spike to evaluate SQLite vector extensions (sqlite-vss or sqlite-vec) for the local-first constraint.

**Problem:** `sortFactsForContext` always returns the same ~120 most relevant facts regardless of what the user is asking about. If a user asks about their education, the agent gets a mix of all facts sorted by recency × confidence.

**Proposed solution:**
1. Add a `facts_embedding` table: `(fact_id TEXT PK, embedding BLOB)`
2. On `create_fact` / `update_fact`, enqueue an `embed_fact` worker job that calls a fast embedding model and stores the result
3. In `assembleContext()`, embed the latest user message, run approximate nearest-neighbor search, return top 20 semantically relevant facts + top 10 most recent facts
4. The `sortFactsForContext` function becomes `retrieveFactsForQuery(query: string, ...)`

**Estimated effort:** 2-3 days
**Gate:** Requires benchmarking embedding cost vs retrieval quality on real OpenSelf profiles.

---

## Verification Checklist

Before considering Phase 1 + 2 complete:

- [ ] `npx vitest run tests/evals/` → all tests pass
- [ ] `npx tsc --noEmit` → no TypeScript errors
- [ ] Manual builder test: send 10+ messages, verify page state appears in context (add temporary log)
- [ ] Manual builder test: send message referencing a past fact not in recent messages → agent recalls it (expanded context)
- [ ] Worker test: trigger `session_compaction` job manually via `enqueueJob`, verify log row in DB
- [ ] Check `llm_usage_daily` after a test session: cost should be lower (Flash vs Sonnet)

---

## Rollback Plan

All changes are additive or conservative substitutions:
- **Context budget increase**: safe — just shows more data to the model, doesn't break anything
- **Page state injection**: safe — skipped when `getDraft` returns null (first_visit, etc.)
- **Fast tier**: if Gemini Flash quality is insufficient for complex tasks, revert `route.ts` line; `generate_page` still uses the fast model since tools call the model already passed in
- **Compaction worker**: fully async/best-effort; if it fails, it logs and moves on — no impact on chat turns
