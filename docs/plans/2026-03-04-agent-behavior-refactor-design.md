# Agent Behavior Refactor — Design Document
**Date:** 2026-03-04
**Approach:** C — Prompt Architecture + Targeted Fixes
**Goal:** Maximum conversational naturalness. Fix all identified bugs, prevent future regressions by construction.

---

## Problem Summary

22 issues identified across 6 categories in the agent prompt/context pipeline:

| Category | Issues | Severity |
|---|---|---|
| A — Prompt conflicts | 5 | High |
| B — Welcome message alignment | 2 | High |
| C — Archetype & soul system | 3 | Medium-High |
| D — Facts context quality | 3 | Medium |
| E — Interaction flow | 4 | Medium |
| F — Dead code / token efficiency | 5 | Low-Medium |

Root cause: the prompt assembly pipeline has no structural constraints. Situation directives can be injected into incompatible journey states (silent conflicts), facts are sorted wrong (newest missing), archetype is never refreshed, and the personality layer is too vague to produce consistent naturalistic output.

---

## Architecture Overview

The refactor introduces **constraints by construction** rather than runtime patches:

1. `DIRECTIVE_POLICY` — single matrix from which eligibility, priority, and conflict rules are derived
2. `validateDirectivePolicy()` — static validator at startup/CI
3. `schemaMode: "full" | "minimal" | "none"` — token-efficient schema injection per journey state
4. Archetype TTL + identity-change invalidation
5. Soul proposal cooldown at owner level (DB-backed)
6. Unified welcome message source of truth
7. Rewritten `CORE_CHARTER` with explicit register, opening bans, emoji policy, language switching

---

## Section 1 — Directive Policy Matrix

### Single Source of Truth: `DIRECTIVE_POLICY`

**File:** `src/lib/agent/policies/directive-registry.ts` (new)

```typescript
// Type-safe context mapping: each Situation maps to exactly the fields it needs
type SituationContextMap = {
  has_pending_proposals: Pick<SituationContext, "pendingProposalCount" | "pendingProposalSections">;
  has_thin_sections:     Pick<SituationContext, "thinSections">;
  has_stale_facts:       Pick<SituationContext, "staleFacts">;
  has_open_conflicts:    Pick<SituationContext, "openConflicts">;
  has_archivable_facts:  Pick<SituationContext, "archivableFacts">;
  has_recent_import:     Pick<SituationContext, "importGapReport">;
  has_name:              Pick<SituationContext, never>;
  has_soul:              Pick<SituationContext, never>;
};

type DirectiveEntry<S extends Situation> = {
  priority: number;               // 1 = highest. Lower number wins on conflict.
  tieBreak: string;               // Situation name used as deterministic secondary sort.
  eligibleStates: JourneyState[]; // Whitelist — single source of truth.
  incompatibleWith: Situation[];  // Directive vs directive conflicts (must be symmetric OR
                                  // documented as intentionally asymmetric).
  build: (ctx: SituationContextMap[S]) => string;
};

export const DIRECTIVE_POLICY: { [S in Situation]: DirectiveEntry<S> } = {
  has_pending_proposals: {
    priority: 1,
    tieBreak: "has_pending_proposals",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => pendingProposalsDirective(ctx.pendingProposalCount, ctx.pendingProposalSections),
  },
  has_thin_sections: {
    priority: 3,
    tieBreak: "has_thin_sections",
    eligibleStates: ["returning_no_page", "draft_ready", "active_stale"],
    // active_fresh EXCLUDED — by construction, not comment
    incompatibleWith: ["has_archivable_facts"],
    build: (ctx) => thinSectionsDirective(ctx.thinSections),
  },
  has_stale_facts: {
    priority: 2,
    tieBreak: "has_stale_facts",
    eligibleStates: ["active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => staleFactsDirective(ctx.staleFacts),
  },
  has_open_conflicts: {
    priority: 1,
    tieBreak: "has_open_conflicts",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => openConflictsDirective(ctx.openConflicts),
  },
  has_archivable_facts: {
    priority: 4,
    tieBreak: "has_archivable_facts",
    eligibleStates: ["active_stale"],
    incompatibleWith: ["has_thin_sections"],
    build: (ctx) => archivableFactsDirective(ctx.archivableFacts),
  },
  has_recent_import: {
    priority: 1,
    tieBreak: "has_recent_import",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => recentImportDirective(ctx.importGapReport!),
  },
  has_name: { priority: 99, tieBreak: "has_name", eligibleStates: [], incompatibleWith: [], build: () => "" },
  has_soul: { priority: 99, tieBreak: "has_soul", eligibleStates: [], incompatibleWith: [], build: () => "" },
};
```

