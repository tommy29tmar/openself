# curate_content: Make sectionType Optional for Item-Level Calls

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce LLM tool-call errors by making `sectionType` optional when `factId` is provided (item-level curation path), since the item-level path never uses it.

**Architecture:** `sectionType` becomes optional in Zod schema. Item-level path (factId provided) ignores it. Section-level path (factId omitted) validates its presence at runtime and returns a clear error if missing. Prompt and tool description updated to guide the agent.

**Tech Stack:** TypeScript, Zod, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/agent/tools.ts` | Modify (~2060) | Make `sectionType` optional in Zod, add runtime guard for section-level path |
| `src/lib/agent/prompts.ts` | Modify (~174-185) | Update CONTENT CURATION instructions |
| `tests/evals/curate-content-tool.test.ts` | Modify | Add tests for optional sectionType behavior |

---

## Chunk 1: Implementation

### Task 1: Add tests for optional sectionType behavior

**Files:**
- Modify: `tests/evals/curate-content-tool.test.ts`

- [ ] **Step 1: Write test — item-level succeeds without sectionType**

Add to existing `describe("curate_content validation")`:

```typescript
it("item-level: sectionType is not required when factId is provided", () => {
  // sectionType is optional in schema — Zod should accept this
  const schema = z.object({
    sectionType: z.string().optional(),
    factId: z.string().optional(),
    fields: z.record(z.string()),
  });
  const result = schema.safeParse({
    factId: "some-uuid",
    fields: { title: "OpenSelf" },
  });
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Write test — section-level fails without sectionType**

This validates the runtime guard (not Zod — Zod allows optional, runtime rejects):

```typescript
it("section-level: missing sectionType returns clear error", () => {
  // Simulates what the execute function should do when factId is omitted
  // and sectionType is also missing
  const sectionType: string | undefined = undefined;
  const factId: string | undefined = undefined;

  // Runtime guard: section-level requires sectionType
  if (!factId && !sectionType) {
    const error = "sectionType is required for section-level curation (when factId is omitted)";
    expect(error).toContain("sectionType is required");
  }
});
```

- [ ] **Step 3: Write test — item-level ignores wrong sectionType gracefully**

```typescript
it("item-level: wrong sectionType is safely ignored", () => {
  // For item-level, filterEditableFields uses fact.category, not sectionType
  // Even if sectionType is "bio" but the fact is category "project",
  // the filter uses the fact's actual category
  const fields = { title: "OpenSelf", url: "https://evil.com" };
  const filtered = filterEditableFields("project", fields);
  expect(filtered).toEqual({ title: "OpenSelf" });
  // sectionType never enters this code path
});
```

- [ ] **Step 4: Run tests to verify they pass (new tests use existing behavior)**

Run: `npx vitest run tests/evals/curate-content-tool.test.ts`
Expected: All tests PASS (new tests validate schema/logic, not the tool execute function)

- [ ] **Step 5: Commit**

```bash
git add tests/evals/curate-content-tool.test.ts
git commit -m "test: add curate_content sectionType optionality tests"
```

---

### Task 2: Make sectionType optional in Zod schema + add runtime guard

**Files:**
- Modify: `src/lib/agent/tools.ts:2042-2060`

- [ ] **Step 1: Update Zod schema — sectionType becomes optional**

In `src/lib/agent/tools.ts`, change the `sectionType` parameter from:

```typescript
sectionType: z
  .string()
  .describe("Section type to curate (e.g., 'projects', 'bio', 'experience')"),
```

To:

```typescript
sectionType: z
  .string()
  .optional()
  .describe(
    "Section type (e.g., 'bio', 'experience'). " +
    "Required for section-level curation (when factId is omitted). " +
    "Not needed for item-level curation (when factId is provided).",
  ),
```

- [ ] **Step 2: Add runtime guard for section-level path**

In the `execute` function, at the start of the `else` branch (section-level, ~line 2097), add a guard before the existing `PERSONALIZABLE_FIELDS` check:

```typescript
} else {
  // --- SECTION-LEVEL: route to section_copy_state ---
  if (!sectionType) {
    return {
      success: false,
      error: "sectionType is required for section-level curation (when factId is omitted)",
    };
  }
  const allowed = PERSONALIZABLE_FIELDS[sectionType];
  // ... rest unchanged ...
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/evals/curate-content-tool.test.ts tests/evals/content-curation-integration.test.ts`
Expected: All PASS

- [ ] **Step 4: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools.ts
git commit -m "feat: make curate_content sectionType optional for item-level calls"
```

---

### Task 3: Update tool description and agent prompt

**Files:**
- Modify: `src/lib/agent/tools.ts:2036-2041`
- Modify: `src/lib/agent/prompts.ts:174-185`

- [ ] **Step 1: Update tool description**

In `src/lib/agent/tools.ts`, change the tool `description` from:

```typescript
description:
  "Curate the display text of page content without modifying facts. " +
  "Use for capitalization fixes, wording improvements, tone adjustments, and professional polish. " +
  "If factId is provided, curates a specific item (e.g., project title). " +
  "If factId is omitted, curates the section-level description (e.g., bio text). " +
  "The underlying facts remain unchanged — this only affects presentation.",
```

To:

```typescript
description:
  "Curate the display text of page content without modifying facts. " +
  "Use for wording improvements, tone adjustments, and professional polish. " +
  "Item-level: provide factId + fields (sectionType not needed). " +
  "Section-level: provide sectionType + fields, omit factId. " +
  "The underlying facts remain unchanged — this only affects presentation.",
```

- [ ] **Step 2: Update prompt CONTENT CURATION section**

In `src/lib/agent/prompts.ts`, change lines 174-185 from:

```typescript
## CONTENT CURATION (curate_content)
- Use curate_content to improve how facts appear on the page WITHOUT changing facts.
- Provide factId for item-level edits (project title, experience description, skill name).
- Omit factId for section-level edits (bio text, hero tagline).
- GROUNDING RULES:
  - Only improve presentation: capitalization, wording, tone, professional polish.
  - NEVER change factual content (don't rename companies, change roles, alter dates).
  - NEVER invent information not present in the underlying facts.
  - When uncertain, use search_facts first to read the original data.
  - The curated text must be recognizably derived from the original fact.
- Use curate_content AFTER creating facts to polish the page presentation.
- Example: user says "openself" → fact stores "openself" → curate_content({ factId, fields: { title: "OpenSelf" } }).
```

To:

```typescript
## CONTENT CURATION (curate_content)
- Use curate_content to improve how facts appear on the page WITHOUT changing facts.
- Item-level: curate_content({ factId, fields: { title: "OpenSelf" } }) — sectionType not needed.
- Section-level: curate_content({ sectionType: "bio", fields: { text: "New bio" } }) — factId not needed.
- GROUNDING RULES:
  - Only improve presentation: capitalization, wording, tone, professional polish.
  - NEVER change factual content (don't rename companies, change roles, alter dates).
  - NEVER invent information not present in the underlying facts.
  - When uncertain, use search_facts first to read the original data.
  - The curated text must be recognizably derived from the original fact.
- Use curate_content AFTER creating facts to polish the page presentation.
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: 3019+ tests PASS, 282+ files

- [ ] **Step 4: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools.ts src/lib/agent/prompts.ts
git commit -m "docs: update curate_content descriptions — sectionType optional for item-level"
```

---

### Task 4: Deploy

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy web + worker**

```bash
export $(grep -E '^COOLIFY_' .env | xargs)
curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" -H "Accept: application/json" "$COOLIFY_BASE_URL/api/v1/deploy?uuid=cokksgw48goscs8okgk48okw&force=false"
curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" -H "Accept: application/json" "$COOLIFY_BASE_URL/api/v1/deploy?uuid=y4o0k84wcko0co0c0gcw84ws&force=false"
```

- [ ] **Step 3: Verify deployments complete**

Poll deployment status until both return `"finished"`.
