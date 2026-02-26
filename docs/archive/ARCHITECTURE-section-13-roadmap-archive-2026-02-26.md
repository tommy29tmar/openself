# ARCHITECTURE Section 13 Archive (2026-02-26)

This file preserves the full historical roadmap/checklist content that was previously
embedded in `docs/ARCHITECTURE.md` under `## 13. Roadmap`.

Reason for extraction:
- keep `ARCHITECTURE.md` focused on target architecture and runtime contracts
- keep execution planning in `docs/ROADMAP.md`
- keep runtime truth in `docs/STATUS.md`

---

## 13. Roadmap

### 13.0 Access Control Sequencing (Linear Delivery)

> **Update (2026-02-24):** Multi-user sessions were pulled forward from Phase 2 to
> Phase 0 gate. The invite gate alone (without data isolation) was insufficient — every
> user shared the same draft/facts, and the LLM was exposed without message limits.
> The full multi-user model (sessions, scoped data, registration, chat limits) is now
> implemented and deployed. See Section 11.6 and ADR-011 amendment.

Execution as delivered:

1. **Phase 0 gate (done):** Invite-code gate + full multi-user session isolation +
   message limits + registration flow. Backward-compatible: without `INVITE_CODES`
   env var, the app runs in single-user mode with zero behavior change.
2. **Phase 1 (current):** Agent quality (memory, heartbeat, extended sections, hybrid compiler).
3. **Layout template engine (done, anticipated from Phase 1b):** 3 templates, slot assignment, widget registry, lock system, validation gates.

### Phase 0 — Foundation (Months 1-2)

**Goal:** A working prototype that makes someone say "wow, I want this."

Phase 0 is split into two measurable sub-steps to reduce execution risk and provide
an early visual checkpoint before wiring the full agent brain.

#### Phase 0.1 — Data & UI Skeleton

**Goal:** Approve the visual foundation and rendering pipeline with static data,
before any LLM integration.

```
Data layer:
  [x] Project scaffolding (Next.js 15 + TypeScript + Tailwind + shadcn)
  [ ] Database schema (SQLite + Drizzle ORM)
  [ ] Taxonomy normalizer + alias registry
  [ ] Confidence + VisibilityPolicy (`private`/`proposed`/`public`/`archived`)
  [ ] PageConfig schema + validator (Zod/JSON Schema)
  [ ] Media storage layer (SQLite blob default + optional fs/s3 backend)
  [ ] SQLite runtime hardening (`WAL` + `busy_timeout` + retry backoff for lock contention)

UI & rendering:
  [ ] Page engine: 5 core components (hero, bio, skills, projects, social)
  [ ] Page renderer: config JSON → HTML page
  [ ] 2 themes (minimal, warm)
  [ ] Chat UI (functional shell — sends/receives messages, no agent behind it yet)
  [ ] Public page at /[username]
  [ ] Split-view: chat + live preview
```

**Definition of done (0.1):** You can load a hardcoded PageConfig, see a beautiful
rendered page at /username with both themes, and interact with a chat shell that
echoes messages. The visual contract is validated before agent work begins.

#### Phase 0.2 — Agent Brain & Sync

**Goal:** Wire the LLM, make the conversation real, and close the 5-minute loop.