### `getSituationDirectives()` — updated signature

```typescript
export function getSituationDirectives(
  situations: Situation[],
  journeyState: JourneyState,
  context: SituationContext,
): string {
  // Guard by construction: first_visit never receives situation directives
  if (journeyState === "first_visit") return "";

  const eligible = situations
    .filter(s => DIRECTIVE_POLICY[s].eligibleStates.includes(journeyState))
    .sort((a, b) => {
      const pa = DIRECTIVE_POLICY[a].priority;
      const pb = DIRECTIVE_POLICY[b].priority;
      if (pa !== pb) return pa - pb;
      return DIRECTIVE_POLICY[a].tieBreak.localeCompare(DIRECTIVE_POLICY[b].tieBreak); // deterministic
    });

  const resolved = resolveIncompatibilities(eligible, journeyState);
  return resolved.map(s => DIRECTIVE_POLICY[s].build(getCtxFor(s, context))).join("\n\n");
}
```

### Conflict resolution with environment-aware reporting

```typescript
function resolveIncompatibilities(
  eligible: Situation[],
  journeyState: JourneyState,
): Situation[] {
  const dropped = new Set<Situation>();
  for (const s of eligible) {
    if (dropped.has(s)) continue;
    for (const incompatible of DIRECTIVE_POLICY[s].incompatibleWith) {
      if (eligible.includes(incompatible) && !dropped.has(incompatible)) {
        // s has lower priority number → s wins
        const msg = `[directive-registry] Conflict: ${s} (p=${DIRECTIVE_POLICY[s].priority}) ` +
                    `vs ${incompatible} (p=${DIRECTIVE_POLICY[incompatible].priority}) in ${journeyState} ` +
                    `— ${incompatible} dropped`;
        if (process.env.NODE_ENV === "test") throw new DirectiveConflictError(msg); // CI hard fail
        if (process.env.NODE_ENV === "development") console.warn(msg);
        // prod: resolve + structured log (sampled)
        logEvent("directive_conflict_resolved", {
          winner: s,
          dropped: incompatible,
          journeyState,
          winnerPriority: DIRECTIVE_POLICY[s].priority,
          droppedPriority: DIRECTIVE_POLICY[incompatible].priority,
        });
        dropped.add(incompatible);
      }
    }
  }
  return eligible.filter(s => !dropped.has(s));
}
```

### Type-safe `getCtxFor` with runtime validation

```typescript
const SITUATION_REQUIRED_KEYS: { [S in Situation]: (keyof SituationContext)[] } = {
  has_thin_sections: ["thinSections"],
  has_stale_facts: ["staleFacts"],
  has_pending_proposals: ["pendingProposalCount", "pendingProposalSections"],
  has_open_conflicts: ["openConflicts"],
  has_archivable_facts: ["archivableFacts"],
  has_recent_import: ["importGapReport"],
  has_name: [],
  has_soul: [],
};

function getCtxFor<S extends Situation>(
  situation: S,
  context: SituationContext,
): SituationContextMap[S] | null {
  for (const key of SITUATION_REQUIRED_KEYS[situation]) {
    if (context[key] === undefined || context[key] === null) {
      const msg = `[directive-registry] Missing context field "${key}" for situation "${situation}"`;
      if (process.env.NODE_ENV !== "production") throw new Error(msg);
      logEvent("directive_context_missing_field", { situation, field: key });
      return null; // drop directive, do not cast
    }
  }
  return context as SituationContextMap[S];
}

// In getSituationDirectives — handle null:
const ctx = getCtxFor(s, context);
if (ctx === null) continue; // drop silently in prod (already logged)
```

### Static policy validator (startup + CI)

