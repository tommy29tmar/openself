# Design: Business Plan v2 — Identity Evolution

**Date:** 2026-03-13
**Status:** Approved (post multi-model adversarial challenge)
**Author:** Claude (brainstorming skill)

## Problem

OpenSelf BP v1 is a pure B2C personal page builder. A conversation with the Mooney creator (now at Intesa Sanpaolo) revealed banking fraud via fake accounts as a massive problem, sparking an identity evolution idea. The user wants BP v2 to integrate progressive digital identity certification alongside the existing coach/page product.

## Challenge Summary

The design went through a 2-round adversarial review (Gemini + Claude Agent + Claude Systems Thinker). Key outcomes:

### What held up
- Consumer product (AI coach + personal page) as primary value proposition
- L1 (self-declared) and L2 (connector-verified) as legitimate user features
- Mooney/Intesa conversation as market validation signal
- Founder's CDP background as fintech credibility

### What changed (unanimous)
- **L4 AI trust score → REMOVED.** EU AI Act high-risk, liability nightmare, signals regulatory naivety
- **B2B revenue projections → EUR 0 for Years 1-2.** No B2B revenue until signed LOI
- **"Accedi con OpenSelf" API → REMOVED from operational plan.** Vision section only
- **TAM → stays at EUR 5B** (personal branding). No KYC market claim
- **60-70% code reuse claim → REMOVED.** Honest about discontinuity, but SQLite is NOT a blocker (see below)
- **Dual-track framing → Single-track with vision horizon.** BP presents ONE company (B2C AI coach), with identity as strategic direction post-Series A

### What was rejected
- Gemini: "remove B2B from roadmap entirely" → rejected because Lazio Innova evaluates scalability. Vision section needed
- Gemini: "Zero-Knowledge Credential Builder" branding → SPID still requires AgID registration. But the concept (user controls verified assets) is adopted
- Technical Validator: "SQLite is a dealbreaker" → REJECTED. See SQLite section below
- Technical Validator: EUR 9.99/month as primary tier → founder flagged as too high

### SQLite defense (user-confirmed)
SQLite is a deliberate architectural choice, NOT a limitation:
- 1 file = 1 identity (backup = copy a file)
- Zero configuration, zero DB server
- Performance sufficient for single-user
- Aligned with local-first philosophy

For Phase 1-2 (personal page + identity coach), SQLite is the right choice. PostgreSQL not needed.

When would PostgreSQL be needed? Only if/when OpenSelf Verified scales to thousands of simultaneous users with concurrent B2B disclosure. Even then, SQLite-per-user could work (each user has their file, B2B services read via API).

Migration effort if needed: Drizzle ORM makes 33% of code already portable. Raw SQL is methodical refactoring, not rewrite. FTS5 is the only real blocker (isolated in 2-3 files). The "60-70% code reuse" refers to business logic (facts, connectors, clustering, journey, agent) — stays identical regardless of DB. With Claude Code Opus high thinking, the refactoring takes hours, not the estimated 135 hours.

## Refined BP v2 Structure

### Core Repositioning
OpenSelf is an **AI-powered professional identity platform**. Not a page builder. Not an identity provider. A platform where professionals build, enrich, and leverage their complete professional identity through conversation.

### Section-by-Section Changes from BP v1

#### Section 1 — Executive Summary
**Changes from v1:**
- Lead shifts from "page builder" to "AI coach that builds your professional identity through conversation"
- ADD: identity evolution as vision (1 paragraph, not operational plan)
- ADD: Mooney/Intesa conversation as market validation signal
- Pricing updated: Free → Pro EUR 4.99/month → Portfolio+ EUR 9.99/month (drops Founding Pro EUR 2.99, Pro+ Coach EUR 14.99)
- SOM updated: 5,000 users, EUR 180K ARR by Year 3 (was 1,500 users, EUR 120K ARR by Year 5)
- "La richiesta" updated to reflect Pre-Seed 3.0 Lazio Innova (EUR 145K grant), not Smart&Start
- Vision paragraph adds identity certification as natural evolution, EUDI Wallet integration opportunity

#### Section 2 — Problem & Market
**Changes from v1:**
- ADD Problem B: professionals can't prove credibility (freelancer bank account opening, rental applications, gig economy trust gap)
- ADD context: digital fraud EUR 5.8B/year in EU banking, eIDAS 2.0 coming — but NOT claiming this as TAM
- TAM stays EUR 5B (personal branding + professional tools)
- SAM stays EUR 1.2B (European freelancers/creators)
- SOM updated: 5,000 users, EUR 180K ARR by Year 3
- ADD Segment D: professionals needing credibility proof (gig workers, international freelancers)
- Competitive table: ADD column "Identity/Credibility" — none of the competitors have it
- Keep all 4 macro-trends, ADD Trend 5: "Trust deficit in the gig economy"

#### Section 3 — Solution
**Changes from v1:**
- Keep all existing product description (3.1-3.4)
- ADD 3.6: Progressive Profile Enrichment (L1 self-declared + L2 connector-verified) — framed as user features, NOT identity infrastructure
- ADD 3.7: "Verified Portfolio" concept — user-controlled verified badges on page, PDF export of verified professional dossier
- Pricing table updated:
  - Free: EUR 0 (page + 2 connectors + limited chat)
  - Pro: EUR 4.99/month (all connectors, full memory, custom domain, worker)
  - Portfolio+: EUR 9.99/month (verified badges, PDF dossier export, priority curation)
  - Drop Founding Pro (too complex for grant evaluators)
  - Drop Pro+ Coach (move to roadmap Phase 4)