```
Agent core:
  [ ] LLM adapter (Vercel AI SDK — OpenAI + Ollama)
  [ ] Agent core: system prompt, conversation, tool calling
  [ ] PromptAssembler (block-based system prompt + versioned prompt IDs)
  [ ] Context budget manager (history summary + top-K fact retrieval)
  [ ] Knowledge base: CRUD + autonomous fact extraction

Onboarding flow:
  [ ] Onboarding publish checkpoint (batch approval)
  [ ] Hybrid live preview (optimistic per turn + milestone synthesis)
  [ ] Live preview state machine (`optimistic` immediate + async synthesis statuses)
  [ ] Low-signal onboarding fallback (`utente muto`) with guided prompts and safe minimal page generation
  [ ] Language selection at onboarding (before conversation starts)

Reliability:
  [ ] Background worker + jobs queue (scheduler tick + retries)
  [ ] PageConfig schema-repair loop (validation error -> structured retry, max attempts, explicit user fallback)
  [ ] Reliability telemetry baseline (`agent_events` for validation failures/retries/fallbacks)
  [ ] LLM Evals suite (deterministic offline tests: canned conversations → assert correct fact extraction, no data loss, no hallucinated deletions)
  [ ] Basic rate limiting (per-IP throttle on chat API, conversation pace cap)

Not in this phase (updated — multi-user was pulled forward, see 13.0):
  - ~~No account auth / multi-user data model~~ → Implemented at Phase 0 gate (invite codes + sessions + registration)
  - ~~Hosted invite gate may be enabled as an operational access control (no schema change)~~ → Implemented with full schema change (session_id on facts/page/agent_config)
  - No connectors
  - No voice
  - No heartbeat
  - No semantic search (simple keyword search is fine)
  - No page translation (page is in the user's language only)
  - No discovery / federation
```

**Definition of done (0.2):** You open the app, chat for 5 minutes, and have a beautiful
page at /username. You can say "make it darker" and it changes. You can say "I also
play guitar" and it adds an interests section.

#### Phase 0 Gate: Closed Alpha / Dogfooding

Before Phase 1 begins and before any public GitHub push, the end-to-end flow must
survive real-world usage outside the development team.

```
  [ ] Founders create their own pages using the live product
  [ ] 10+ trusted testers (friends, colleagues) complete the full onboarding flow
  [x] Hosted deployment enforces invite-only builder access with full multi-user session isolation
  [ ] Collect structured feedback: UX friction, agent quality, rendering bugs
  [ ] Stress-test LLM adapter with diverse languages, edge-case inputs, and adversarial prompts
  [ ] Fix critical issues surfaced during dogfooding
  [ ] LLM Evals pass rate ≥ 95% on canned test suite
```

**Definition of done (gate):** At least 10 real profiles exist, critical bugs are
resolved, and the team has confidence the 5-minute promise holds for non-developers.

### Phase 1 — Living Agent (Months 2-4)

**Goal:** The agent comes alive. It remembers, adapts, and connects to the world.
Pages become personal — not just data-driven, but voice-driven.

