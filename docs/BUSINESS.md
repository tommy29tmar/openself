# OpenSelf — Business Model & Go-to-Market

Last updated: 2026-02-23

---

## 1) Beachhead Market

Launch focused, expand in waves. The vision is "for everyone", but the initial
communication speaks to people with acute pain and measurable value.

| Tier | Segment | Pain | Why first |
|---|---|---|---|
| **1** | Freelancers & consultants | Need a professional web presence, hate building/maintaining sites | High willingness-to-pay, measurable ROI (clients find them), vocal community |
| **2** | Researchers & academics | Scattered publications, no unified identity, manual CV updates | Connectors (Scholar, ORCID) as killer feature, organic word-of-mouth in departments |
| **3** | Career transitioners | Need to reposition online fast, existing profiles are stale | Intense but temporary need — high conversion urgency, lower retention |
| **4** | Freelancers needing verified identity (Phase 3) | Can't open bank accounts / access services easily — no payslip, scattered data | Highest willingness-to-pay, clear ROI, B2B2C unlocks revenue |

### Why not "everyone" at launch

- Broad messaging = weak messaging. Freelancers understand "talk for 5 minutes, get a
  professional page" immediately.
- Narrow focus means fewer edge cases, faster iteration, tighter feedback loops.
- Early adopters in Tier 1 become evangelists for the broader market.

---

## 2) Pricing

### Free Core + Pro Automation

| | Free | Pro (€9/month) | Team / Agency (€29/month) |
|---|---|---|---|
| Conversational page builder | Yes | Yes | Yes |
| AI messages | 20/month | Unlimited | Unlimited |
| Connectors | 1 | Unlimited | Unlimited |
| Themes | Core set | Core + premium | Core + premium |
| Heartbeat (auto-update) | - | Yes | Yes |
| Custom domain | - | Yes | Yes |
| Export (PDF/CV, static HTML) | - | Yes | Yes |
| Contextual profiles | - | Yes | Yes |
| Pages per account | 1 | 1 | Up to 10 |

### Additional revenue streams

- **Premium themes**: one-time purchase (€5-15 per theme)
- **White-label**: organizations license OpenSelf for internal use (custom pricing)
- **Marketplace fee**: percentage on community-published connectors/themes (Phase 3+)
- **Verified identity (B2B2C, Phase 3)**: businesses pay €5-20 per verified profile
  received via "Login with OpenSelf". Users are free. See section 10.

### Pricing philosophy

- Free tier must deliver real value (a published page that looks great)
- Pro unlocks automation and professional features, not basic functionality
- Self-hosted users get 100% features free forever — cloud is convenience, not a gate

---

## 3) Unit Economics

| Metric | Value | Notes |
|---|---|---|
| Cost per free user/month | ~€0.25 | Hosting + minimal AI (20 messages) |
| Cost per Pro user/month | ~€1.75 | Hosting + unlimited AI + connectors + heartbeat |
| Pro margin | ~80% | At €9/month |
| Break-even | 200-300 Pro users | Covers infrastructure + one founder's time |
| LTV assumption (Pro) | €54-108 | 6-12 months average retention |
| CAC target | < €15 | Content-driven acquisition (build-in-public, SEO, community) |

### Cost drivers

1. **LLM API costs** — largest variable cost. Mitigated by: Haiku for simple tasks,
   aggressive caching, event-driven heartbeat (skip if nothing changed).
2. **Hosting** — minimal for SQLite-per-user architecture. Scales linearly.
3. **Connector API calls** — most connectors use free/public APIs. OAuth maintenance
   is the real cost (developer time, not dollars).

---

## 4) Moat (Cumulative Defenses)

No single moat. Defense comes from stacking multiple advantages:

1. **Connector flywheel**: more connectors → more value → more users → more community
   connectors → more value. Each connector makes the product stickier.

2. **Emotional switching cost**: your page evolves with you over months/years. The agent
   knows your story. Migrating away means losing that accumulated context — it's not
   just data, it's narrative.

3. **Trust moat**: your data, your server, open-source code, zero ads, zero tracking.
   Big tech cannot credibly replicate this positioning. LinkedIn saying "we respect your
   privacy" is not believable. OpenSelf's architecture proves it.

4. **Niche dominance**: "AI-powered living personal page" is a domain the big platforms
   ignore. LinkedIn optimizes for recruiter revenue. Squarespace optimizes for site
   building. OpenSelf optimizes for identity coherence — different game entirely.

5. **Community contributions**: themes, connectors, and page templates contributed by the
   community create a catalog that compounds over time.