- User journey (Marco): ADD step where Marco's enriched profile helps him open a bank account faster — but he takes the dossier himself, OpenSelf doesn't broker it
- ADD 3.8: SQLite as architectural advantage — local-first, privacy-first, Drizzle ORM portability

#### Section 4 — Innovation
**Changes from v1:**
- Keep 9 existing innovations (all still valid)
- ADD Innovation 10: Progressive Profile Enrichment — L1+L2 verification via conversation + connectors
- ADD Innovation 11: Verified Professional Dossier — user-controlled credential export
- Competitive table: ADD identity/credibility column (no competitor has conversation-driven enrichment)
- Do NOT add L3/L4 as innovations (not in scope for Pre-Seed)

#### Section 5 — Team
**Changes from v1:**
- ADD: Mooney creator / Intesa Sanpaolo connection as market validation
- ADD: Founder's 7.5 years at CDP directly relevant to financial services understanding
- ADD advisory role: "identity/compliance advisor" for future identity evolution
- Keep everything else unchanged

#### Section 6 — Go-to-Market
**Changes from v1:**
- Keep Phases 0-2 largely unchanged
- Adjust pricing references (EUR 4.99 not EUR 5.99)
- ADD: Vertical positioning for freelancers needing credibility proof
- Remove Identity API / B2B references from operational GTM
- Keep beta plan, Product Hunt, referral program unchanged

#### Section 7 — Financial Model
**Changes from v1:**
- CRITICAL: Rewrite for Pre-Seed 3.0 Lazio Innova (EUR 145K grant), NOT Smart&Start
- Pricing tiers: Free / Pro EUR 4.99/month / Portfolio+ EUR 9.99/month
- NO B2B revenue line
- Unit economics recalculated for new pricing
- 18-month project timeline (Pre-Seed 3.0 requirement)
- Budget allocation: engineering (founder compensation), marketing, infra, legal/compliance, equipment
- 3 scenarios updated with dual consumer tiers
- Break-even recalculation with EUR 4.99/EUR 9.99 mix

#### Section 8 — Roadmap
**Changes from v1:**
- Compress to 3 years (Pre-Seed 3.0 is 18-month project)
- Phase 0-1 (M1-M9): Consumer product refinement, beta, launch, first paying users
- Phase 2 (M10-M18): Growth Italy, additional connectors, coach intelligence, Verified Portfolio tier
- Phase 3 (M19-M24): European expansion (8 languages ready), community, platform maturity
- Phase 4-5 remain as strategic vision, not operational plan
- Remove Identity API, B2B API, Agent Network from operational roadmap
- Keep KPI table updated

#### Section 9 — Risks + Vision & Strategic Direction (RESTRUCTURED)
**Changes from v1:**
- 9.1: Keep operational risks (solo founder, PMF, competition, LLM costs, employer authorization)
- 9.2: Keep contingency plans
- 9.3: Keep SWOT (updated)
- ADD 9.5: **Vision & Strategic Direction** (NEW section)
  - Identity certification as natural evolution (L3 via certified partners, post-Series A)
  - EUDI Wallet as integration opportunity (consumer of EUDI credentials, not competitor)
  - Platform effects: enriched profiles become valuable credentials over time
  - Mooney/Intesa conversation as validation that market demand exists
  - This section says "we know where this goes" without committing Pre-Seed resources
  - Position as complementary to eIDAS 2.0, not competing
- REMOVE: identity/regulatory risks (not applicable since we're not doing identity infra)
- ADD risk: "pricing pressure from free alternatives" with mitigation (coach value, curation quality)

#### Section 10 — Impact
**Changes from v1:**
- Keep democratization, productivity, EU sovereignty
- ADD: Financial inclusion vision (future, not promise) — freelancers will eventually be able to prove credibility
- ADD: AI-driven professional development as social impact
- Update "Perche finanziare OpenSelf" for Pre-Seed 3.0 context
- Keep sustainability model analysis

### Key Principles for Writing
1. **One company, one product, one revenue stream** — with a vision section showing the future
2. **Identity evolution is vision, not plan** — shows evaluators where this goes without committing resources
3. **Mooney/Intesa is narrative, not pipeline** — market validation signal, not B2B revenue source
4. **SQLite is a strength, not weakness** — local-first, privacy-first, portable via Drizzle
5. **Conservative numbers** — underpromise, overdeliver
6. **Pre-Seed 3.0 framing** — 18-month project, EUR 145K grant, Lazio Innova evaluation criteria (scalability, innovation, team)

### Financial Model Key Parameters
- Pro: EUR 4.99/month (EUR 49.99/year)
- Portfolio+: EUR 9.99/month (EUR 99.99/year)
- Conversion free→Pro: 7% (base scenario)
- Conversion Pro→Portfolio+: 15% of Pro users
- Year 1 target: 500 registered, 35 Pro, 5 Portfolio+
- Year 2 target: 2,000 registered, 140 Pro, 20 Portfolio+
- Year 3 target: 5,000 registered, 350 Pro, 50 Portfolio+
- LLM cost per Pro user: ~EUR 0.46/month (Haiku 4.5)
- LLM cost per Portfolio+ user: ~EUR 0.60/month (slightly higher for dossier generation)

### What Gets Written vs What Gets Referenced
- **Written fresh**: Executive Summary, Problem B, Solution 3.6-3.8, Innovation 10-11, Financial Model (entire), Roadmap (compressed), Vision section, updated Impact
- **Adapted from v1**: Problem A + market sizing, Solution 3.1-3.5, Innovations 1-9, Team, GTM, Risks 9.1-9.4, Impact (core)
- **Deleted from v1**: Smart&Start references (replaced with Pre-Seed 3.0), Pro+ Coach as Year 3 pricing tier (moved to roadmap), Identity API / B2B API references, Agent Network
