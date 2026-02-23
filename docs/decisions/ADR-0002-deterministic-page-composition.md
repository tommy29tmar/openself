# ADR-0002: Deterministic Page Composition

Status: Accepted
Date: 2026-02-23
Deciders: OpenSelf engineering

## Context

When the agent collects facts from a conversation, those facts must be transformed
into a `PageConfig` (JSON structure of sections) that drives the rendered personal page.

Two approaches were considered:
1. Send all facts to an LLM and ask it to produce the page config (or raw HTML).
2. Use a deterministic composer that maps fact categories directly to section types
   via code.

The LLM approach offers creative flexibility (e.g. choosing section order, writing
prose from raw facts, inventing custom layouts) but introduces latency, cost, and
non-determinism. Each regeneration could produce a structurally different page, making
testing fragile and debugging difficult. It would also add another LLM call to the
critical rendering path, increasing cost per session.

## Decision

Use a deterministic `composeOptimisticPage()` function
(`src/lib/services/page-composer.ts`) that maps fact categories to fixed section types:

- `identity` facts -> `hero` and `bio` sections
- `skill` facts -> `skills` section
- `project` facts -> `projects` section
- `interest` facts -> `interests` section
- `social` facts -> `social` section
- A `footer` section is always appended

The composer uses localized template strings (8 languages) instead of LLM-generated
prose. A schema-repair loop (`repairAndValidate`) runs up to 3 attempts, and falls
back to a minimal safe config if validation still fails.

No LLM is involved in page composition. The LLM's role is limited to extracting
structured facts from conversation.

## Consequences

Positive:
1. Predictable output: the same facts always produce the same page config.
2. Fast: no network call, no token cost, sub-millisecond execution.
3. Testable: deterministic input/output makes unit testing straightforward.
4. Debuggable: when a page looks wrong, the cause is always in the fact data or the
   mapping code, never in a non-reproducible LLM response.
5. Schema-safe: the repair loop guarantees valid `PageConfig` output regardless of
   fact quality.

Negative:
1. Less creative output: pages follow a fixed section order and use template-based
   prose rather than natural language.
2. Adding new section types or reordering logic requires code changes, not prompt
   tuning.
3. The composer cannot infer implicit information that an LLM might (e.g. grouping
   related skills, writing a narrative bio from scattered facts).

## Alternatives Considered

1. LLM-generated page config
   - Rejected: non-deterministic output makes testing fragile, adds latency (~2-5s)
     and token cost to every page regeneration, and creates a second failure surface
     (prompt drift, hallucinated fields, schema violations).

2. Hybrid approach (deterministic structure, LLM-generated prose within sections)
   - Deferred: could be revisited in a later phase for specific sections (e.g. bio
     narrative) once the deterministic baseline is proven stable. Would require per-
     section caching to avoid repeated LLM calls.

3. User-editable templates
   - Deferred: out of scope for MVP. Deterministic composition provides a reasonable
     default that users can later customize once a template editing UI exists.