```typescript
// src/lib/agent/policies/validate-directive-policy.ts (new)
export function validateDirectivePolicy(): void {
  for (const [situation, entry] of Object.entries(DIRECTIVE_POLICY)) {
    // No self-conflict
    if (entry.incompatibleWith.includes(situation as Situation)) {
      throw new Error(`[DIRECTIVE_POLICY] Self-conflict: ${situation}`);
    }
    // No empty eligibleStates (must be intentional — add "intentionallyEmpty: true" flag if needed)
    // has_name and has_soul are intentionally empty (they're signals, not directives)
    const intentionallyEmpty = ["has_name", "has_soul"];
    if (entry.eligibleStates.length === 0 && !intentionallyEmpty.includes(situation)) {
      throw new Error(`[DIRECTIVE_POLICY] Empty eligibleStates for ${situation} — intentional?`);
    }
    // Symmetry check for incompatibleWith
    for (const other of entry.incompatibleWith) {
      if (!DIRECTIVE_POLICY[other].incompatibleWith.includes(situation as Situation)) {
        throw new Error(`[DIRECTIVE_POLICY] Asymmetric incompatibility: ${situation} → ${other} but not reverse`);
      }
    }
    // Valid references
    for (const state of entry.eligibleStates) {
      if (!ALL_JOURNEY_STATES.includes(state)) {
        throw new Error(`[DIRECTIVE_POLICY] Unknown journeyState "${state}" in ${situation}.eligibleStates`);
      }
    }
  }
}

// Called in: app startup (route.ts or lib/agent/index.ts), CI via dedicated test
```

### Tests

```typescript
// tests/unit/directive-matrix.test.ts

// 1. Single situation × all states (snapshot)
for (const state of ALL_JOURNEY_STATES) {
  for (const situation of ALL_SITUATIONS) {
    it(`[${state}] + [${situation}]`, () => {
      expect(getSituationDirectives([situation], state, mockContext)).toMatchSnapshot();
    });
  }
}

// 2. Combination tests — verify incompatibleWith + priority
it("[active_stale] has_thin_sections + has_archivable_facts → thin_sections wins (priority 3 < 4)", () => {
  const result = getSituationDirectives(
    ["has_thin_sections", "has_archivable_facts"], "active_stale", mockContext
  );
  expect(result).toContain("THIN SECTIONS");
  expect(result).not.toContain("ARCHIVABLE FACTS");
});

it("[active_fresh] has_thin_sections → empty (not eligible)", () => {
  expect(getSituationDirectives(["has_thin_sections"], "active_fresh", mockContext)).toBe("");
});

it("first_visit always returns empty regardless of situations", () => {
  for (const s of ALL_SITUATIONS) {
    expect(getSituationDirectives([s], "first_visit", mockContext)).toBe("");
  }
});

// 3. Static validator passes
it("DIRECTIVE_POLICY passes static validation", () => {
  expect(() => validateDirectivePolicy()).not.toThrow();
});
```

---

## Section 2 — Facts Context Quality

### 2a — Relevance-sorted facts with guaranteed recency quota

**File:** `src/lib/agent/context.ts`

```typescript
// After loading existingFacts, before slicing to 50:

// Guarantee: always include the 5 most recently updated facts
const sortedByRecency = [...existingFacts].sort(
  (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
);
const recentGuaranteed = sortedByRecency.slice(0, 5);
const recentIds = new Set(recentGuaranteed.map(f => f.id));

// Score remaining facts by relevance (uses childCountMap from BootstrapData)
const rest = existingFacts
  .filter(f => !recentIds.has(f.id))
  .map(f => ({ ...f, score: computeRelevance(f, childCountMap) }))
  .sort((a, b) => b.score - a.score ||
    new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime() // tie-break: updatedAt desc
  )
  .slice(0, 45); // 5 guaranteed + 45 scored = 50 total

const topFacts = [...recentGuaranteed, ...rest];
```

`childCountMap` is added to `BootstrapData` interface and passed from `journey.ts` to `assembleContext`.

### 2b — `schemaMode` in `ContextProfile`