```
Agent — Memory & Heartbeat (first):
  [ ] Agent config (personality, tone, page_voice — evolving)
  [ ] Agent memory (meta-observations about the user — Tier 3)
  [ ] Conversation history summarization (Tier 2 rolling summaries)
  [ ] Semantic search (sqlite-vec embeddings)
  [ ] Heartbeat system (periodic self-reflection)
  [ ] Conversation context assembly (facts + history + memory + page state)
  [ ] LLM usage metering + budget enforcement (daily token limits, cost caps, warning thresholds)
  [ ] Anti-abuse hardening (conversation pace throttle, session length caps, stealth captcha on onboarding→chat transition)
  [ ] Fact conflict resolver v1 (source precedence + supersede semantics + deterministic merge policy)
  [ ] LLM Evals expansion (multi-session coherence: assert KB integrity after 50+ simulated conversations)

Page — Layout Template Engine (anticipated, done):
  [x] Layout registry: 3 templates (vertical, sidebar-left, bento-standard) with slot-based assignment
  [x] Widget registry: 20+ widgets with section type + slot size compatibility
  [x] Renderer decoupling: ThemeLayout (visual wrapper) + LayoutComponent (CSS Grid)
  [x] Lock system: granular section locks + agent proposals + central enforcement
  [x] Validation gates: composer, set_layout, update_page_config, publish pipeline
  [x] Agent tools: set_layout, propose_lock
  [x] Settings UI: template picker + persistence via /api/draft/style
  [x] 62+ layout-specific tests

Page — Extended sections (after memory foundation):
  [ ] Education section (timeline/cards variants, multi-item)
  [ ] Experience section (timeline variant, multi-item with period/role/company)
  [ ] Achievements section (badges/cards/timeline variants)
  [ ] Stats section (counters/cards/inline variants)
  [ ] Reading section (shelf/list/featured variants)
  [ ] Music section (player-style/list/grid variants)
  [ ] Contact section (form/links/card variants)
  [ ] Content type schemas + validators for each new section
  [ ] Renderer components for each new section
  [ ] Composer mappings: facts → new section types

Page — Hybrid Live Compiler (after memory + sections):
  [ ] Per-section LLM personalizer (rewrites content using facts + agent memory)
  [ ] Drill-down conversation pattern (agent deepens topic before section update)
  [ ] Section-level copy cache (hash-based, same pattern as translation_cache)
  [ ] Periodic conformity check (heartbeat job: cross-section style alignment)
  [ ] Personalizer budget tracking (extend llm_usage_daily accounting)
  [ ] Fallback: keep deterministic skeleton on personalizer failure
  [ ] All themes (5 total)
  [ ] Component variants for new and existing sections

Connectors:
  [ ] Connector interface definition
  [ ] GitHub connector (OAuth, repos, languages, contributions)
  [ ] RSS/Atom connector (blog posts from any feed)
  [ ] Manual import (CSV/JSON upload — including LinkedIn data export as priority import source)

Infrastructure:
  [ ] One-click deploy buttons (Vercel, Railway)
  [ ] .env.example with all providers
  [ ] README with screenshots, quick start, demo video
  [ ] Add `LICENSE` (AGPL-3.0) + copyright notices
  [ ] Add inbound contribution policy (`CLA` or `CAA`) + GitHub signature bot
  [ ] Static HTML export
  [ ] PDF export (profile as CV)

Operational — OAuth provider configuration:
  Routes and code are implemented for all providers below.
  Each provider requires creating an OAuth app in its developer console,
  then adding the credentials as env vars on Coolify (or .env locally).
  Callback URLs follow the pattern: https://openself.dev/api/auth/{provider}/callback

  [ ] Google: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (console.cloud.google.com/apis/credentials)
  [ ] GitHub: GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET (github.com/settings/developers)
  [ ] Discord: DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET (discord.com/developers/applications)
  [ ] LinkedIn: LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET (linkedin.com/developers/apps — requires "Sign In with LinkedIn using OpenID Connect" product)
  [ ] Twitter/X: TWITTER_CLIENT_ID + TWITTER_CLIENT_SECRET (developer.twitter.com — OAuth 2.0 with PKCE)
  [ ] Set NEXT_PUBLIC_BASE_URL=https://openself.dev on Coolify
```

**Definition of done:** The agent remembers you across sessions, proactively suggests
updates, writes personalized page copy that reflects your voice, pulls data from GitHub,
and you can export your page as static HTML. Pages from different users are noticeably
distinct in tone and narrative.

### 13.1 Execution Risk Checklist (Phase 0-1)

| Risk | Where it appears | Minimum mitigation to ship |
|---|---|---|
| JSON/schema hallucinations | Page writes from LLM tool output | Schema-repair loop, bounded retries, explicit user-facing failure message |
| Live preview latency | Onboarding split-view updates | Optimistic deterministic preview + async synthesis with visible state |
| SQLite write contention (`SQLITE_BUSY`) | Web + worker concurrent writes | WAL mode, busy timeout, per-user write serialization, retry with backoff |
| KB fact conflicts | Chat vs connectors vs heartbeat updates | Source precedence matrix + supersede/tombstone policy + audit trail |
| Silent failures / weak observability | Any background/runtime path | Structured `agent_events`, error taxonomy, counters and alerts |
| LLM coherence drift over time | Multi-session fact management | LLM Evals suite with deterministic canned conversations + regression tests |
| LLM cost abuse (public demo) | Chat API exposed to internet | Per-IP rate limiting, conversation pace throttle, session caps |
| Untested UX assumptions | First real users | Closed alpha / dogfooding gate with 10+ testers before public launch |

Phase gate:
- Phase 0.1 is not done unless data layer + rendering pipeline produce a valid page from static config.
- Phase 0.2 is not done unless first three mitigations are implemented + LLM Evals baseline passes.
- Phase 0 Closed Alpha gate must pass before any public GitHub push (see 13.2.1).
- Phase 1 is not done unless conflict resolver, observability baseline, and anti-abuse hardening are implemented.

### Phase 2 — Community & Connectors (Months 4-8)

