# Chat-First Pending Reviews — Implementation Plan v10

## Goal
Surface pending soul change proposals in chat proactively, so users can review/approve/reject them conversationally — no new UI panels needed.

## Architecture
`assembleBootstrapPayload` is the single source of truth for `has_pending_soul_proposals` detection. It fetches pending proposals **after Circuit-A** (so auto-created proposals are captured), patches situations and payload directly. `detectSituations` has no opts path for proposals.

New fields are optional (`?`) in both `BootstrapPayload` and `SituationContext`. Field only set in payload when non-empty.

Confirmed signatures / locations:
- `createAgentTools(sessionLanguage: string, sessionId: string, ownerKey?: string, requestId?: string, readKeys?: string[], mode?: string)` — `src/lib/agent/tools.ts`
- `assembleBootstrapPayload(scope: OwnerScope, language: string, authInfo?, lastUserMessage?)` — `src/lib/agent/journey.ts`
- `filterPublishableFacts` — `src/lib/services/page-projection`
- `soul-service` exports: `getActiveSoul`, `getPendingProposals`, `proposeSoulChange`, `reviewProposal`
- **`getSoulProposalCooldownStatus`** — `src/lib/agent/journey.ts` (NOT soul-service)
- `facts` table active check: `archived_at IS NULL` (no `status` column)
- `getSituationDirectives` in `directive-registry.ts` currently has a hard `first_visit` guard at line 213 that must be removed (see Task 3g)

## Design decisions
- **`first_visit` included in eligibleStates**: `first_visit` can persist many turns; proposals must surface promptly. The hard `first_visit` guard in `getSituationDirectives` is removed so `eligibleStates` alone controls filtering for all situations.
- **Single detection path**: `assembleBootstrapPayload` owns detection exclusively. No opts path in `detectSituations`. Tests mock `getPendingProposals` directly.
- **Sanitization scope**: `sanitizeForPrompt` applies only to user/model-derived values (overlay keys, overlay values, reason). The directive template is static and may contain `\n`. Tests assert sanitization on dynamic substrings only.
- **Overlay key cap**: max 5 keys rendered; excess shown as "(N more omitted)".

---

## Task 1: Fix `getPendingProposals` ordering

**File:** `src/lib/services/soul-service.ts`

```typescript
.orderBy(sql`datetime(${soulChangeProposals.createdAt}) ASC, ${soulChangeProposals.id} ASC`)
```
Add `sql` to drizzle-orm imports.

**Verify:** `npx tsc --noEmit`
**Commit:** `git commit -m "fix(soul): deterministic ordering in getPendingProposals"`

---

## Task 2: Add `review_soul_proposal` Tool + Wire Tool Filter

### 2a — tools.ts
Add `reviewProposal` to soul-service import. Insert after `propose_soul_change`:

```typescript
review_soul_proposal: tool({
  description: "Accept or reject a pending soul change proposal. Use after the user explicitly agrees or disagrees with a proposed soul update you surfaced in chat.",
  parameters: z.object({
    proposalId: z.string().describe("The ID of the soul proposal to review"),
    accept: z.boolean().describe("true to apply the soul change, false to reject it"),
  }),
  execute: async ({ proposalId, accept }) => {
    try {
      const result = reviewProposal(proposalId, effectiveOwnerKey, accept);
      if (!result.success) return { success: false, error: result.error };
      logEvent({ eventType: "tool_call", actor: "assistant", payload: { requestId, tool: "review_soul_proposal", proposalId, accept } });
      return {
        success: true,
        message: accept
          ? "Soul profile updated. Changes will apply from the next conversation."
          : "Proposal rejected. I'll keep the current soul profile.",
      };
    } catch (error) {
      logEvent({ eventType: "tool_call_error", actor: "assistant", payload: { requestId, tool: "review_soul_proposal", error: String(error) } });
      return { success: false, error: String(error) };
    }
  },
}),
```

### 2b — tool-filter.ts
Add `"review_soul_proposal"` to `ONBOARDING_TOOLS`.

