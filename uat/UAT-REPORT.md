# UAT Report — OpenSelf (Post-Fix Verification)
**Date:** 2026-03-14
**Tester:** Claude (automated UAT)
**Mode:** Full destructive E2E cycle — cooperative onboarding + post-publish stress test
**Environment:** localhost:3000, dev, SQLite
**Branch:** main
**Commit:** da202df

## Persona
| Field | Value |
|-------|-------|
| Name | Marco Bellini |
| Profession | UX Designer freelance |
| City | Milano |
| Language | it (Italian) |
| Style | Short, natural messages |
| Tech level | high |

## Summary
| Metric | Count |
|--------|-------|
| Total messages sent | 18 |
| Total checks | 22 |
| Passed | 19 |
| Failed | 2 |
| Warnings | 1 |

## Goal Achievement
| # | Goal | Status | Notes |
|---|------|--------|-------|
| G1 | Introduce self | Pass | Agent asked name, then profession naturally |
| G2 | 10+ facts gathered | Pass | 15 facts across 9 categories |
| G3 | Page generated | Pass | Generated after collecting ~5 facts |
| G4 | 3 layouts tested | Pass | Monolith, Architect, Curator — all rendered correctly |
| G5 | Contradiction handling | Pass | "Cambia nome in Giovanni" → confirmation gate → "No scherzo" → correctly kept Marco |
| G6 | Out-of-scope request | Warning | Video embed — agent asked for details instead of explaining limitation |
| G7 | Publish | Pass | Signup modal with username pre-filled, published to /marco |
| G8 | Post-publish edits | Pass | Skills added, interests removed, projects deleted — all reflected on re-publish |
| G9 | Section reorder | **Fail** | Agent claimed success but order unchanged in preview (BUG-2 persists) |

## Facts Coverage
| Category | Facts | Notes |
|----------|-------|-------|
| Identity | 2 | name, location (Milano) |
| Experience | 2 | Freelance (current), Frog Design |
| Education | 1 | Politecnico, Interaction Design |
| Project | 0 | Created 2 then deleted both (user request) |
| Interest | 2 | Tipografia, Design sostenibile (caffe removed) |
| Activity | 1 | Ciclismo |
| Language | 3 | Italiano, Inglese, Spagnolo |
| Skill | 3 | Figma, Sketch, Prototyping |
| Stat | 1 | 8+ years experience |
| **Total** | **15** | |

## Layout Matrix
| Layout | Result | Screenshot | Notes |
|--------|--------|------------|-------|
| Monolith | Pass | uat/05-cooperative-projects.png | Default, clean vertical |
| Architect | Pass | uat/06-layout-architect.png | Grid layout, all sections in cards |
| Curator | Pass | uat/07-layout-curator.png | Sidebar left, content right |
| Back to Monolith | Pass | uat/09-published-page.png | Restored correctly |

## Agent Behavior Analysis

### Conversation Quality
| Scenario | Agent Response | Rating |
|----------|---------------|--------|
| Introduction | Natural, asked name then profession | 5 stars |
| Detail gathering | Good pacing, one topic at a time | 5 stars |
| Multiple facts per message | Handled well (ciclismo + caffe) | 5 stars |
| Layout change | Listed options, applied correctly | 4 stars |
| Identity change confirmation | Asked confirmation, respected "no" | 5 stars |
| Fact deletion (single) | Clean "Rimosso" — no double response | 5 stars |
| Fact deletion (multiple) | Asked confirmation, deleted with gate | 5 stars |
| Section reorder request | Claimed success but didn't execute | 1 star |
| Out-of-scope (video) | Should have refused, instead asked details | 2 stars |
| Post-publish editing | Smooth — added skills, removed items | 5 stars |
| Re-publish flow | Directed to Publish button correctly | 5 stars |

### Agent Strengths
- Natural Italian conversation — felt human
- Identity protection gate works correctly (confirmation before name change)
- BUG-3 fix verified: single deletion gets clean "Rimosso" without contradiction
- Delete gate for 2nd+ deletion works (asked confirmation for IoT project)
- Post-publish editing workflow is smooth (banner + publish button)
- Fact extraction accurate — 15 facts from short messages
- Layout switching preserves all sections