**Goal:** Ecosystem expansion. More connectors, more customization, more users.

```
Connectors (ordered by identity migration value):
  [ ] LinkedIn data import (structured CSV/JSON from data export — bridge for professional identity migration)
  [ ] Google Scholar / ORCID (publications — high value for academic/research users)
  [ ] Strava (sports activities, stats)
  [ ] Goodreads (books, reading list)
  [ ] Spotify (listening habits)
  [ ] Letterboxd (movies)
  [ ] Duolingo (language learning)
  [ ] Last.fm (music history)
  [ ] Instagram (public posts)

Features:
  [ ] Voice input (Web Speech API + Whisper fallback)
  [ ] Voice output / TTS (eSpeak NG / Piper for local, provider APIs opt-in)
  [ ] Automatic page translation for visitors (cached + on-demand)
  [ ] Activities component with geolocation enrichment
  [ ] Identity Coach: gap analysis, trend alignment, narrative refinement (Level 2 agent)
  [ ] Contextual profiles (same data, different views: professional, personal, etc.)
  [ ] Time Capsule (yearly review of your evolution)
  [ ] Widget embeds (embed profile sections on other sites)
  [x] Auth / multi-user sessions + registration (pulled forward to Phase 0 gate — implemented 2026-02-24)
  [ ] Docker packaging (for self-hosting)

Community:
  [ ] Connector SDK + documentation (for community connectors)
  [ ] Theme SDK + documentation (for community themes)
  [ ] Component SDK + documentation (for community components/blocks)
  [ ] Component registry + review workflow (`draft`/`certified`/`deprecated`)
  [ ] Build-time component installation flow (version-pinned, no runtime remote code execution)
  [ ] DSL block format for safe community-contributed sections (no arbitrary React by default)
  [ ] Supply-chain controls (package provenance/signature verification for certified components)
  [ ] Visual regression + accessibility CI gates for themes/components
  [ ] Public roadmap
  [ ] Contributing guide
```

**Definition of done:** 10+ connectors, voice input works, anyone can build a
connector, theme, or component without breaking the recognizable OpenSelf visual DNA,
and Docker makes self-hosting trivial.

### Phase 3 — Protocol & Federation (Months 8-16)

**Goal:** From app to protocol. OpenSelf becomes one implementation of an
open standard.

```
Protocol:
  [ ] Living Profile Protocol (LPP) v0.1 specification
  [ ] Decentralized Identifiers (DID) — did:web as default
  [ ] Verifiable Credentials (W3C VC 2.0) — for provable achievements
  [ ] ActivityPub Actor per profile (followable from Mastodon)
  [ ] JSON-LD output (machine-readable profiles)

Discovery & Federation:
  [ ] Federated discovery directory (opt-in public index of pages)
  [ ] Registration key system (asymmetric keypair for ownership proof)
  [ ] Search by name, skill, interest, location across independent pages
  [ ] Activity-based discovery (same events, similar profiles — opt-in only)
  [ ] CRDT sync (Automerge) for multi-device
  [ ] P2P sync for offline-first
  [ ] Federation between OpenSelf instances
  [ ] Directory federation (community-run directories interoperate)

Agent Intelligence:
  [ ] Career/Life Navigator (Level 3): strategic repositioning, trajectory simulation
  [ ] Personal Knowledge Core (Level 4): evolution tracking, growth cycle suggestions
  [ ] Multi-model routing (cheap models for simple tasks, powerful for complex reasoning)
  [ ] Local inference for lightweight functions (cost optimization)

Advanced:
  [ ] WASM plugin system (replace TypeScript connectors)
  [ ] Connector marketplace
  [ ] Theme marketplace
  [ ] Encrypted credentials vault
  [ ] Selective disclosure (show different facts to different people)

Sustainability:
  [ ] Managed cloud service (Cloud Pro): hosted version with managed LLM budget, custom domains, priority support
  [ ] Monetization strategy definition (freemium tiers, self-host remains free forever, cloud pays for infrastructure)
  [ ] Usage-based billing for LLM and Voice API consumption on managed instances
```