6. **Identity network effect (Phase 3)**: users come for the free personal page, stay
   for the living profile, and become *verified* when they need to share credentials.
   More verified users → more businesses integrate → more users verify. This is the
   same flywheel as "Login with Google" but with rich, verified data — not just an email.

---

## 5) Launch Sequence

### Pre-launch validation

Before writing Phase 1 code, validate demand:

1. **Landing page + waitlist** at openself.com
   - Clear value prop: "Talk for 5 minutes. Get a living personal page."
   - Email capture
   - **Success signal**: 200+ emails in 2 weeks
2. **5-10 interviews** with freelancers/consultants (Tier 1 beachhead)
   - Validate the pain, understand current workarounds, test pricing sensitivity
3. **Pro tier visible** on landing page with "coming soon"
   - Track clicks as demand signal

### Launch sequence

```
Phase 0 Gate passed (dogfooding complete)
        │
        ▼
1. DOGFOODING (weeks)
   - Use the product personally for weeks
   - Your page live at openself.com/tom as permanent demo
   - Fix critical issues from self-use

2. PRIVATE LAUNCH (100 invites)
   - First 100 users, 50 AI messages/month free
   - Sentry error tracking active
   - agent_events + llm_usage_daily telemetry
   - Discord/GitHub Discussions for feedback
   - Respond to every piece of feedback personally

3. DAILY OPERATIONS (5 min/morning)
   - Check dashboard (see section 7)
   - Fix, release, repeat

4. STABILIZE
   - When error rate < 1% and retention signal positive
   - Open to all + Pro tier active

5. OPEN SOURCE PUSH
   - GitHub public with Phase 0 solid and working
   - Not Phase 2-3 half-built — ship what works
   - README with screenshots, quick start, demo video
```

### Launch connectors for day 1

For the launch, ship 3 connectors that cover the beachhead:

| Connector | Effort | Why |
|---|---|---|
| GitHub | Easy (1-2h) | Freelancer/dev beachhead, public API |
| Strava | Medium (half day) | Lifestyle signal, broad appeal |
| Spotify | Medium (half day) | Fun, shareable, engagement driver |

Everything else comes after, driven by user demand. The bottleneck is OAuth flows
and rate limits, not code complexity.

### Easy wins to add early based on demand

GitHub, RSS, Chess.com, Duolingo, ORCID — all easy (1-2h each, public APIs).

### Hard connectors (not for launch)

- **LinkedIn**: no public API → manual import (CSV/JSON from data export)
- **Instagram**: API restrictions → public profile scrape only, fragile

---

## 6) Open-Source Strategy

- Launch on GitHub when Phase 0 is solid and the onboarding flow works end-to-end
- The self-hosted version has 100% of features, always
- Cloud (openself.com) is hosting convenience, not a feature gate
- Community connectors only after the connector interface is stable and documented
- AGPL-3.0 ensures forks that host publicly must share source changes

---

## 7) Observability Plan

### Tools (total cost: ~€0)

| Tool | Purpose | Tier |
|---|---|---|
| Sentry | Error tracking | Free tier (indispensable, non-negotiable) |
| UptimeRobot or BetterStack | Uptime monitoring | Free tier |
| GitHub Actions | CI/CD, automated tests | Free for open-source |
| `agent_events` table | Internal telemetry (tool calls, errors, fallbacks) | Built-in |
| `llm_usage_daily` table | LLM cost tracking | Built-in |
| "Report a problem" button | Direct user feedback | Built-in |
| Discord / GitHub Discussions | Community feedback channel | Free |

### Daily dashboard (5 minutes every morning)

| Metric | Source |
|---|---|
| Pages created yesterday | `page` table count |
| LLM errors | `agent_events` where `event_type LIKE 'translation_error%' OR ...` |
| `page_config_validation_failed` count | `agent_events` |
| `sqlite_busy_retry` count | `agent_events` |
| Daily LLM cost | `llm_usage_daily` |
| Returning users (retention signal) | Session/page update timestamps |

### Immediate alerts

| Condition | Action |
|---|---|
| Error rate > 5% in one hour | Sentry alert → investigate |
| Daily LLM cost above threshold | `llm_limits` hard-stop + alert |
| OAuth connector failure spike | Check provider status, disable connector temporarily |
| Zero pages created in 24h | Something is broken or nobody is using it — investigate both |

---

## 8) Reduction of Execution Risk

### Leaner Phase 0

