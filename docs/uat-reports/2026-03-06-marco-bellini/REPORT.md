# UAT Report: Marco Bellini — Full Journey Test

**Date:** 2026-03-06
**Persona:** Marco Bellini, 35, brand designer / direttore creativo, Bologna
**Language:** Italian
**Session ID:** d0b8a6f8-aae3-4afc-8c85-...
**Registered as:** uat-marco-bellini

## Summary

25 messages sent out of 50 planned. 15 received real agent responses, 10 hit HTTP 429 (rate limit).
Test covered: first_visit onboarding → page generation → publish → registration → post-publish edits.
Test was cut short at msg #25 due to rate limiting cascade.

**Messages breakdown:**
- #1–#9: Onboarding + publish flow (all successful)
- #10–#15: Post-publish edits (all successful)
- #16–#25: Rate-limited (429), no agent response

## Results

### What Worked Well

1. **Onboarding flow** — Agent correctly identified journey state (first_visit), asked for name, then job, then projects/hobbies
2. **Fact creation** — 20 new facts created across identity, experience, skill, project, achievement, activity, interest categories
3. **batch_facts** — Agent used batch operations for efficiency (msgs #6, #7, #12)
4. **Page generation** — generate_page called twice during onboarding, page rendered correctly
5. **Publish flow** — request_publish worked, username accepted
6. **Registration** — API registration succeeded, new session cookie issued
7. **Post-publish corrections** — Agent correctly searched for existing facts before updating (msgs #11, #12)
8. **Section reordering** — reorder_sections tool used correctly to prioritize projects (msg #15)

### DB State After Test

- **Total facts on profile:** 403 (+20 from test)
- **Messages:** 605
- **Pages:** 24
- **Facts created:** name, city, age, studio-forma, anni-esperienza, branding, identita-visiva, design-con-marco, social links, velasca-rebranding, google-italia-event, escursionismo, chitarra, fotografia-analogica, adi-design-index-2024, domus-article, ebook-design-sostenibile, figma, affinity-designer

## Bugs Found

See `bugs.md` for detailed descriptions with reproduction steps.

| # | Severity | Bug | Affected File |
|---|----------|-----|---------------|
| 1 | **P1** | Rate limiter shares bucket for all localhost sessions | `src/lib/middleware/rate-limit.ts` |
| 2 | **P2** | Facts not saved immediately despite policy requirement | `src/lib/agent/policies/first-visit.ts`, `route.ts` |
| 3 | **P2** | Anthropic 429 returned as HTTP 500 to client | `src/app/api/chat/route.ts` |
| 4 | **P3** | Action claim guard misses no-op claims | `src/lib/agent/action-claim-guard.ts` |
| 5 | **P3** | No publish gate minimum profile check in script | `scripts/uat-chat-agent.mjs` |
| 6 | **P3** | Clarification loop not capped (agent kept asking) | Agent prompt / turn management |

## Timeline

| Msg | Phase | Tools | Notes |
|-----|-------|-------|-------|
| 1 | onboarding | 0 | Greeting, asked name |
| 2 | onboarding | 3 | Created name, city, age facts |
| 3 | onboarding | 4 | Created studio, experience, skills |
| 4 | onboarding | 0 | **BUG: No facts saved for Velasca/Tannico/Satispay/Google** |
| 5 | onboarding | 0 | **BUG: No facts saved for hobbies** |
| 6 | onboarding | 2 | batch_facts + generate_page (caught up on YouTube, social) |
| 7 | onboarding | 2 | batch_facts + generate_page (awards, publications) |
| 8 | publish | 1 | request_publish |
| 9 | publish | 0 | Agent refused password (correct), registration via API |
| 10 | post_publish | 0 | Transition acknowledged |
| 11 | post_publish | 2 | Studio name already correct |
| 12 | post_publish | 2 | Added Figma + Affinity Designer skills |
| 13 | post_publish | 0 | **BUG: Claimed ADI year fixed but no tool called** |
| 14 | post_publish | 0 | Asked for clarification on achievements visibility |
| 15 | post_publish | 2 | Reordered sections + regenerated page |
| 16-25 | — | 0 | All HTTP 429 rate limited |