### 2c — tests/evals/tool-filter.test.ts
The file has a contract: `ALL_TOOL_NAMES` array (line 10+) must include every tool. Add `"review_soul_proposal"` to that array.

The comment at line 9 says: "When adding a new tool, add it here AND review ONBOARDING_TOOLS in tool-filter.ts."

Also add an assertion that `review_soul_proposal` is present in the filtered set for `first_visit` and `returning_no_page` states:
```typescript
it("includes review_soul_proposal in first_visit and returning_no_page", () => {
  const tools = mockTools(ALL_TOOL_NAMES);
  const filtered1 = filterTools(tools, "first_visit");
  expect(Object.keys(filtered1)).toContain("review_soul_proposal");
  const filtered2 = filterTools(tools, "returning_no_page");
  expect(Object.keys(filtered2)).toContain("review_soul_proposal");
});
```

**Verify:** `npx tsc --noEmit`
**Commit:** `git commit -m "feat(agent): add review_soul_proposal tool, wire into onboarding tool set, update filter tests"`

---

## Task 3: Wire `has_pending_soul_proposals` Situation

### 3a — journey.ts: Situation type
```typescript
| "has_pending_soul_proposals"
```

### 3b — journey.ts: BootstrapPayload (optional field)
```typescript
pendingSoulProposals?: Array<{ id: string; overlay: Record<string, unknown>; reason: string }>;
```

### 3c — journey.ts: Post-Circuit-A fetch in assembleBootstrapPayload
**This is the ONLY place `has_pending_soul_proposals` is detected.**
After soul/Circuit-A block (~line 558), before return:

```typescript
const pendingSoulProposals = getPendingProposals(ownerKey);
if (pendingSoulProposals.length > 0 && !situations.includes("has_pending_soul_proposals")) {
  situations.push("has_pending_soul_proposals");
}
```

Spread into return payload only when non-empty:
```typescript
...(pendingSoulProposals.length > 0 ? {
  pendingSoulProposals: pendingSoulProposals.map(p => ({
    id: p.id,
    overlay: (p.proposedOverlay && typeof p.proposedOverlay === "object" && !Array.isArray(p.proposedOverlay))
      ? p.proposedOverlay as Record<string, unknown>
      : {},
    reason: p.reason ?? "",
  })),
} : {}),
```

### 3d — policies/index.ts: Optional field
```typescript
pendingSoulProposals?: Array<{ id: string; overlay: Record<string, unknown>; reason: string }>;
```

### 3e — prompts.ts: Assembly
```typescript
pendingSoulProposals: bootstrap.pendingSoulProposals ?? [],
```

### 3f — situations.ts: Directive with sanitization

```typescript
/**
 * Sanitize user/model-derived text to a safe string:
 * 1. Collapse CR, LF, TAB → space
 * 2. Strip remaining non-printable control chars (U+0000–U+001F and U+007F)
 * 3. Cap at maxLen
 * Applied only to overlay keys, overlay values, and reason. NOT to template text.
 */
function sanitizeForPrompt(value: string, maxLen = 100): string {
  return value
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, maxLen);
}

const MAX_OVERLAY_KEYS = 5;

export function pendingSoulProposalsDirective(
  proposals: Array<{ id: string; overlay: Record<string, unknown>; reason: string }>,
): string {
  if (proposals.length === 0) return "";
  const first = proposals[0];
  const safeOverlay =
    first.overlay && typeof first.overlay === "object" && !Array.isArray(first.overlay)
      ? first.overlay
      : {};
  const allEntries = Object.entries(safeOverlay);
  const renderedEntries = allEntries.slice(0, MAX_OVERLAY_KEYS);
  const omitted = allEntries.length - renderedEntries.length;
  const overlayLines = renderedEntries
    .map(([k, v]) => {
      const safeKey = sanitizeForPrompt(String(k), 30);
      const rawVal = Array.isArray(v) ? (v as unknown[]).map(String).join(", ") : String(v ?? "");
      const safeVal = sanitizeForPrompt(rawVal, 120);
      return `  ${safeKey}: ${safeVal}`;
    })
    .join("\n");
  const omittedNote = omitted > 0 ? `\n  (${omitted} more omitted)` : "";
  const safeReason = sanitizeForPrompt(first.reason ?? "", 200);
  return `PENDING SOUL PROPOSAL (id: ${first.id}):