**Definition of done:** OpenSelf profiles are federated, independently hosted pages
are discoverable, achievements are verifiable, and anyone can build a compatible client.

### 13.2 Public Launch & Brand Operations

This roadmap also includes external-facing operational gates. The project should not
"accidentally" go public; it should cross explicit quality gates.

#### 13.2.1 First Public GitHub Push Gate

Recommended timing: after the Phase 0 Closed Alpha gate passes (dogfooding complete,
critical bugs resolved, evals passing).

Required before first public push:
- Phase 0 Closed Alpha gate passed (10+ real profiles, structured feedback addressed)
- Working demo path: chat -> facts -> page config -> rendered page
- `README` with quick start, architecture summary, and realistic status
- `.env.example` with safe placeholders only (no secrets in repo history)
- `LICENSE` (AGPL-3.0), `CONTRIBUTING`, and issue templates
- Inbound contribution policy selected and published (`CLA` or `CAA`)
- PR legal gate enabled (GitHub bot check for signed `CLA`/`CAA`)
- Basic security hygiene: dependency audit baseline + secret scanning enabled
- Screenshots/GIF of onboarding split view and public page output

#### 13.2.2 Launch Assets Gate (Website + Docs + Demo)

Recommended timing: same week as first public GitHub push.

Minimum assets:
- Project landing page (`openself.com` or equivalent) with:
  - clear value proposition
  - 30-60s demo clip/GIF
  - links to GitHub and docs
  - current phase/status (avoid overpromising)
- Public docs section for install/run/self-host
- Founder demo profile page generated by the agent and kept online as a living proof
- Short disclaimer on demo page about what is public and what remains private-by-default

#### 13.2.3 Brand & Legal Operations Gate

Recommended timing:
- Name/domain/handle checks in late Phase 0
- Trademark filing when naming is stable and before major paid promotion
- Cloud legal docs before collecting user data at scale

Operational checklist:
- Trademark clearance search in target jurisdictions/classes
- Reserve critical domains and social handles (`X`, LinkedIn page, GitHub org)
- Prepare privacy policy + terms before managed cloud or waitlist campaigns
- Keep OSS compliance clear (AGPL notices and attribution where required)
- Finalize `CLA`/`CAA` legal text before enabling external PR merges
- Track brand usage rules (name/logo usage in community assets)

Note: legal/trademark items require qualified legal review.

### 13.3 Communication Strategy (Build in Public)

Communication is treated as an engineering workflow: consistent cadence, repeatable
formats, and clear conversion goals.

#### 13.3.1 Narrative Pillars

Use the same core narrative across all channels:
- Static profiles are obsolete
- Talk for 5 minutes, get a living page
- User-owned data, local-first by default
- Open-source, inspectable architecture, no black-box lock-in

#### 13.3.2 Channel Strategy

| Channel | Primary goal | Cadence | Format |
|---|---|---|---|
| **X** | Build-in-public momentum, developer discovery | 3-5 posts/week | Short updates, clips, before/after page examples, technical threads |
| **LinkedIn (founder)** | Credibility, product narrative, partnerships | 2-3 posts/week | Story posts, product demos, lessons learned, milestone updates |
| **GitHub** | Conversion to contributors/users | Continuous | Releases, changelogs, issues, roadmap updates |
| **Website/Blog** | Canonical source of truth | 2 posts/month | Deep dives, release notes, architecture explainers |
| **Communities** (HN, Reddit, Indie Hackers, etc.) | Targeted launch bursts | Per milestone | Honest launch posts, request feedback, share measurable learnings |

#### 13.3.3 30-Day Launch Sequence (Template)

`T-14` (pre-launch):
- Publish "what we are building" thread/post
- Ship landing page v1 and GitHub repo visibility prep

`T-7` (teasers):
- Share short demo clips (chat -> page transformation)
- Open early-access/waitlist form if needed

`Launch day`:
- Publish GitHub repo + release note + demo video
- Post synchronized launch messages on X + LinkedIn
- Submit to selected communities with transparent scope and known limits

`D+7`:
- Share first metrics and first user feedback
- Publish "what broke / what we fixed" post