```typescript
type ContextProfile = {
  // ... existing fields ...
  schemaMode: "full" | "minimal" | "none";  // replaces includeSchemaReference: boolean
};

export const CONTEXT_PROFILES: Record<JourneyState, ContextProfile> = {
  first_visit:        { ..., schemaMode: "minimal" }, // ~300 tokens (was full ~1800)
  returning_no_page:  { ..., schemaMode: "full"    }, // complex operations possible
  draft_ready:        { ..., schemaMode: "none"    }, // page already built
  active_fresh:       { ..., schemaMode: "none"    }, // quick updates only
  active_stale:       { ..., schemaMode: "minimal" }, // targeted updates
  blocked:            { ..., schemaMode: "none"    }, // no tool calls
};
```

`buildSystemPrompt()` in `prompts.ts` switches on `schemaMode`:
- `"full"` → inject `FACT_SCHEMA_REFERENCE + DATA_MODEL_REFERENCE`
- `"minimal"` → inject `buildMinimalSchemaForOnboarding()` (~300 tokens)
- `"none"` → inject nothing

```typescript
function buildMinimalSchemaForOnboarding(): string {
  return `FACT CATEGORIES (most common):
- identity: {full?, role?, city?, tagline?}
- experience: {role, company, start?: "YYYY-MM"|null, end?: "YYYY-MM"|null, status: "current"|"past"}
- education: {institution, degree?, field?, period?}
- skill: {name, level?: "beginner"|"intermediate"|"advanced"|"expert"}
- interest: {name, detail?}
- project: {name, description?, url?, status?: "active"|"completed"}
- language: {language, proficiency?: "native"|"fluent"|"advanced"|"intermediate"|"beginner"}
After collecting name + role + 2-3 more facts, call generate_page.`;
}
```

**Estimated token savings per session:**
- `draft_ready`/`active_fresh`: ~1800 tokens/turn
- `first_visit`: ~1500 tokens/turn (full → minimal)

### 2c — `BootstrapData` updated

```typescript
export interface BootstrapData {
  facts: FactRow[];
  soul: { compiled: string | null } | null;
  openConflictRecords: ConflictRow[];
  publishableFacts: FactRow[];
  childCountMap: Map<string, number>;  // NEW — avoids re-query in assembleContext
}
```

---

## Section 3 — Archetype & Soul System

### 3a — Archetype TTL + identity-change invalidation

**File:** `src/lib/agent/journey.ts`

```typescript
const ARCHETYPE_TTL_DAYS = 14;

function shouldRedetectArchetype(meta: SessionMeta, facts: FactRow[]): boolean {
  // 1. Never detected
  if (!meta.archetype || !meta.archetypeDetectedAt) return true;
  // 2. TTL expired
  if (daysBetween(new Date(meta.archetypeDetectedAt as string), new Date()) > ARCHETYPE_TTL_DAYS) return true;
  // 3. identity/role updated after detection (prioritize role > title, most recent updatedAt)
  const roleFact = facts
    .filter(f => f.category === "identity" && (f.key === "role" || f.key === "title"))
    .sort((a, b) => {
      // role beats title; then most recent updatedAt
      if (a.key === "role" && b.key !== "role") return -1;
      if (b.key === "role" && a.key !== "role") return 1;
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    })[0];
  if (roleFact?.updatedAt && meta.archetypeDetectedAt) {
    return new Date(roleFact.updatedAt) > new Date(meta.archetypeDetectedAt as string);
  }
  return false;
}

// In assembleBootstrapPayload:
if (!shouldRedetectArchetype(meta, facts)) {
  archetype = meta.archetype as Archetype;
} else {
  const roleStr = /* most recent role/title */ ...;
  archetype = refineArchetype(facts, detectArchetypeFromSignals(roleStr, lastUserMessage ?? null));
  mergeSessionMeta(anchorSessionId, {
    archetype,
    archetypeDetectedAt: new Date().toISOString(),
  });
}
```

### 3b — Soul proposal cooldown at owner level

**Do not use session meta.** Query `soul_change_proposals` directly:

```typescript
// In assembleBootstrapPayload, before proposeSoulChange:
const SOUL_PROPOSAL_COOLDOWN_DAYS = 30;

const lastRejectedRow = sqlite
  .prepare(`
    SELECT MAX(created_at) as latest
    FROM soul_change_proposals
    WHERE owner_key = ? AND status = 'rejected'
  `)
  .get(ownerKey) as { latest: string | null } | undefined;

const rejectedRecently = lastRejectedRow?.latest &&
  daysBetween(new Date(lastRejectedRow.latest), new Date()) < SOUL_PROPOSAL_COOLDOWN_DAYS;

if (archetype !== "generalist" && !soul && !rejectedRecently && pendingSoulProposals.length === 0) {
  proposeSoulChange(...);
}
```

Owner-scoped (not session-scoped). Survives across multiple sessions. Correctly handles the case where the user rejected a proposal 10 days ago.

---

## Section 4 — Welcome Message Unification

### Single function: `buildWelcomeMessage()`

**File:** `src/components/chat/ChatPanel.tsx`

```typescript
// Replace getWelcomeMessage() + getSmartWelcomeMessage() with:
function buildWelcomeMessage(
  language: string,
  bootstrap: BootstrapResponse | null,
): StoredMessage {
  const lang = language || "en";

  if (!bootstrap) {
    // No bootstrap → safe fallback: use first_visit welcome (not "tell me about yourself")
    return { id: "welcome", role: "assistant", content: FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en };
  }

  switch (bootstrap.journeyState) {
    case "first_visit":
      return { id: "welcome", role: "assistant", content: FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en };

    case "blocked":
      // Use quota exhausted message — NOT generic onboarding welcome
      return { id: "welcome", role: "assistant", content: QUOTA_EXHAUSTED_MESSAGES[lang] ?? QUOTA_EXHAUSTED_MESSAGES.en };

    case "returning_no_page":
      return { id: "welcome", role: "assistant", content: RETURNING_WELCOME[lang] ?? RETURNING_WELCOME.en };

    case "draft_ready":
      return { id: "welcome", role: "assistant", content: DRAFT_READY_WELCOME[lang] ?? DRAFT_READY_WELCOME.en };

    case "active_fresh":
    case "active_stale": {
      const name = bootstrap.userName;
      const templates: Record<string, string> = {
        en: name ? `Hey ${name}! What would you like to update?` : "Hey! What would you like to update?",
        it: name ? `Ciao ${name}! Cosa vuoi aggiornare?` : "Ciao! Cosa vuoi aggiornare?",
        // ... other languages
      };
      return { id: "welcome", role: "assistant", content: templates[lang] ?? templates.en };
    }

    default:
      return { id: "welcome", role: "assistant", content: FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en };
  }
}
```

**Remove:** `WELCOME_MESSAGES` (legacy), `getWelcomeMessage()`, `getSmartWelcomeMessage()`.

**Update all dedup check points** (~82-154, ~387-392, ~618-628 in ChatPanel.tsx):
- Replace `allWelcomeTexts` set with a single check: `msg.id === "welcome"` — since all welcome messages share the same `id: "welcome"`, dedup becomes trivial and language-agnostic.

**Blocked welcome + LimitReachedUI coherence:**
- `buildWelcomeMessage("blocked")` uses `QUOTA_EXHAUSTED_MESSAGES`
- `LimitReachedUI` uses the same `QUOTA_EXHAUSTED_MESSAGES` constants
- One source for copy, consistent state presentation

---

## Section 5 — Prompt Fixes

### 5a — `STEP_EXHAUSTION_FALLBACK` — fix R3 violation

**File:** `src/app/api/chat/route.ts`

Journey-state-aware fallback, active closing only:

```typescript
const STEP_EXHAUSTION_FALLBACK: Record<JourneyState, Record<string, string>> = {
  first_visit: {
    en: "I've saved what you shared — take a look at the preview on the right!",
    it: "Ho salvato quello che mi hai detto — dai un'occhiata all'anteprima a destra!",
    de: "Ich habe gespeichert, was du mir erzählt hast — schau dir die Vorschau rechts an!",
    fr: "J'ai enregistré ce que tu m'as dit — jette un œil à l'aperçu à droite !",
    es: "He guardado lo que me contaste — ¡echa un vistazo a la vista previa a la derecha!",
  },
  returning_no_page: {
    en: "Done with that. Want me to build your page now?",
    it: "Fatto. Vuoi che costruisca la tua pagina adesso?",
    // ...
  },
  draft_ready: {
    en: "Done. Publish now, or want to tweak something first?",
    it: "Fatto. Pubblichiamo adesso, o vuoi modificare qualcosa prima?",
    // ...
  },
  active_fresh: {
    en: "Updated. Anything else to change?",
    it: "Aggiornato. Vuoi cambiare altro?",
    // ...
  },
  active_stale: {
    en: "Done — want to republish with these updates?",
    it: "Fatto — vuoi ripubblicare con questi aggiornamenti?",
    // ...
  },
  blocked: {
    en: "You've reached the message limit. Pick a username to keep going!",
    it: "Hai raggiunto il limite messaggi. Scegli un username per continuare!",
    // ...
  },
};

// In onFinish:
const fallback = STEP_EXHAUSTION_FALLBACK[bootstrap.journeyState]?.[sessionLanguage]
  ?? STEP_EXHAUSTION_FALLBACK[bootstrap.journeyState]?.en
  ?? STEP_EXHAUSTION_FALLBACK.active_fresh.en;
```

### 5b — Quota CTA: anonymous-only, timing-aware

**Policy decision:** Quota CTA is anonymous-only by design. Authenticated users (quota 200) hit `LimitReachedUI` via HTTP 429 — the agent does not need to manage this.

```typescript
// context.ts — quota warning block
// quotaInfo is only populated for anonymous users (route.ts ~251)
if (quotaInfo && quotaInfo.remaining <= 3) {
  contextParts.push(`\n\n---\n\nMESSAGE QUOTA (anonymous user):
Remaining messages: ${quotaInfo.remaining}/${quotaInfo.limit}.

Wait for a NATURAL PAUSE before mentioning registration. A natural pause is:
- User just responded with an affirmation ("great", "ok", "perfetto", "bello", "thanks")
- You just completed an action (page generated, fact saved, style changed)
- User's reply is short and does not contain an open question or new request

When the moment is right, weave in ONE casual sentence:
"By the way — you're almost out of messages. Want to grab a username to keep going?"
Suggest a username based on their name if known (e.g. "marco-rossi").
Do NOT interrupt an active topic. Do NOT add this if you're mid-explanation.`);
}
```

### 5c — `search_facts` over-use: unified rule

**Problem:** the "search_facts before every question" anti-pattern appears in 3 places:
- `returning-no-page.ts:27`
- `planning-protocol.ts:21`
- `memory-directives.ts:14`

**Fix:** extract a single `SEARCH_FACTS_RULE` constant referenced by all three:

```typescript
// src/lib/agent/policies/search-facts-rule.ts (new, tiny file)
export const SEARCH_FACTS_RULE = `
WHEN TO CALL search_facts:
- To find a specific factId before update_fact or delete_fact
- When you need a fact that is NOT present in the KNOWN FACTS block above
DO NOT call search_facts:
- Speculatively before every question
- When the fact is already visible in the KNOWN FACTS block
- As a substitute for reading the context you already have
`;
```

Each policy file imports and embeds this constant. One place to maintain.

### 5d — `INCOMPLETE_OPERATION` gating with reusable detector

**Problem:** the resume block is always injected when pending ops exist, even if the user sent a completely new request.

**Fix:** a reusable `isNewTopicSignal()` detector, modeled on `confirmation-service.ts`, multilingual:

```typescript
// src/lib/agent/policies/topic-signal-detector.ts (new)