I previously noticed patterns in how you express yourself and proposed an update to your style profile:
${overlayLines || "  (no details available)"}${omittedNote}
${safeReason ? `Reason: ${safeReason}` : ""}

Bring this up naturally in conversation — e.g., "I noticed something about how you communicate and wanted to check with you...".
If the user agrees, call review_soul_proposal with accept: true.
If the user disagrees, call review_soul_proposal with accept: false.
Do NOT pressure the user. If they seem uninterested, let it go.`;
}
```

### 3g — directive-registry.ts: Remove hard first_visit guard + add registry entry

**Remove the hard guard (line 213):**
```typescript
// REMOVE this block:
// Guard by construction: first_visit never receives situation directives
if (journeyState === "first_visit") return "";
```

After removing it, `getSituationDirectives` relies solely on `eligibleStates` per situation. Situations without `first_visit` in their `eligibleStates` are already filtered at line 216 (`.filter(s => DIRECTIVE_POLICY[s].eligibleStates.includes(journeyState))`). No other situation changes — existing ones that lack `first_visit` continue to be suppressed correctly.

**Import `pendingSoulProposalsDirective`. Add to `SituationContextMap`, `SITUATION_REQUIRED_KEYS: []`, and entry:**
```typescript
has_pending_soul_proposals: {
  priority: 2,
  tieBreak: "has_pending_soul_proposals",
  // first_visit included: state can persist many turns; proposals must surface promptly
  eligibleStates: ["first_visit", "returning_no_page", "draft_ready", "active_fresh", "active_stale"],
  incompatibleWith: [],
  build: (ctx) => pendingSoulProposalsDirective(ctx.pendingSoulProposals ?? []),
},
```

**After removing the guard, run the directive-registry tests to verify no regressions:**
```bash
npx vitest run tests/evals/journey-state-detection.test.ts
npx vitest run tests/evals/journey-import-situation.test.ts
```
If any test was asserting that `first_visit` produces empty directives unconditionally, update it to assert the specific situations that ARE expected to be empty (all the ones without `first_visit` in their `eligibleStates`).

**Verify:** `npx tsc --noEmit`
**Commit:**
```bash
git add src/lib/agent/journey.ts src/lib/agent/policies/index.ts src/lib/agent/prompts.ts src/lib/agent/policies/situations.ts src/lib/agent/policies/directive-registry.ts
git commit -m "feat(agent): add has_pending_soul_proposals situation and directive; remove first_visit hard guard"
```

---

## Task 4: Update Existing Test Mocks + Write New Tests

### 4a — Update `tests/evals/journey-state-detection.test.ts`

Find the existing soul-service mock (currently only has `getActiveSoul`). Replace:
```typescript
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
  getPendingProposals: vi.fn(() => []),
  proposeSoulChange: vi.fn(),
  reviewProposal: vi.fn(),
}));
```
Note: `getSoulProposalCooldownStatus` is in `journey.ts`, not `soul-service`, so it does NOT go in this mock.

**Run full journey tests after this change:**
```bash
npx vitest run tests/evals/journey-state-detection.test.ts
npx vitest run tests/evals/journey-state-pin.test.ts
npx vitest run tests/evals/journey-import-situation.test.ts
```
Expected: all pass.

### 4b — New test file `tests/evals/soul-proposal-chat.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { pendingSoulProposalsDirective } from "@/lib/agent/policies/situations";

vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) })) },
  db: {},
}));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
  getPendingProposals: vi.fn(() => []),
  proposeSoulChange: vi.fn(),
  reviewProposal: vi.fn(),
}));
vi.mock("@/lib/services/kb-service", () => ({
  countFacts: vi.fn(() => 0),
  getActiveFacts: vi.fn(() => []),
}));
vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: vi.fn(() => ({ getPendingProposals: vi.fn(() => []) })),
}));
vi.mock("@/lib/services/conflict-service", () => ({ getOpenConflicts: vi.fn(() => []) }));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
  getPublishedUsername: vi.fn(() => null),
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: unknown[]) => facts),
}));
vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));
vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn(() => ({})),
  mergeSessionMeta: vi.fn(),
}));
vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: { hero: ["identity"], bio: ["identity"] },
}));