- Core loop only: chat → page → publish → URL
- Single theme at launch (minimal), add warm after validation
- No split-view in the very first version if it causes build issues
- Ship what works, not what's designed

### Validate before building

- Landing page + waitlist before Phase 1 features
- Strong signal = 200+ emails in 2 weeks
- Weak signal = pivot messaging before investing in features

### Monetize signals from day 1

- Pro tier visible with "coming soon" on landing page
- Track click-through rate on Pro features as demand signal
- Don't build Pro features until demand is validated

---

## 9) Non-Goals (Business)

1. No advertising revenue — ever
2. No data selling or data brokering
3. No engagement optimization (time-on-site, notifications, streaks)
4. No feature gating that makes free users feel like second-class citizens
5. No investor pressure to grow at all costs — sustainable unit economics first

---

## 10) OpenSelf Verified — B2B2C Evolution (Phase 3)

### The insight

The same digital twin that powers a personal page can become a **portable verified
identity**. The user experience doesn't change — chat, connect, build. But the profile
becomes economically valuable when anchored to institutional sources.

### The problem it solves

- **For users**: every new service = new form, new KYC, new questionnaire. Tedious, slow, repetitive
- **For businesses**: KYC costs €50-100/customer, takes days, has 40-60% onboarding dropout
- **For banks specifically**: freelancers/P.IVA are hard to evaluate (no payslip, variable income, scattered data)

### How it works

```
User (free)                             Business (pays)
───────────                             ───────────────
1. Chats → builds profile               1. Integrates "Login with OpenSelf"
2. Connects SPID/CIE (verified ID)      2. Requests specific data fields
3. Connects bank (via Tink/Plaid)        3. User approves on consent screen
4. Profile enriches over time            4. Receives verified profile instantly
5. Controls who sees what                5. Pays €5-20 per profile
```

### Trust tier model

| Tier | Source | Trust level | Example |
|---|---|---|---|
| 1 | Self-declared (chat) | Low | "I'm a freelancer" |
| 2 | Connector-verified | Medium | 50 GitHub repos, 8y LinkedIn experience |
| 3 | Institutionally-verified | High | SPID identity, bank statements (PSD2) |
| 4 | Cross-referenced (AI) | Computed | No contradictions across sources → high score |

### Market opportunity

- Global Identity Verification market: ~$12B (2024), projected $30B+ by 2030
- EU bank fraud losses: ~€1.8B/year (ECB 2023)
- Average KYC cost per bank customer: €50-100
- KYC onboarding dropout: 40-60%

### Competitive positioning

OpenSelf Verified occupies a unique space that no current player covers:

| What they do | What OpenSelf adds |
|---|---|
| SPID/CIE: *who you are* | + *what you do, what you're worth* |
| Plaid/Tink: *bank data* | + *professional history, skills, reputation* |
| Onfido/Veriff: *document scan* | + *conversational UX, rich profile, living data* |
| LinkedIn: *professional network* | + *verified, not self-reported; portable, not platform-locked* |

The moat is **UX × richness × trust compounding**: no one else builds a verified
identity through a 5-minute conversation that improves every day.

### Unit economics (Phase 3)

| Metric | Value | Notes |
|---|---|---|
| Revenue per verification | €5-20 | Depends on data depth requested |
| Cost per verification | ~€0.50 | API calls to verification partners |
| Margin | ~90%+ | After infrastructure costs |
| Break-even (B2B) | 1 bank pilot, ~500 verifications/month | Covers compliance + partner costs |

### Beachhead: freelancers × Italian banks

1. **Why freelancers**: most underserved by traditional KYC (no payslip = hard to evaluate)
2. **Why Italian banks**: contact with Intesa Sanpaolo via Mooney founder; Italian market less competitive than UK/US for identity verification
3. **Why banks first**: highest willingness-to-pay, clear ROI, regulatory pressure to innovate

### Dependencies and risks

| Dependency | Mitigation |
|---|---|
| Compliance (GDPR, eIDAS, PSD2) | Partner with certified provider (InfoCert, Namirial) |
| Bank integration | Validate with 1 bank before building |
| Chicken-and-egg (users ↔ businesses) | Users come for the free personal page; B2B is the second act |
| Co-founder with banking expertise | Required for Phase 3 execution |

### What NOT to do

- Do NOT build Phase 3 tech before validating B2B demand with real bank conversations
- Do NOT delay Phase 1-2 for Verified features — the personal page IS the user acquisition engine
- Do NOT attempt compliance in-house — always via certified partner
- Do NOT store raw banking data — only processed/aggregated signals
