# OpenSelf - Execution Roadmap

Last updated: 2026-02-23
Planning horizon: rolling (update every sprint/iteration)

## 1) Goal

Move from "hardened MVP" to "dogfooding-ready product":
- core user flow must be robust and tested
- publish safety enforced end-to-end
- visual quality consistent across supported themes
- ready for 10+ testers to use without supervision

## 2) Prioritization Rules

When choosing work, apply this order:
1. Correctness and user trust (publish safety, data integrity)
2. End-to-end completion of existing features over adding new feature breadth
3. Developer velocity (clear contracts, tests, observability)
4. Expansion features (connectors, ecosystem)

## 3) Completed

### Phase 0.2.1 — Hardening (Done)

- **NOW-1**: Layout engine → Done (centered MVP; split/stack fallback to centered, Phase 1)
- **NOW-2**: Publish flow hardening → Done (3-state: draft → approval_pending → published, server-side gate)
- **NOW-3**: Theme alignment → Done (minimal + warm, centralized validation, AVAILABLE_THEMES constant)
- **NOW-4**: Preview state simplification → Done (idle + optimistic_ready, synthesis states removed)
- Migration tracking with `_migrations` table and transactional application
- Two-row page model with DB CHECK constraints
- Reserved username protection
- 112 automated tests

## 4) Now (High Priority)

### Phase 0 Gate — Dogfooding

Goal: 10+ real users complete the onboarding flow successfully.

Criteria (from ARCHITECTURE.md):
1. 10+ testers complete onboarding without assistance
2. Eval suite >= 95% pass rate
3. No data loss or corruption during normal use
4. Publish flow works reliably (agent proposes, user confirms)
5. Generated pages are visually acceptable on desktop and mobile

Deliverables:
1. Manual QA pass on the full onboarding flow
2. Deploy to test environment
3. Collect feedback from initial testers
4. Address critical issues found during dogfooding

## 5) Next (Medium Priority)

### NEXT-1: Expand section types in renderer

Candidate scope:
- timeline
- achievements
- stats
- reading
- music
- contact

Definition of done:
1. Schema type → renderer mapping exists
2. Basic variants implemented per section
3. Composer or user tools can produce these sections safely

### NEXT-2: Media upload API and avatar end-to-end support

Deliverables:
1. Upload endpoint with MIME/size validation
2. Store media via existing service
3. Render avatar URL in hero section from stored media id

### NEXT-3: Connector MVP (start with one connector)

Suggested first connector: GitHub (projects activity into facts)

### NEXT-4: Additional themes — bold, elegant, hacker

Deliverables:
1. CSS design tokens for each theme (light + dark)
2. Add to `AVAILABLE_THEMES` constant
3. Visual QA for all theme × colorScheme combinations

### NEXT-5: Distinct layout implementations — split, stack

Deliverables:
1. Split layout: two-column with sidebar
2. Stack layout: full-width sections
3. CSS rules replace fallback-to-centered behavior
4. Layout-aware component variants

### NEXT-6: SSE preview (replace polling)

Deliverables:
1. Server-sent events endpoint for preview updates
2. Client-side EventSource connection
3. Remove polling interval

### NEXT-7: History summarization in context budget

Deliverables:
1. Summarize old conversation turns to fit context window
2. Maintain fact references across summarization

### NEXT-8: Worker scheduler wiring

Deliverables:
1. Wire background job processor into app lifecycle
2. Schedule periodic jobs (e.g., page re-composition on fact changes)

### NEXT-9: Public page translation for visitors

Deliverables:
1. Detect visitor language from `Accept-Language` header on `/{username}` route
2. If page language != visitor language, translate on-demand (same LLM pipeline)
3. Serve from `translation_cache` on repeat visits (same hash = instant)
4. Optional: translation banner "This page is originally in {language}. [View original]"
5. Optional: pre-translate top N languages on publish (background job)

Cost risk:
- Each unique (page content x language) pair costs one LLM call (~$0.001)
- 1,000 pages x 7 languages = ~$7.00 one-time (cached after first visit)
- Risk grows if supported languages expand or pages become very long
- Mitigated by: translation_cache (no repeated costs), llm_limits budget guardrails,
  hard cap on supported languages

## 6) Later (Lower Priority)

1. Auth + CSRF on publish endpoint (required before public deployment)
2. Session persistence across browser reloads
3. Steady-state agent mode switching
4. Synthesis state machine (full async page generation)
5. Community component registry enforcement with certified workflow
6. Additional connector ecosystem
7. Advanced theming and design packs
8. Multi-profile / multi-tenant model if product direction requires it

## 7) Milestones

### Milestone A — Phase 0 Gate (Dogfooding)

Required:
1. Phase 0.2.1 complete ✅
2. `next build` passes ✅
3. 10+ testers complete onboarding
4. Critical bugs resolved

Outcome:
- OpenSelf is usable by real people for its core purpose

### Milestone B — MVP Completeness

Required:
1. NEXT-1 complete (at least first 2 additional section families)
2. NEXT-2 complete (avatar support)
3. NEXT-3 complete (single connector)
4. NEXT-4 complete (additional themes)

Outcome:
- OpenSelf is credible as a living-page MVP, not just onboarding demo

## 8) Tracking Process

At each iteration:
1. Pick items from `Now` first
2. Implement + test
3. Update `docs/STATUS.md` and this roadmap
4. Add ADR when significant decisions are made