### Agent Weaknesses
- BUG-2 PERSISTS: Section reorder claims success but doesn't actually change visual order
- Video embed: Agent should refuse (unsupported feature) but instead asks for details
- Chat stream error on 2nd message (recovered via "Aggiorna chat")

## Bug Log
| # | Type | Severity | Description | Step | Screenshot |
|---|------|----------|-------------|------|------------|
| 1 | Stream | Medium | Chat response stream error on 2nd message ("Qualcosa e andato storto"). Facts were saved, page updated, but agent text response was lost. Recovered via "Aggiorna chat" — response was persisted. | Phase A msg 2 | uat/04-error-but-page-updated.png |
| 2 | Agent | Medium | Section reorder: agent said "Lingue e ora subito dopo Chi Sono" but section order in preview unchanged. Lingue remained at bottom. Same as previous UAT BUG-2. Prompt fix insufficient — the reorder tool may work but projectCanonicalConfig re-derives order from facts, overwriting draft section order. | Post-publish stress | uat/10-reorder-failed.png |
| 3 | Agent | Low | Video embed: agent asked for YouTube/Vimeo details instead of explaining that video embed is not supported. Should gracefully refuse. | Post-publish stress | — |

## DB Integrity
| Check | Result |
|-------|--------|
| Published page accessible | Pass — /marco loads correctly |
| All facts public after publish | Pass — 15 facts, all visibility=public |
| Draft + Published rows | Pass — 2 page rows (draft + published) |
| Deleted facts removed | Pass — caffe speciality and 2 projects not in active facts |
| Skills added post-publish | Pass — Figma, Sketch, Prototyping visible |
| Profile created | Pass — username=marco |
| Console errors | 1 error (proposals API 500, non-blocking) |
| Chat history persistence | Pass — history preserved across navigation |

## Screenshots Index
| File | Description | Phase |
|------|-------------|-------|
| uat/01-home.png | Home page | Setup |
| uat/02-builder-empty.png | Builder empty state | Setup |
| uat/03-intro-name.png | Name saved, Hero generated | Phase A |
| uat/04-error-but-page-updated.png | Stream error (page still updated) | Phase A |
| uat/05-cooperative-projects.png | Full page after projects | Phase C |
| uat/06-layout-architect.png | Architect layout | Layout test |
| uat/07-layout-curator.png | Curator layout | Layout test |
| uat/08-signup-modal.png | Signup modal | Publish |
| uat/09-published-page.png | First published page | Publish |
| uat/10-reorder-failed.png | Section reorder failed (BUG-2) | Stress test |
| uat/11-republished.png | Re-published after edits | Re-publish |

## BUG-2 Analysis — Section Reorder Still Failing

The prompt fix added in this release ("For ANY request to change section order -> use reorder_sections") was **necessary but not sufficient**. The agent now correctly identifies it should use reorder_sections (not update_page_style), but the underlying issue is deeper:

`reorder_sections` updates the draft's section array order via `upsertDraft()`, BUT `projectCanonicalConfig()` re-derives section order from facts during preview rendering, overwriting the draft's custom order. The `draftMeta.sections` order is used as a hint for slot assignment (draftSlots map) but NOT for array ordering within the `main` slot on monolith layout.

**Root cause**: The section order in `projectCanonicalConfig` is determined by the composition pipeline (`composeOptimisticPage`), not by the draft's section array. The draft order hint only applies to slot carry-over, not visual rendering order.

**Fix needed**: `projectCanonicalConfig` should respect draft section order when `draftMeta` is provided — sort composed sections by draftMeta section order (already partially implemented at lines 145-160 but may not cover all cases).

## Overall Score: 87/100

**Deductions:**
- -7: BUG-2 (section reorder still fails — false positive claim)
- -3: BUG-1 (chat stream error on 2nd message — recovered)
- -3: BUG-3 (video embed not gracefully refused)

**Improvements from previous UAT (85/100):**
- BUG-3 from previous UAT (double response on delete) is FIXED — clean "Rimosso" response
- Delete confirmation gate works correctly for multiple deletions
- Identity protection gate verified working
- Post-publish edit+republish flow is solid