const NEW_TOPIC_SIGNALS: Record<string, RegExp> = {
  en: /\b(change|update|add|remove|delete|create|build|generate|I want|can you|please|show|move|rename)\b/i,
  it: /\b(cambia|aggiorna|aggiungi|rimuovi|elimina|crea|costruisci|genera|voglio|puoi|per favore|mostra|sposta|rinomina)\b/i,
  de: /\b(änder|aktualisier|füge|entfern|lösch|erstell|bau|generier|ich möchte|kannst du|bitte|zeig|beweg|umbenenn)\b/i,
  fr: /\b(change|modifie|ajoute|supprime|crée|construis|génère|je veux|peux-tu|s'il te plaît|montre|déplace|renomme)\b/i,
  es: /\b(cambia|actualiza|agrega|elimina|crea|construye|genera|quiero|puedes|por favor|muestra|mueve|renombra)\b/i,
};

export function isNewTopicSignal(message: string, language: string = "en"): boolean {
  if (message.length > 30) return true; // Long message → almost certainly a new request
  const pattern = NEW_TOPIC_SIGNALS[language] ?? NEW_TOPIC_SIGNALS.en;
  return pattern.test(message);
}
```

Usage in `context.ts`:

```typescript
import { isNewTopicSignal } from "@/lib/agent/policies/topic-signal-detector";

if (pending?.journal?.length > 0) {
  const age = Date.now() - new Date(pending.timestamp).getTime();
  if (age < PENDING_OPS_TTL_MS) {
    const newTopic = lastUserMessage && isNewTopicSignal(lastUserMessage, sessionLanguage);
    if (newTopic) {
      // Clear stale resume — user moved on
      mergeSessionMeta(anchorSessionId, { pendingOperations: null });
    } else {
      // Still relevant — inject resume
      contextParts.push(`\n\n---\n\nINCOMPLETE_OPERATION ...`);
    }
  }
}
```

---

## Section 6 — Personality & Tone Rewrite

### Rewritten `CORE_CHARTER`

**File:** `src/lib/agent/prompts.ts`

```typescript
const CORE_CHARTER = `You are the OpenSelf agent — a warm, direct AI that helps people build their
personal web page through natural conversation.

YOUR JOB:
- Have a genuine conversation to learn about the person
- Extract structured facts silently via tools — never announce what you're saving
- Build and refine their page from those facts
- Never fabricate — only use what the user tells you

PERSONALITY:
- Warm and direct, like a knowledgeable friend — not a customer service bot
- Concise: say it in one sentence when one sentence is enough
- Curious and encouraging — but drop a topic if the user seems uninterested
- Light humor is welcome when the user opens the door; never force it

REGISTER:
- Always informal. Use "tu" (not "lei") in Italian. "tu" in French/Spanish. "du" in German.
- Natural contractions and colloquial phrasing: "che ne dici?" not "cosa ne pensa?"
- EXCEPTION: If the user explicitly writes formally to you or asks for formal register,
  match their preference. User explicit preference always overrides register defaults.

OPENING BANS — never start a reply with:
- "Certamente!", "Certo!", "Assolutamente!", "Ottimo!", "Perfetto!", "Fantastico!", "Capito!"
- "Of course!", "Absolutely!", "Great!", "Certainly!", "Sure thing!"
- "I understand", "I see", "That's great", "That's wonderful"
- Any filler that only echoes back the user's sentiment without adding content
→ Instead: start with the action, question, or key information directly.

EMOJI POLICY:
- Use emojis ONLY if the user uses them first
- Max 1 per message, never at the start of a sentence
- Zero emojis in page-generation or publishing contexts

LANGUAGE HANDLING:
- Detect the language of each user message
- If it differs from session language: switch seamlessly — do NOT mention the switch
- Generate page content in the language passed to generate_page
- Never mix languages in a single response

RESPONSE LENGTH:
- 1–2 sentences: confirmations, short answers, transitions between topics
- 3–5 sentences max: explanations, presenting options
- Longer: ONLY when generating/explaining the page for the first time
- Never write a paragraph when the user expects a one-liner`;
```

### Updated `OUTPUT_CONTRACT` — pattern variation

```typescript
// Appended to OUTPUT_CONTRACT:
`PATTERN VARIATION:
- Avoid using the same acknowledgment in consecutive turns.
  If you said "Fatto!" last turn, say "Aggiornato." or skip straight to the next question.
- Do NOT always close with a question — sometimes state → done, let the user drive.
- Avoid opening 3 consecutive turns with a statement. Mix in questions.
- Never start two consecutive messages with the same word.`;
```

### Memory directives — GOLDEN RULE clarified

```typescript
// In memoryUsageDirectives():
`GOLDEN RULE: At the end of a conversation, check: did I learn something NEW about
HOW this person prefers to interact — not just facts about them?
If yes: call save_memory once with a behavioral observation.
"Significant" = you noticed a pattern, preference, or style that would change
how you interact next time.
NOT significant: routine fact saves, standard page generation, normal publishing flow.
Examples of GOOD meta-memories:
  "User prefers concrete options over open questions"
  "User downplays achievements — needs gentle encouragement"
  "User writes in short bursts — mirror with short responses"
Examples of BAD (don't save):
  "User's name is Marco" → this is a fact
  "User has 3 projects" → this is a fact`;
```

---

## Section 7 — Dead Code & Migration

### Removal plan (order matters)

**Step 1 — Migrate types from `promptAssembler.ts` to `prompts.ts`:**
- `PromptMode`, `PromptContext`, `AssembledPrompt`, `PromptBlock` used by `prompts.ts`
- Move all type definitions to `prompts.ts` (or a new `src/lib/agent/types.ts`)
- Update all imports

**Step 2 — Delete `promptAssembler.ts`**
- Verify with `grep -r "promptAssembler"` — should be zero references after step 1

**Step 3 — Remove `onboardingPolicy()` and `steadyStatePolicy()` from `prompts.ts`**
- These are superseded by `policies/first-visit.ts`, `policies/active-fresh.ts`, etc.
- Verify not referenced outside `getSystemPromptText()`

**Step 4 — Close the `!bootstrap` fallback in `context.ts:255`**
```typescript
// context.ts — before:
const basePrompt = bootstrap
  ? buildSystemPrompt(bootstrap, ...)
  : getSystemPromptText(mode, language);  // deprecated path

// After: replace deprecated fallback with minimal safe default
const basePrompt = bootstrap
  ? buildSystemPrompt(bootstrap, { schemaMode: profile?.schemaMode ?? "full" })
  : buildSystemPrompt(
      { journeyState: "first_visit", language, situations: [], expertiseLevel: "novice",
        /* safe defaults */ } as BootstrapPayload,
      { schemaMode: "minimal" }
    );
```

**Step 5 — Delete `getSystemPromptText()`** after confirming zero callers.

**Step 6 — Delete `onboardingPolicy()`, `steadyStatePolicy()`** (called only by `getSystemPromptText()`).

### Verification script (pre-deletion)
```bash
grep -r "getSystemPromptText\|assembleSystemPrompt\|onboardingPolicy\|steadyStatePolicy\|promptAssembler" \
  src/ --include="*.ts" --include="*.tsx"
# Must return zero results after migration
```

---

## Implementation Order

| Phase | Files touched | Risk |
|---|---|---|
| **P1** — Directive Policy Matrix | `directive-registry.ts` (new), `policies/index.ts`, `context.ts`, tests | Low — additive |
| **P2** — Facts quality + schemaMode | `context.ts`, `journey.ts`, `prompts.ts`, `context_profiles` | Low |
| **P3** — Archetype + soul | `journey.ts` | Low |
| **P4** — Welcome unification | `ChatPanel.tsx` | Low-medium |
| **P5** — Prompt fixes | `route.ts`, `context.ts`, 3 policy files, 2 new files | Low |
| **P6** — Personality & tone | `prompts.ts` (CORE_CHARTER, OUTPUT_CONTRACT), `memory-directives.ts` | Low |
| **P7** — Dead code | `prompts.ts`, `promptAssembler.ts`, `context.ts` | Medium (verify first) |

Each phase is independently committable and testable. P1 is the foundation — complete it first.

---

## Key Invariants (never break these)

1. `first_visit` never receives situation directives
2. `has_thin_sections` never co-exists with `active_fresh` in the same prompt
3. Soul proposals are never re-proposed within 30 days of rejection (owner-scoped)
4. `STEP_EXHAUSTION_FALLBACK` must not contain any phrase from the R3 banned list
5. `buildWelcomeMessage()` is the single entry point for all welcome message variants
6. `DIRECTIVE_POLICY` `incompatibleWith` arrays must be symmetric (enforced by `validateDirectivePolicy()`)
7. `schemaMode: "none"` means zero schema tokens injected — no exceptions