import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { getPendingProposals, reviewProposal } from "@/lib/services/soul-service";
import { createAgentTools } from "@/lib/agent/tools";
import type { OwnerScope } from "@/lib/auth/session";

const mockScope: OwnerScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgePrimaryKey: "owner-1",
  knowledgeReadKeys: ["owner-1"],
} as any;

// --- Directive unit tests ---

describe("pendingSoulProposalsDirective", () => {
  it("returns empty string for empty array", () => {
    expect(pendingSoulProposalsDirective([])).toBe("");
  });

  it("includes id, overlay, reason, and tool name", () => {
    const result = pendingSoulProposalsDirective([
      { id: "abc-123", overlay: { voice: "direct", tone: "professional" }, reason: "Pattern observed" },
    ]);
    expect(result).toContain("abc-123");
    expect(result).toContain("voice: direct");
    expect(result).toContain("Pattern observed");
    expect(result).toContain("review_soul_proposal");
  });

  it("surfaces only the first proposal", () => {
    const result = pendingSoulProposalsDirective([
      { id: "first", overlay: {}, reason: "" },
      { id: "second", overlay: {}, reason: "" },
    ]);
    expect(result).toContain("first");
    expect(result).not.toContain("second");
  });

  it("handles array values in overlay", () => {
    const result = pendingSoulProposalsDirective([
      { id: "xyz", overlay: { values: ["autonomy", "learning"] }, reason: "" },
    ]);
    expect(result).toContain("autonomy, learning");
  });

  it("does not throw on null overlay, shows fallback", () => {
    expect(() =>
      pendingSoulProposalsDirective([{ id: "bad", overlay: null as any, reason: "" }])
    ).not.toThrow();
    expect(pendingSoulProposalsDirective([{ id: "bad", overlay: null as any, reason: "" }]))
      .toContain("no details available");
  });

  it("sanitizes overlay values: control chars stripped, collapsed to single-line", () => {
    const result = pendingSoulProposalsDirective([
      { id: "inject", overlay: { voice: "direct\x00\x01evil\x0Bnewline\nline2" }, reason: "test\x08\nmore" },
    ]);
    // Check only the overlay line (dynamic content), not the whole result
    const voiceLine = result.split("\n").find(l => l.trimStart().startsWith("voice:"))!;
    expect(voiceLine).toBeDefined();
    const valueAfterColon = voiceLine.split(":").slice(1).join(":");
    expect(valueAfterColon).not.toMatch(/[\x00-\x1F\x7F]/);
    // Check reason line
    const reasonLine = result.split("\n").find(l => l.startsWith("Reason:"))!;
    expect(reasonLine).toBeDefined();
    expect(reasonLine).not.toMatch(/[\x00-\x1F\x7F]/);
  });

  it("truncates long overlay values to max 120 chars", () => {
    const longVal = "a".repeat(200);
    const result = pendingSoulProposalsDirective([
      { id: "long", overlay: { voice: longVal }, reason: "" },
    ]);
    const voiceLine = result.split("\n").find(l => l.trimStart().startsWith("voice:"))!;
    expect(voiceLine.length).toBeLessThan(160);
  });

  it("caps overlay keys at 5 and adds omitted note", () => {
    const manyKeys: Record<string, string> = {};
    for (let i = 0; i < 8; i++) manyKeys[`key${i}`] = `val${i}`;
    const result = pendingSoulProposalsDirective([{ id: "cap", overlay: manyKeys, reason: "" }]);
    expect(result).toContain("3 more omitted");
    expect(result).not.toContain("key5");
  });
});

// --- assembleBootstrapPayload production path ---