`D+30`:
- Publish iteration recap and updated roadmap
- Convert best feedback into public issues/milestones

#### 13.3.4 Content Operating System

Weekly content mix:
- 1 product demo post
- 1 technical implementation post
- 1 user/use-case story
- 1 transparent progress/changelog update

Always include:
- a concrete visual (video/GIF/screenshot)
- one clear CTA (try, star, feedback, contribute)
- one measurable claim (latency, completion rate, bug fix count, etc.)

#### 13.3.5 Communication Metrics

Track leading indicators by channel:
- X/LinkedIn: impressions -> profile clicks -> landing visits
- Website: visits -> repo clicks -> demo starts
- GitHub: visitors -> stars -> forks/issues/PRs
- Product: onboarding start -> page published -> return updates

Monthly review rule:
- keep channels with strongest visit-to-action conversion
- drop low-signal formats that consume founder time without learning

### 13.4 Community Contribution Model (Now / Next / Later)

The project stays open to contributors while keeping high-risk execution surfaces
guarded. Openness is intentional, not accidental.

#### 13.4.1 Contribution Matrix

| Area | Now (Phase 0-1) | Next (Phase 2) | Later (Phase 3+) |
|---|---|---|---|
| Documentation, guides, translations | Open | Open | Open |
| Bug reports, test cases, QA repros | Open | Open | Open |
| Core UI themes/tokens | Open via PR review | Open via SDK + certification | Marketplace + certification |
| Connector development | Core-maintained first, community PRs accepted | Community SDK + registry flow | Broader plugin ecosystem |
| Page templates (`PageConfig` presets) | Open | Open | Open |
| Community blocks (DSL/schema-driven) | Design/proposal phase | Open via DSL format + validation | Expanded block catalog |
| Community React components | Not enabled by default | Build-time install, pinned versions, certified only | Optional sandboxed runtime mode |
| Runtime untrusted extensions | Not allowed | Not allowed by default | Allowed only with explicit sandbox contract |

#### 13.4.2 Openness Policy by Risk

1. **Open-by-default lanes** (low risk): docs, examples, templates, tests, non-executable assets.
2. **Reviewed code lanes** (medium risk): connectors, themes, core improvements via PR + CI gates.
3. **Guarded execution lanes** (high risk): third-party executable runtime code, only via explicit isolation model.

#### 13.4.3 Community Traction Mechanics

To avoid being "too closed", maintain explicit contributor feedback loops:
- Publish "good first issues" and "help wanted" labels continuously.
- Review SLA target: first maintainer response within 72h for community PR/issues.
- Monthly "community changelog" crediting merged contributors and shipped features.
- `experimental` channel for opt-in testing of new components/themes before certification.
- Public contribution roadmap showing what is open now, next, and later.

#### 13.4.4 Success Metrics for Community Health

Track monthly:
- number of external contributors
- issue-to-first-response time
- PR merge rate and median review time
- number of active community-maintained connectors/themes/blocks
- percentage of releases containing community contributions

#### 13.4.5 Inbound Legal Policy (`CLA` vs `CAA`)

OpenSelf remains open-source under AGPL-3.0, but inbound contributions require
an explicit legal agreement before merge. This is required to preserve long-term
project control and optional future relicensing/commercial paths.

Rules:
- Exactly one inbound mode is active at a time: `CLA` or `CAA`.
- The active mode is documented in `CONTRIBUTING.md` and surfaced in PR templates.
- A GitHub bot blocks merge until the contributor signs the required agreement.

Mode A: `CLA` (community-friendlier default)
- Contributor keeps copyright.
- Contributor grants broad, irrevocable rights to use/modify/distribute/sublicense,
  including future relicensing and transfer to project successors.
- Better community acceptance, but weaker central ownership than `CAA`.

Mode B: `CAA` (maximum control)
- Contributor assigns copyright to the project owner (where legally valid).
- Strongest position for dual licensing, acquisition due diligence, and centralized IP control.
- Higher friction for contributors and likely lower PR conversion.

Operational note:
- Keep terms short, plain-language, and transparent about why this policy exists.
- Revisit policy fit every 6 months based on contributor growth and legal needs.

---