describe("assembleBootstrapPayload — post-Circuit-A patching", () => {
  beforeEach(() => vi.mocked(getPendingProposals).mockReturnValue([]));

  it("sets situation and payload when proposals exist post-Circuit-A", () => {
    vi.mocked(getPendingProposals).mockReturnValue([
      { id: "p1", proposedOverlay: { voice: "direct" }, reason: "test", status: "pending", createdAt: new Date().toISOString() } as any,
    ]);
    const result = assembleBootstrapPayload(mockScope, "en");
    expect(result.payload.situations).toContain("has_pending_soul_proposals");
    expect(result.payload.pendingSoulProposals).toHaveLength(1);
    expect(result.payload.pendingSoulProposals![0].id).toBe("p1");
  });

  it("omits field and situation when no proposals", () => {
    const result = assembleBootstrapPayload(mockScope, "en");
    expect(result.payload.situations).not.toContain("has_pending_soul_proposals");
    expect(result.payload.pendingSoulProposals).toBeUndefined();
  });
});

// --- review_soul_proposal tool execution tests ---

describe("review_soul_proposal tool — execute()", () => {
  beforeEach(() => vi.mocked(reviewProposal).mockReset());

  function getReviewTool() {
    const { tools } = createAgentTools("en", "session-1", "owner-1", "req-1");
    return tools.review_soul_proposal;
  }

  it("accept path: calls reviewProposal with correct args and returns success+updated message", async () => {
    vi.mocked(reviewProposal).mockReturnValue({ success: true });
    const result = await getReviewTool().execute({ proposalId: "p1", accept: true });
    expect(vi.mocked(reviewProposal)).toHaveBeenCalledWith("p1", "owner-1", true);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/updated/i);
  });

  it("reject path: calls reviewProposal with accept:false and returns rejection message", async () => {
    vi.mocked(reviewProposal).mockReturnValue({ success: true });
    const result = await getReviewTool().execute({ proposalId: "p1", accept: false });
    expect(vi.mocked(reviewProposal)).toHaveBeenCalledWith("p1", "owner-1", false);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/rejected/i);
  });

  it("not-found / already-resolved: forwards error from reviewProposal", async () => {
    vi.mocked(reviewProposal).mockReturnValue({ success: false, error: "Proposal not found or already resolved" });
    const result = await getReviewTool().execute({ proposalId: "missing", accept: true });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found|already resolved/i);
  });
});
```

**Run:**
```bash
npx vitest run tests/evals/soul-proposal-chat.test.ts
npx vitest run tests/evals/
npx tsc --noEmit
```
All expected to pass.

**Commit:**
```bash
git add tests/evals/journey-state-detection.test.ts tests/evals/soul-proposal-chat.test.ts tests/evals/tool-filter.test.ts
git commit -m "test(agent): add soul proposal tests; fix soul-service mock in journey tests; update tool-filter contract"
```

---

## Task 5: Smoke Test

**Preconditions:**
1. Single-user mode (`__default__` owner key)
2. `npm run dev:watch`

**Insert test proposal:**
```bash
sqlite3 .data/openself.db "
INSERT INTO soul_change_proposals (id, owner_key, proposed_overlay, reason, status, created_at)
VALUES ('test-proposal-1', '__default__',
  '{\"voice\":\"diretto e ironico\",\"tone\":\"professionale ma accessibile\"}',
  'Consistent pattern observed', 'pending', datetime('now'));"
```

**Path A — returning user** (has at least one active fact):
```bash
sqlite3 .data/openself.db "SELECT COUNT(*) FROM facts WHERE session_id='__default__' AND archived_at IS NULL;"
```
If > 0: send any message → AI should mention the proposal.

**Path B — first_visit user** (no active facts):
If = 0: send a message without creating facts — AI should still mention the proposal (now that `first_visit` is in eligible states and the hard guard is removed).

**Verify in both paths:** AI brings up proposal naturally → respond "Sì" → check:
```bash
sqlite3 .data/openself.db "SELECT status FROM soul_change_proposals WHERE id='test-proposal-1';"
```
Expected: `accepted`
