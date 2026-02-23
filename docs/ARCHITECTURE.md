# OpenSelf — Architecture

> Talk for 5 minutes. Get a living personal page.

This document is the **source of truth for target architecture**: what OpenSelf is,
how it works, and how it should be built.

Operational tracking lives in:
- `docs/STATUS.md` for current implementation reality
- `docs/ROADMAP.md` for execution priorities
- `docs/decisions/` for ADRs (durable decision rationale)

---

## Table of Contents

1. [What Is OpenSelf](#1-what-is-openself)
2. [How It Works](#2-how-it-works)
3. [System Architecture](#3-system-architecture)
4. [The Agent](#4-the-agent)
5. [Knowledge Base](#5-knowledge-base)
6. [Page Engine](#6-page-engine)
7. [Connectors](#7-connectors)
8. [Data Model](#8-data-model)
9. [UX Principles](#9-ux-principles)
10. [Technical Stack](#10-technical-stack)
11. [Deployment](#11-deployment)
12. [Security & Privacy](#12-security--privacy)
13. [Roadmap](#13-roadmap)
14. [Design Decisions](#14-design-decisions)
15. [Execution Spec](#15-execution-spec)

---

## 1. What Is OpenSelf

OpenSelf is an open-source tool that builds and maintains your personal web page
through conversation. You talk to an AI for 5 minutes. It creates a beautiful page about
you. As your life changes, you tell it (or it learns from connected services), and the
page evolves with you.

It is not a social network. It is not a website builder. It is a **living page** — one
that grows, adapts, and stays current without you having to think about it.

**For everyone.** Not just developers. Not just professionals. Anyone who wants a personal
page that actually represents who they are today.

### Core Promise

You should never have to manually update your online presence again. Talk to your agent
like you would talk to a friend. It handles the rest.

### What Makes It Different

| Traditional profiles | OpenSelf |
|---|---|
| You fill out forms | You have a conversation |
| Static until you manually update | Evolves autonomously |
| One format fits all | Your page, your way |
| Platform owns your data | You own everything |
| Closed, proprietary | Open-source, AGPL-3.0 |

### The Bigger Vision

OpenSelf is not just a page builder. It is the beginning of a **user-owned digital
identity infrastructure**.

1. **Identity Infrastructure** — Today people scatter their identity across CMS, LinkedIn,
   Instagram, GitHub. OpenSelf is the unified layer that represents who you are, under
   your control.
2. **User-Owned Digital Twin** — Not a profile. Not a social. A digital twin controlled
   by its owner, that evolves as you evolve.
3. **AI Aligned With the User** — Every existing AI-powered platform optimizes for
   engagement, ads, or retention. OpenSelf optimizes for identity coherence, personal
   growth, and privacy. This is a philosophical shift.

What OpenSelf is **not**:
- No feed, no likes, no followers, no algorithmic ranking
- No engagement metrics, no competition, no advertising
- No "others are watching you" notifications
- No public comparisons or vanity leaderboards

The model is: **personal assistant**, not social platform.

---

## 2. How It Works

### First Time (~5 minutes)

```
1. Open openself.com (or your self-hosted instance)
2. Click "Create your page"
3. Language selection:

   The app asks the user to pick their preferred language BEFORE starting the
   conversation. This is critical: if the agent cannot understand the user's
   language, the entire experience breaks.

   - UI shows a language picker (auto-detected from browser locale + manual override)
   - The agent's conversation language, fact extraction, and page generation
     all adapt to the selected language
   - Language can be changed later in settings

4. Chat opens. The agent says (in the selected language):

   "Hey! I'm going to build your personal page.
    Tell me — who are you and what are you into?"

5. You talk naturally for 3-5 minutes. The agent guides you:
   - "What are you working on these days?"
   - "Anything you're particularly proud of?"
   - "What do people come to you for?"

6. After ~5 exchanges, the agent says:

   "Got it! Let me build your page — watch this →"

7. Split view: chat on the left, live page preview on the right.
   The page builds itself in front of your eyes.

8. "Here's your page! Want to change anything?"
   - "Make it darker"
   - "The bio sounds too formal"
   - "Put my projects before the bio"
   - "Add my Instagram link"

9. The agent adjusts in real time.

10. One publish checkpoint (single confirmation):
    "I drafted this page with these facts as public. Publish?"
    - Approve all
    - Edit and approve
    - Keep as draft (nothing public)

11. Choose your username → openself.com/yourname

12. Live. Done. Under 5 minutes.
```

### Returning (~2 minutes)

```
1. Open the app
2. Agent: "Hey! What's new?"
3. You: "I changed jobs" / "I ran a marathon" / "Nothing much"
4. Agent updates the knowledge base, regenerates relevant sections
5. "Done! Updated your work section. Take a look."
```

### Passive Updates (with connectors)

```
1. You connected GitHub weeks ago
2. You push a new open-source project
3. The agent detects it via the GitHub connector
4. Agent: "I see you published 'cool-project' on GitHub.
   Want me to add it to your page?"
5. You: "Yes" (or it auto-approves based on your preferences)
6. Page updated. You did nothing.
```

### The Rule

The agent proposes. You approve. Nothing goes live without your consent.

In onboarding, approval is batched into one final publish checkpoint to preserve flow.
After onboarding, approvals are per change category (unless you enable auto-approve).

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          OPENSELF                          │
│                                                                  │
│  ┌───────────┐     ┌──────────────────┐     ┌────────────────┐  │
│  │           │     │                  │     │                │  │
│  │   CHAT    │────▶│   AGENT CORE     │────▶│  PAGE ENGINE   │  │
│  │   (UI)    │     │                  │     │                │  │
│  │           │◀────│  - Conversation  │     │  - Page Config │  │
│  │  Text /   │     │  - Fact extract  │     │  - Renderer    │  │
│  │  Voice    │     │  - KB management │     │  - Themes      │  │
│  │           │     │  - Page compose  │     │  - Components  │  │
│  └───────────┘     │  - Heartbeat     │     │                │  │
│                    └────────┬─────────┘     └───────┬────────┘  │
│                             │                       │           │
│                             ▼                       ▼           │
│                    ┌──────────────────┐     ┌────────────────┐  │
│                    │                  │     │                │  │
│                    │  KNOWLEDGE BASE  │     │  PUBLIC PAGE   │  │
│                    │                  │     │                │  │
│                    │  - Facts         │     │  /username     │  │
│                    │  - Agent config  │     │                │  │
│                    │  - Preferences   │     │  Accessible    │  │
│                    │  - History       │     │  by anyone     │  │
│                    │                  │     │                │  │
│                    └────────▲─────────┘     └────────────────┘  │
│                             │                                   │
│                    ┌────────┴─────────┐                         │
│                    │                  │                         │
│                    │   CONNECTORS     │                         │
│                    │                  │                         │
│                    │  GitHub, Strava  │                         │
│                    │  Spotify, Books  │                         │
│                    │  Scholar, etc.   │                         │
│                    │                  │                         │
│                    └──────────────────┘                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Data flows one way**: information enters through the chat or connectors, gets stored in
the knowledge base as facts, and flows out through the page engine as a public page.

---

## 4. The Agent

The agent is the heart of OpenSelf. Inspired by OpenClaw's living agent architecture,
it is not a stateless chatbot — it is an entity that knows you, remembers you, and evolves
its understanding of you over time.

### 4.1 Agent Identity

Every instance of OpenSelf has an agent with a defined identity. This is stored in a
configuration file (similar to OpenClaw's SOUL.md) that shapes how the agent behaves:

```yaml
# agent.yaml — The agent's identity and behavior

personality:
  tone: "warm-casual"          # How the agent talks (warm-casual, professional, playful, minimal)
  language: "it"               # Set explicitly at onboarding (language picker), required before first message
  humor: true                  # Light humor when appropriate
  verbosity: "concise"         # concise | balanced | detailed
  emoji: false                 # Use emoji in responses

behavior:
  proactivity: "medium"        # How often the agent suggests things (low, medium, high)
  auto_approve: []             # Categories of updates that don't need user approval
  check_in_frequency: "weekly" # How often the agent prompts for updates
  focus_areas: []              # Auto-learned: what the user cares about most

page_voice:
  perspective: "third-person"  # How the page is written (first-person, third-person)
  formality: "casual"          # casual, balanced, professional
  highlight: []                # What to emphasize (auto-learned)
```

**This file evolves.** The agent updates it based on interactions:
- If you always reject formal bio drafts, it learns to write casually
- If you never want to talk about work, it stops asking
- If you get excited about running, it prioritizes sport content

The agent **tells you** when it changes its own configuration:
> "I noticed you prefer a more casual tone. I've adjusted — let me know if that feels right."

### 4.2 Conversation Engine

The conversation is the primary interface. The agent uses the LLM to:

1. **Understand** what you're saying (extract meaning, not just keywords)
2. **Extract facts** autonomously via tool calling (see Knowledge Base)
3. **Guide** the conversation toward useful information (without being pushy)
4. **Generate** page content (bios, descriptions, section text)
5. **Modify** the page config based on your instructions

The agent has retrieval access to the full knowledge base, but only a relevant subset is
loaded in each turn context. It avoids re-asking known information, builds on prior
conversations, and connects new information to existing facts.

**Context assembly** (per conversation turn):
```
System prompt (agent identity + instructions)
+ Recent conversation history
+ Relevant facts from KB (semantic search)
+ Current page config (when page intent is detected)
+ Connected services status (when connector intent is detected)
= Full context sent to LLM
```

### 4.2.1 System Prompt Architecture

The system prompt is structured in deterministic blocks (assembled server-side):

1. **Core charter**
   - Product goal, non-goals, persona boundaries
2. **Safety and privacy policy**
   - Visibility constraints, sensitive-data rules, no silent publication
3. **Tool policy**
   - When to call tools, required arguments, retry/error behavior
4. **Output contracts**
   - JSON/schema requirements for tool payloads and page content generation
5. **Mode policy**
   - `onboarding` vs `steady_state` vs `heartbeat`
6. **Dynamic context attachments**
   - Retrieved facts, summarized history, current page config, connector status

Prompt assembly is code-driven (no prompt text embedded in UI files). Each block has a
version id for reproducibility and A/B testing.

### 4.2.2 Context Budget Policy

Context is budgeted explicitly to avoid window overflows:

1. **Recent chat:** last 12 turns (or token cap), always included
2. **Long-term summary:** rolling summary of older conversations
3. **Facts:** top-K relevant facts from hybrid retrieval (`K=40` default)
4. **Page config:** included only when intent is page creation/edit/styling
5. **Connectors state:** included only when connector-related intent is detected

If budget is exceeded, truncation order is deterministic:
- Drop connector status first
- Reduce fact K
- Compress older summary
- Never drop the active user turn or safety/policy blocks

### 4.3 Tool Calling (Autonomous Actions)

During conversation, the agent calls tools silently to manage the knowledge base and page.
The user sees a natural conversation. Under the hood, the agent is performing structured
actions:

```
Available tools:

# Knowledge Base management
create_fact(category, key, value, source?)    # Learn something new
update_fact(id, value)                         # Update existing knowledge
delete_fact(id)                                # Remove outdated info
search_facts(query)                            # Search the KB semantically

# Page management
update_page_config(changes)                    # Modify page structure/content
set_theme(theme_id)                            # Change visual theme
reorder_sections(section_order)                # Rearrange page sections
regenerate_section(section_type)               # Re-synthesize a section from facts

# Agent self-management
update_agent_config(changes)                   # Adapt own behavior
schedule_reminder(message, when)               # Set a future check-in topic
```

**Example of what happens in a single exchange:**

User says: "I just started a new job at Acme Corp as a product manager"

The agent simultaneously:
1. Responds naturally: "Congrats! That's a big move. How are you liking it so far?"
2. Calls `create_fact(category="experience", key="acme-corp", value={role: "Product Manager", company: "Acme Corp", start: "2026-02", status: "current"})`
3. Calls `update_fact(id="prev-job-id", value={...status: "past", end: "2026-01"})`
4. Calls `regenerate_section("timeline")` to update the experience section
5. Calls `update_agent_config({focus_areas: [..., "product-management"]})` if this seems like a core identity shift

All invisible to the user. They just had a conversation.

### 4.4 Heartbeat (Periodic Self-Reflection)

Inspired by OpenClaw's heartbeat system. At configurable intervals, the agent "wakes up"
and performs autonomous maintenance — without the user being present.

**What the heartbeat does:**

```
Every [interval] (default: daily):

1. CHECK CONNECTORS
   - Poll connected services for new data
   - GitHub: new repos? new contributions?
   - Strava: new activities?
   - Spotify: listening patterns changed?

2. REVIEW KNOWLEDGE BASE
   - Are there contradictory facts?
   - Are there facts that seem outdated?
   - Is any information missing that could be inferred?

3. REVIEW PAGE
   - Does the page still reflect the knowledge base accurately?
   - Are there new facts that should be on the page but aren't?
   - Should any sections be regenerated?

4. DECIDE ACTION
   - If something needs user input → queue a message for next check-in
   - If auto-approve is enabled for this category → update silently
   - If nothing to do → stay quiet (like OpenClaw's HEARTBEAT_OK)
```

**Example heartbeat outcomes:**

- Detects 3 new Strava runs → queues: "You've been running a lot! Want me to update your sports section?"
- Detects a GitHub repo hasn't been updated in 6 months → queues: "Is 'old-project' still active? Should I archive it on your page?"
- Detects the bio mentions "learning Rust" but the user has 15 Rust repos now → auto-suggests: "You're not 'learning' Rust anymore — you're proficient. Want me to update?"
- Nothing changed → stays silent. No notification. Respect the user's attention.

**Heartbeat configuration:**
```yaml
heartbeat:
  enabled: true
  interval: "24h"              # How often (1h, 6h, 12h, 24h, 7d)
  active_hours:                # Only run during these hours
    start: "09:00"
    end: "22:00"
    timezone: "Europe/Berlin"
  quiet_mode: false            # If true, never notify — only auto-approve
  connector_check: true        # Check connected services
  kb_review: true              # Review knowledge base consistency
  page_review: true            # Review page freshness
```

Execution note:
- `interval` is a human-friendly input. At runtime it is converted into scheduler state
  (`next_run_at`) by the worker.
- Accepted forms: duration (`15m`, `1h`, `24h`, `7d`) and cron (`0 */6 * * *`).
- Heartbeat jobs are executed by a background worker, not by request handlers.

### 4.5 Memory Architecture

The agent's memory has three tiers (inspired by OpenClaw):

**Tier 1 — Short-Term: Conversation History (ephemeral)**
Raw chat messages from the current session. Kept for immediate context. Older
messages are summarized (Tier 2) and key facts are extracted to the KB (Tier 3)
before being archived.

**Tier 2 — Medium-Term: Conversation Summaries (rolling)**
Compressed summaries of past conversations. The agent does not re-read full
transcripts — it works from distilled summaries that capture the essential
information, emotional tone, and unresolved threads. Summaries are updated
progressively: each new conversation enriches or refines previous summaries.

**Tier 3 — Long-Term: Consolidated Knowledge (durable)**
Two sub-layers:

- **Knowledge Base** — Structured facts about the user. The source of truth for
  page generation. See Section 5.
- **Agent Memory** — The agent's own meta-observations about the user — not facts,
  but behavioral notes:
  - "User gets annoyed when I ask too many questions in a row"
  - "User prefers to talk about projects rather than skills"
  - "User's mood is usually better in evening conversations"

Agent memory is stored separately from the KB and used to improve conversation
quality over time. Like OpenClaw's MEMORY.md — curated, evolving meta-knowledge.

### 4.5.1 Fact Visibility Lifecycle

Every fact in the KB follows a four-state visibility lifecycle:

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌────────────┐
│ PRIVATE  │────▶│   PROPOSED   │────▶│  PUBLIC  │────▶│  ARCHIVED  │
│          │     │              │     │          │     │            │
│ Not on   │     │ Agent thinks │     │ Live on  │     │ Was active,│
│ page,    │     │ it could go  │     │ the page │     │ now hidden │
│ internal │     │ on the page  │     │          │     │ but kept   │
│ only     │     │              │     │          │     │            │
└──────────┘     └──────────────┘     └──────────┘     └────────────┘
      ▲                                     │
      └─────────────────────────────────────┘
                  (user revokes)
```

- **Private**: stored in KB, never shown on the page. Used by the agent for
  understanding context (e.g., salary, personal struggles).
- **Proposed**: the agent believes this fact could be on the page.
  Shown in draft preview. Requires user approval to go live.
- **Public**: live on the public page.
- **Archived**: was active, now removed from the page. Still stored in KB for
  history and potential future reactivation.

The agent manages these transitions through heartbeat cycles, optimizing for
relevance without wasting LLM calls on facts that haven't changed.

### 4.5.2 Heartbeat Cost Optimization

The heartbeat should be event-driven, not blindly periodic:

- If nothing has changed (no new connector data, no new conversations, no
  time-sensitive facts), the heartbeat skips LLM calls entirely.
- The heartbeat checks for change signals first (cheap), then invokes the LLM
  only when reasoning is needed (expensive).
- Batch processing: multiple pending changes are processed in a single LLM call
  rather than one call per change.

### 4.6 Agent Evolution Levels

The agent is designed to grow in capability over time. Each level builds on the
previous one. Level 1 is the MVP; higher levels are unlocked as the knowledge base
deepens and the user opts in.

**Level 1 — Smart Curator** (Phase 0-1)

The agent keeps your page up to date. It adapts tone and style, manages privacy,
asks for confirmations, and suggests small improvements.

Value: *"I never have to think about my online presence."*

**Level 2 — Identity Coach** (Phase 2+)

The agent goes beyond describing who you are — it helps you understand how you are
perceived and how you want to be perceived. This is not a motivational coach. It is
an operational identity coach based on your real data.

Capabilities:
- **Gap analysis** — "You want to reposition as an AI strategist, but 70% of your
  content still talks about data engineering. Want to rebalance?"
- **Trend alignment** — "In the last 6 months, these topics are growing in your
  field: X, Y, Z. Want to integrate them into your positioning?"
- **Narrative refinement** — "You talk a lot about what you do, but not why you
  do it. Want to work on your positioning?"
- **Targeted opportunities** — Not a feed. Only things filtered by your profile:
  "This open-source project aligns perfectly with your skills. Interested?"

This is not engagement. It is relevance.

**Level 3 — Career / Life Navigator** (Phase 3+)

Strategic repositioning mode. The user says: "I want to move into product management
in the next 12 months." The agent can:
- Analyze the current profile
- Highlight gaps
- Suggest what to develop
- Help rewrite the narrative
- Reorganize the page to support the new positioning
- Suggest coherent content and connections

Not a social network. A trajectory simulation system.

**Level 4 — Personal Knowledge Core** (Vision)

The page becomes just the public interface. Behind it lives a complete map of the
user's competencies, passions, goals, and evolution over time.

The agent can:
- Show evolution: "In the last 3 years you went from X to Y. Your focus is
  shifting toward..."
- Suggest growth cycles: "You are neglecting the creative side that used to
  motivate you a lot."
- Time Capsule: yearly review of identity evolution.

This is not a feature. It is a new product category:
**the operating system of your digital identity**.

**Anti-social boundary:** At every level, the agent remains a private assistant.
No public feed, no likes, no ranking, no comparison. Only private suggestions,
only with consent. Zero engagement mechanics.

### 4.7 Voice Interaction Architecture

Voice is a first-class modality, not an accessory. The goal is an agent that
listens, reasons, and speaks.

**Speech-to-Text (input):**
- Browser: Web Speech API (real-time, no server round-trip)
- Server fallback: Whisper (OpenAI open-source model). Supports many languages,
  runs locally via Whisper.cpp or via API. Critical for the language-agnostic promise.

**Text-to-Speech (output):**
- Open-source engines: eSpeak NG (lightweight, many languages, predefined voices),
  Piper (higher quality neural TTS, still open-source and local).
- Cloud fallback: provider TTS APIs (OpenAI, Google, ElevenLabs) for premium voice
  quality, opt-in only.

**Design principle:** The voice pipeline must work fully offline when using local
models (Whisper + eSpeak/Piper + Ollama). This preserves the privacy-first guarantee.

Voice data is ephemeral: audio is transcribed and discarded. Only the text
transcription enters the conversation and fact extraction pipeline.

---

## 5. Knowledge Base

The knowledge base (KB) is the structured memory of everything the agent knows about you.
It is the single source of truth from which the page is generated.

### 5.1 Design Principles

1. **Agent-managed**: The AI creates, updates, and deletes facts autonomously. The user
   never has to manually edit the KB (but can if they want to).
2. **Extensible categories**: Categories are strings, not a hardcoded enum. The agent can
   propose new categories when needed.
3. **Fact-based**: Each entry is an atomic fact. Complex information is broken into
   multiple facts.
4. **Source-tracked**: Every fact knows where it came from (chat, GitHub, Strava, manual).
5. **Overwritable**: When information changes, the fact is updated — not duplicated.
6. **Taxonomy guardrails**: Category aliases are normalized to canonical names at write time
   (e.g., `job`, `work`, `employment` → `experience`) to avoid KB drift.

### 5.2 Fact Structure

```
┌──────────────────────────────────────────────────────────┐
│  FACT                                                     │
├──────────────────────────────────────────────────────────┤
│  id          TEXT PRIMARY KEY     (uuid)                  │
│  category    TEXT NOT NULL        (free-form string)      │
│  key         TEXT NOT NULL        (unique within category)│
│  value       JSON NOT NULL        (flexible structure)    │
│  source      TEXT DEFAULT 'chat'  (chat|github|strava|…) │
│  confidence  REAL DEFAULT 1.0     (0.0 to 1.0)           │
│  visibility  TEXT DEFAULT 'private' (private|proposed|public|archived)│
│  created_at  DATETIME                                     │
│  updated_at  DATETIME                                     │
├──────────────────────────────────────────────────────────┤
│  UNIQUE(category, key)                                    │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Example Facts

The agent creates these autonomously during conversations and from connectors:

```json
// Identity
{ "category": "identity", "key": "name", "value": { "full": "Tommaso Bianchi" } }
{ "category": "identity", "key": "location", "value": { "city": "Berlin", "country": "DE" } }
{ "category": "identity", "key": "tagline", "value": { "text": "Builder, runner, espresso addict" } }

// Skills (the agent decides the level based on evidence)
{ "category": "skill", "key": "typescript", "value": { "name": "TypeScript", "level": "advanced", "years": 5 } }
{ "category": "skill", "key": "cooking", "value": { "name": "Italian cooking", "level": "enthusiast", "detail": "Specializes in pasta from scratch" } }

// Interests
{ "category": "interest", "key": "running", "value": { "name": "Running", "detail": "Training for Berlin Marathon 2026", "since": "2024" } }
{ "category": "interest", "key": "jazz", "value": { "name": "Jazz music", "detail": "Plays piano, loves Coltrane" } }

// Projects
{ "category": "project", "key": "openself", "value": { "name": "OpenSelf", "description": "Open-source AI profile builder", "url": "https://github.com/...", "status": "active", "role": "Creator" } }

// Achievements
{ "category": "achievement", "key": "berlin-marathon-2025", "value": { "title": "Berlin Marathon 2025", "detail": "Finished in 3:45:00", "date": "2025-09-28" }, "source": "strava" }

// Experience
{ "category": "experience", "key": "acme-corp", "value": { "role": "Product Manager", "company": "Acme Corp", "start": "2026-02", "end": null, "status": "current" } }

// Activities (with geolocation)
{ "category": "activity", "key": "ai-conf-2026", "value": { "title": "Spoke at AI Conference 2026", "date": "2026-02-15", "location": { "name": "Palazzo delle Esposizioni", "city": "Rome", "country": "IT", "coords": [41.8992, 12.4892] }, "tags": ["conference", "AI", "speaking"] } }
{ "category": "activity", "key": "berlin-meetup-feb", "value": { "title": "Berlin TypeScript Meetup", "date": "2026-02-10", "location": { "name": "Factory Berlin", "city": "Berlin", "country": "DE" }, "tags": ["meetup", "TypeScript"] } }

// The agent can create any category it wants:
{ "category": "philosophy", "key": "open-source", "value": { "text": "Believes software should be free and open" } }
{ "category": "fun-fact", "key": "coffee", "value": { "text": "Cannot function before the first espresso" } }
{ "category": "life-motto", "key": "main", "value": { "text": "Build things that matter" } }
{ "category": "reading", "key": "current", "value": { "title": "Designing Data-Intensive Applications", "author": "Martin Kleppmann" }, "source": "manual" }
{ "category": "social", "key": "github", "value": { "platform": "GitHub", "url": "https://github.com/tommaso", "username": "tommaso" } }
```

### 5.4 Autonomous KB Management

The agent manages the KB like OpenClaw manages its skills and memory. It does not wait
for instructions. During every conversation, the agent:

1. **Listens** for new information and creates facts
2. **Detects changes** ("I left Acme" → updates experience fact, sets end date)
3. **Infers** connections ("You mentioned TypeScript and React → you're a frontend dev")
4. **Consolidates** when facts are redundant or contradictory
5. **Evolves categories** — if users keep mentioning travel, the agent creates a
   `travel` category and starts tracking destinations

The agent can also **ask** the user to confirm uncertain facts:
> "Last time you mentioned learning Rust — are you still at it, or has that changed?"

### 5.5 Semantic Search

The KB supports semantic search so the agent can find relevant facts during conversation
without loading everything into context.

**Implementation:**
- SQLite FTS5 for keyword search
- sqlite-vec for vector similarity search
- Hybrid scoring: `final = (0.7 * vector_score) + (0.3 * text_score)`
- Embeddings generated locally (e.g., nomic-embed-text via Ollama) or via API

This allows queries like:
- "What does the user know about programming?" → finds all tech skills, projects, experience
- "What are the user's hobbies?" → finds interests, sports, music, reading

### 5.6 Taxonomy Normalization (Execution)

Category normalization is performed by the application layer, not by the LLM.

Write path ownership:
1. The LLM may propose `category`, `key`, and `value`.
2. The tool runtime validates payload shape and policy.
3. `TaxonomyNormalizer` maps category aliases to canonical categories.
4. Only canonical categories are persisted to `facts.category`.

Normalization sources (in order):
1. Built-in alias map (system defaults such as `job|work|employment -> experience`)
2. Project alias table (`category_aliases`)
3. New canonical category creation (allowed, but registered in `category_registry`)

Rules:
- LLM output is advisory. It never writes directly to SQLite.
- Unknown categories can be created, but must pass slug and length validation.
- Alias resolution is deterministic and testable (`input -> canonical output`).
- The original raw label is preserved in tool-call logs for audit/debug.

### 5.7 Confidence Policy

`confidence` is operational (not decorative). It affects publication and follow-up.

Thresholds:
- `>= 0.80`: eligible for onboarding preview/public proposal
- `0.50 - 0.79`: store as private or proposed; require confirmation before public
- `< 0.50`: private only, never auto-proposed for publication

Rules:
- Public page rendering includes only facts with `visibility='public'`.
- Onboarding preview may include `visibility='proposed'` facts above threshold.
- Confirmations, connector corroboration, or repeated evidence can raise confidence.

---

## 6. Page Engine

The page engine turns the knowledge base into a beautiful, living web page. The agent
does not generate raw HTML — it composes a **page configuration** from pre-built
components.

### 6.1 Design System — Components

A curated set of pre-built, responsive, accessible React components. Every component
follows OpenSelf's visual identity.

```
┌──────────────────────────────────────────────────────────────┐
│  COMPONENT LIBRARY                                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  hero          Name, tagline, avatar                          │
│                Variants: large, compact, minimal             │
│                                                              │
│  bio           Narrative text about the person               │
│                Variants: short, full, quote-style            │
│                                                              │
│  skills        Competencies and abilities                    │
│                Variants: chips, bars, list, cloud            │
│                                                              │
│  projects      Things built or worked on                     │
│                Variants: grid, list, featured                │
│                                                              │
│  timeline      Chronological experience/education            │
│                Variants: vertical, horizontal, compact       │
│                                                              │
│  interests     Hobbies, passions, curiosities                │
│                Variants: icons, cards, list                  │
│                                                              │
│  achievements  Milestones, awards, certifications            │
│                Variants: badges, cards, timeline             │
│                                                              │
│  gallery       Future (post-MVP, optional)                   │
│                Disabled in MVP (avatar-only uploads)         │
│                                                              │
│  stats         Numerical highlights                          │
│                Variants: counters, cards, inline             │
│                e.g., "5 years experience, 12 projects,       │
│                       1,200 km run this year"                │
│                                                              │
│  social        Links to other platforms                      │
│                Variants: icons, buttons, list                │
│                                                              │
│  custom        Free-form section (title + rich text)         │
│                For anything that doesn't fit above           │
│                                                              │
│  reading       Books, articles, recommendations              │
│                Variants: shelf, list, featured               │
│                                                              │
│  music         Listening habits, playlists                   │
│                Variants: player-style, list, grid            │
│                                                              │
│  activities    Latest activities, events, places              │
│                Variants: feed, cards, map, compact            │
│                Supports geolocation (venue, city, coords)    │
│                e.g., "Spoke at AI Conf @ Palazzo Esposizioni"│
│                                                              │
│  contact       Contact information, availability             │
│                Variants: form, links, card                   │
│                                                              │
│  footer        "Made with OpenSelf" + meta info        │
│                Always present (subtle, non-intrusive)        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

New components can be added over time. The agent automatically uses new components
when they become available and relevant to the user's data.

### 6.1.1 Component Ownership Model

Component quality comes from clear ownership boundaries:

| Role | Responsibility |
|---|---|
| Core product/design team | Defines design tokens, layout shell, spacing rhythm, typography system, and official components |
| Frontend/runtime maintainers | Enforces schemas, variant contracts, and render safety |
| Community authors | Proposes new components/themes via SDK and review pipeline |
| Agent | Selects from registered components and fills content, never invents raw layout primitives |

### 6.1.2 Extension Model (Core + Community)

MVP uses a closed component set. Extensibility is introduced in Phase 2+ through a
registry without giving up deterministic rendering.

Rules:
1. Core components keep short IDs (`hero`, `bio`, `projects`, ...).
2. Community components use namespaced IDs (`x.<author>.<component>`).
3. Every community component must include:
   - declared variants
   - `content` JSON Schema
   - accessibility notes
   - reference screenshots for visual regression
4. Unknown or unregistered component types are rejected at validation time.
5. Deprecating a component requires a migration path for existing pages.

### 6.1.3 Component SDK Contract (Phase 2+)

```ts
interface PageComponentModule {
  meta: {
    type: `x.${string}.${string}`;
    version: string;
    owner: string;
  };
  variants: string[];
  contentSchema: Record<string, unknown>; // JSON Schema
  render: React.ComponentType<{
    content: Record<string, unknown>;
    variant?: string;
  }>;
}
```

SDK guardrails:
- Components consume OpenSelf design tokens from the theme API.
- No global CSS resets, no external font injection, no tracking scripts.
- SSR/SSG compatibility is mandatory.
- Static export mode fallback is mandatory.

### 6.1.4 Community Component Execution & Sandboxing Strategy

Loading third-party React code dynamically at runtime is high-risk in Next.js
(both server-side and client-side). Therefore execution modes are explicit:

1. **Phase 2 default (recommended): build-time installation only**
   - Community component packages are pinned in lockfile and installed before build.
   - No runtime download/execute of remote component code from registry.
   - Registry distributes metadata, schemas, and package references; not live code execution.
2. **Phase 2 safe path for most community contributions: declarative DSL/templates**
   - Contributors can publish schema-driven blocks rendered by the core engine.
   - No arbitrary React execution required for standard use cases.
3. **Future dynamic runtime path (advanced): iframe sandbox**
   - If dynamic loading is needed, render untrusted blocks in cross-origin sandboxed iframe.
   - Communicate only via structured `postMessage` payloads (`PageConfig` subset).

Security posture:
- Untrusted code must never run in the same privilege context as app server logic.
- Access to secrets (`process.env`, internal network, server FS) is forbidden to community render paths.
- Brand policy checks (Section 15.12) apply regardless of execution mode.

### 6.2 Page Config

The agent produces a JSON configuration that describes the page. The renderer turns
this config into HTML. Rendering is deterministic: same config = same page, always.

The upstream AI generation step is probabilistic. For reproducibility, we persist
model/provider metadata and the generated config version on each page update.

### 6.2.1 Page Config Contract (Formal Schema)

`PageConfig` is validated before persistence and before rendering.

Reference TypeScript shape:

```ts
type ComponentType =
  | "hero" | "bio" | "skills" | "projects" | "timeline" | "interests"
  | "achievements" | "activities" | "stats" | "social" | "custom" | "reading"
  | "music" | "contact" | "footer";

type StyleConfig = {
  colorScheme: "light" | "dark";
  primaryColor: string;
  fontFamily: string;
  layout: "centered" | "split" | "stack";
};

type Section = {
  id: string;
  type: ComponentType;
  variant?: string;
  content: Record<string, unknown>;
};

type PageConfig = {
  version: number;
  username: string;
  sourceLanguage: string;     // ISO 639-1 code (e.g., "it", "en", "de") — set from onboarding
  theme: string;
  style: StyleConfig;
  sections: Section[];
};
```

Runtime rules:
- Zod/JSON Schema validation is mandatory at write time.
- Each `type` has its own `content` validator (discriminated by component type).
- Invalid configs are rejected and never reach the renderer.
- The LLM receives schema-aware generation instructions and must output valid JSON.
- MVP uses a closed `ComponentType` allowlist.
- Phase 2+ may extend types via a component registry, but only if registered and
  schema-validated.

```json
{
  "version": 1,
  "username": "tommaso",
  "theme": "minimal",
  "style": {
    "colorScheme": "dark",
    "primaryColor": "#6366f1",
    "fontFamily": "inter",
    "layout": "centered"
  },
  "sections": [
    {
      "id": "hero-1",
      "type": "hero",
      "variant": "large",
      "content": {
        "name": "Tommaso Bianchi",
        "tagline": "Builder, runner, espresso addict",
        "avatarMediaId": "media-avatar-main"
      }
    },
    {
      "id": "bio-1",
      "type": "bio",
      "variant": "full",
      "content": {
        "text": "Software engineer by day, marathon trainee by weekend. Currently building open-source tools that help people express who they are online. Based in Berlin, powered by espresso."
      }
    },
    {
      "id": "projects-1",
      "type": "projects",
      "variant": "grid",
      "content": {
        "items": [
          {
            "factRef": "project:openself",
            "title": "OpenSelf",
            "description": "Open-source AI that builds your personal page",
            "url": "https://github.com/...",
            "tags": ["TypeScript", "AI", "Open Source"]
          }
        ]
      }
    },
    {
      "id": "skills-1",
      "type": "skills",
      "variant": "chips",
      "content": {
        "groups": [
          { "label": "Tech", "items": ["TypeScript", "React", "Node.js", "Python"] },
          { "label": "Other", "items": ["Product thinking", "Italian cooking", "Public speaking"] }
        ]
      }
    },
    {
      "id": "interests-1",
      "type": "interests",
      "variant": "icons",
      "content": {
        "items": [
          { "name": "Running", "detail": "Training for Berlin Marathon", "icon": "running" },
          { "name": "Jazz", "detail": "Piano player, Coltrane fan", "icon": "music" }
        ]
      }
    },
    {
      "id": "social-1",
      "type": "social",
      "variant": "icons",
      "content": {
        "links": [
          { "platform": "github", "url": "https://github.com/tommaso" },
          { "platform": "instagram", "url": "https://instagram.com/tommaso" }
        ]
      }
    }
  ]
}
```

`factRef` is provenance metadata only. The renderer never performs KB lookups at render
time; it renders inline `content` from `PageConfig` only.

### 6.3 How the Agent Composes the Page

When the agent generates or updates the page, it follows this flow:

```
1. Load facts from KB eligible for the current mode
   (onboarding preview: `public + proposed`; public render: `public` only)
   (facts below confidence threshold are excluded from auto-public paths)
2. Decide which components are relevant
   (no projects? skip the projects section)
   (user has achievements? add achievements section)
3. For each component:
   a. Select relevant facts
   b. Synthesize content text (bio, descriptions) using the LLM
   c. Choose variant based on amount of data and user preferences
4. Assemble the page config JSON
5. Save to database
6. Renderer produces the HTML page
```

### 6.3.1 Live Preview Strategy (Onboarding)

To keep the "builds in front of your eyes" experience without runaway LLM cost, onboarding
uses a hybrid preview strategy:

1. **Optimistic preview per turn (no extra LLM call)**
   - After each user turn, renderer updates from extracted facts + deterministic templates
2. **Milestone synthesis (LLM)**
   - Full narrative synthesis runs every 2 user turns (or when user asks explicitly)
3. **Final synthesis before publish checkpoint**
   - One final pass generates polished copy and section ordering

Section regeneration is incremental: only impacted sections are recomputed.

### 6.4 How the Agent Modifies the Page

When the user asks for changes in chat, the agent modifies the page config —
it does not regenerate everything:

| User says | Agent action |
|---|---|
| "Make it darker" | `style.colorScheme = "dark"` |
| "Put projects first" | Reorder `sections` array |
| "The bio is too long" | Regenerate bio content with shorter prompt |
| "I don't want to show skills" | Remove `skills` section |
| "Add a section for my books" | Add `reading` component, populate from KB |
| "Use a different color" | `style.primaryColor = "#..."` |
| "Make it more minimal" | `theme = "minimal"`, reduce variant complexity |

### 6.5 OpenSelf Visual Identity

All pages share a recognizable DNA. Like how you can spot a Notion page or a Read.cv
profile at a glance, OpenSelf pages should be instantly recognizable.

**Shared across all themes:**
- Typography: limited font set (Inter, Source Serif, JetBrains Mono)
- Spacing rhythm: consistent 8px grid
- Border radius: consistent roundness
- Transitions: subtle, smooth animations
- Footer: small "Made with OpenSelf" badge with link
- Component structure: same HTML skeleton regardless of theme
- Responsiveness: all components work on all screen sizes

**Variable per theme:**
- Color palette (light, dark, custom accent)
- Font weights and sizes
- Density (spacious vs compact)
- Visual embellishments (borders, shadows, gradients)

**Built-in themes (initial set):**

| Theme | Description |
|---|---|
| `minimal` | Clean, lots of whitespace, monochrome with one accent color |
| `warm` | Soft colors, rounded elements, friendly feel |
| `bold` | Strong contrast, large typography, confident |
| `elegant` | Serif fonts, refined spacing, understated |
| `hacker` | Monospace, dark background, terminal aesthetic |

Users can request theme changes in conversation. New themes can be added
as the project grows.

### 6.5.1 Non-Negotiable Brand Guardrails

Even with community themes/components, public pages keep these immutable constraints:

- Shared layout shell and footer badge remain present
- Token contract controls typography families, spacing scale, radius scale, and motion
- Semantic skeleton stays consistent (`hero`, `section`, heading hierarchy, link patterns)
- Accessibility floor: keyboard navigation, visible focus states, and WCAG-level contrast
- Performance budget applies to every theme/component combination

If a component/theme violates guardrails at runtime, the page falls back to a safe
core component variant and logs an operational event.

### 6.5.2 Community Certification Flow (Phase 2+)

1. Author submits package + manifest + screenshots.
2. CI runs schema checks, SSR snapshot tests, visual regression, and a11y checks.
3. Human review verifies style coherence and safety.
4. Component status becomes `certified`, `experimental`, or `rejected`.
5. Default public pages can use only `core` and `certified` components.

### 6.6 Renderer

The renderer is a React component that takes a page config and produces HTML.
It is **completely decoupled** from the AI:

```
Page Config (JSON) → Renderer (React) → HTML/CSS
```

This means:
- The page can be rendered server-side (SSR/SSG) for performance and SEO
- The page can be exported as static HTML (no server needed)
- The renderer can be tested independently (input JSON → assert output)
- Third parties can build alternative renderers

### 6.7 Automatic Page Translation

The page is written in the owner's language (`factLanguage` tracked in user preferences).
When the owner switches the display language in the Settings panel, content is translated
via LLM and served from a hash-based cache.

**Current implementation (owner-side):**
1. Owner changes language in Settings → triggers `translatePageContent()`.
2. The function collects translatable sections (skips `footer`, `social`), computes
   `SHA-256(JSON of sections)`, and queries the `translation_cache` table.
3. **Cache hit** → returns cached translated sections immediately. No LLM call.
4. **Cache miss** → calls `generateText` (same model provider as chat) with a
   professional localization prompt → stores result in `translation_cache` → returns.
5. On any error (LLM failure, JSON parse, cache I/O), returns the original config
   unchanged — graceful degradation over hard failure.

**Cache design:**
- Table: `translation_cache` with composite PK `(content_hash, target_language)`.
- Hash-based, zero explicit invalidation: when facts change → sections change →
  hash changes → old cache entries are never hit again.
- Each entry is ~1-2 KB. A page with 8 languages generates at most 7 entries.
- No TTL or cleanup needed at current scale. Future: prune entries > 90 days if needed.

**What gets translated:** section content (bio text, descriptions, taglines, skill
labels, interest names, section titles). What does **not** get translated: person
names, company names, proper nouns, URLs, tech acronyms (AI, API, TypeScript, etc.),
`footer` and `social` section types.

The source language is stored in user preferences (`factLanguage`). The agent sets
it based on the user's onboarding language selection.

**Future: public page visitor translation (not yet implemented):**
1. The public page detects the visitor's browser language (`Accept-Language` header).
2. If it differs from the page's source language, a translation banner appears:
   "This page is originally in Italian. [View in English]"
3. On request, the page content is translated on-demand and served from the same
   `translation_cache` (same hash = instant on repeat visits).

#### 6.7.1 Translation Cost Model

- 8 supported languages × N pages = up to 7N cached translations.
- Each translation: ~500 tokens input + ~400 output ≈ $0.001 (Haiku).
- 1,000 pages fully translated: ~$7 one-time, then free from cache.
- **Risk**: if languages grow beyond 8, or if pages grow very long (50+ sections),
  cost per translation rises. Long pages with complex content could reach $0.01-0.05
  per translation.
- **Mitigation**: budget guardrails (`llm_limits` table), cache eliminates repeated
  costs, hard cap on supported languages.

### 6.8 Activities Component

The `activities` component shows recent activities, events, and places. It supports
automatic geolocation enrichment.

**Example content:**
```json
{
  "id": "activities-1",
  "type": "activities",
  "variant": "feed",
  "content": {
    "items": [
      {
        "factRef": "activity:ai-conf-2026",
        "title": "Spoke at AI Conference 2026",
        "date": "2026-02-15",
        "location": {
          "name": "Palazzo delle Esposizioni",
          "city": "Rome",
          "country": "IT",
          "coords": [41.8992, 12.4892]
        },
        "tags": ["conference", "AI", "speaking"]
      }
    ]
  }
}
```

**Geolocation enrichment:** When the user mentions a place in conversation
("yesterday I was at the AI conference at Palazzo delle Esposizioni"), the agent:
1. Extracts the venue name and context
2. Resolves coordinates via geocoding (OpenStreetMap Nominatim or similar)
3. Creates an `activity` fact with structured location data
4. Updates the activities section on the page

**Potential for connection:** Activity data (events attended, places visited) can be
used to suggest connections with other OpenSelf users who attended the same events
or have similar activity patterns. This happens only with explicit opt-in and through
the federated discovery layer (see Section 6.9).

### 6.9 Discovery & Federation

**The problem:** If everyone hosts their own page independently, how do people find
each other? On LinkedIn you search a name and find profiles. But with decentralized
pages hosted in different places, there is no central search.

**The solution: an opt-in federated directory.**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Page A      │     │  Page B      │     │  Page C      │
│  (self-host) │     │  (Vercel)    │     │  (cloud)     │
│              │     │              │     │              │
│  Registers → │     │  Registers → │     │  Registers → │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                  DISCOVERY REGISTRY                       │
│                                                          │
│  - Public profile index (name, tagline, tags, location)  │
│  - Search by name, skill, interest, location             │
│  - Activity-based suggestions (same events, similar      │
│    interests) — opt-in only                              │
│  - No ranking, no algorithm, no engagement metrics       │
│                                                          │
│  Protocol: each page maintains a signed registration     │
│  key that proves ownership and allows updates.           │
│  Registry stores only public metadata, never full KB.    │
└──────────────────────────────────────────────────────────┘
```

**How it works:**
1. When a page is published, the owner can opt-in to register with the discovery
   directory (hosted at `directory.openself.com` or community-run instances).
2. The page sends a signed registration payload containing only public metadata:
   name, tagline, skills, interests, location, page URL.
3. The directory indexes this metadata for search.
4. Each page maintains a **registration key** (asymmetric keypair) that proves
   ownership and allows updates/deregistration.
5. The directory never stores private facts or full page content — only the
   public index card.

**Activity-based discovery (opt-in):**
- Users who attended the same event can discover each other
- Users with similar skill/interest profiles can be suggested
- All suggestions are private (shown only to the individual), never public
- Users can disable discovery entirely

**Federation:** Multiple directory instances can sync with each other, so
community-run directories can interoperate with the main one.

This is designed in Phase 3 alongside the protocol layer.

---

## 7. Connectors

Connectors are modular plugins that pull data from external services into the
knowledge base. They are optional — OpenSelf works perfectly without any
connectors, using conversation alone.

### 7.1 Architecture

```
┌───────────────┐     ┌──────────────────┐     ┌──────────────┐
│  External     │     │   CONNECTOR      │     │  Knowledge   │
│  Service      │────▶│                  │────▶│  Base        │
│  (GitHub API) │     │  - Authenticate  │     │              │
│               │     │  - Fetch data    │     │  (new facts) │
│               │     │  - Transform     │     │              │
│               │◀────│  - Schedule      │     │              │
│  (webhooks)   │     │                  │     │              │
└───────────────┘     └──────────────────┘     └──────────────┘
```

Each connector:
1. **Authenticates** with the external service (OAuth, API key, or public API)
2. **Fetches** relevant data (repos, activities, listening history, etc.)
3. **Transforms** raw data into facts (structured, categorized)
4. **Writes** facts to the KB with `source` set to the connector name
5. **Schedules** periodic checks (via heartbeat or cron)

### 7.2 Connector Interface

Every connector implements a standard interface:

```typescript
interface Connector {
  // Metadata
  id: string;                    // e.g., "github"
  name: string;                  // e.g., "GitHub"
  description: string;
  icon: string;                  // Icon for the UI
  category: "code" | "sports" | "music" | "reading" | "academic" | "social" | "other";

  // Authentication
  authType: "oauth" | "api_key" | "public" | "none";
  authConfig?: OAuthConfig;

  // Data fetching
  fetch(credentials: Credentials): Promise<Fact[]>;

  // Scheduling
  schedule: {
    interval: string;            // "1h", "6h", "24h", "7d"
    webhook?: boolean;           // Supports real-time webhooks?
  };

  // What categories of facts this connector produces
  produces: string[];            // e.g., ["project", "skill", "achievement", "stats"]
}
```

### 7.3 Planned Connectors

| Connector | Category | Data Produced | Auth | Priority |
|---|---|---|---|---|
| **GitHub** | Code | Repos, languages, contributions, bio | OAuth | Phase 1 |
| **Strava** | Sports | Activities, stats, achievements | OAuth | Phase 1 |
| **Spotify** | Music | Top artists, genres, listening stats | OAuth | Phase 1 |
| **Goodreads** | Reading | Books read, currently reading, favorites | OAuth/scrape | Phase 1 |
| **Google Scholar** | Academic | Publications, citations, h-index | Public API | Phase 1 |
| **ORCID** | Academic | Publications, affiliations | Public API | Phase 2 |
| **Letterboxd** | Movies | Watched, rated, favorites | Scrape/RSS | Phase 2 |
| **Steam** | Gaming | Games owned, playtime, achievements | Public API | Phase 2 |
| **LinkedIn** | Professional | Import profile data (one-time) | Manual/export | Phase 2 |
| **Instagram** | Social | Public posts, bio (read-only) | Public API | Phase 2 |
| **YouTube** | Content | Channel stats, videos (for creators) | OAuth | Phase 2 |
| **Duolingo** | Learning | Languages studied, streaks | Public API | Phase 2 |
| **Chess.com** | Gaming | Rating, games played | Public API | Phase 2 |
| **Last.fm** | Music | Scrobbles, top artists, history | API key | Phase 2 |
| **RSS/Atom** | Content | Blog posts, articles (any feed) | Public | Phase 1 |
| **Manual import** | Any | CSV/JSON upload of arbitrary data | None | Phase 1 |

Phase 0 includes connector architecture/design only (interface, registry, contracts), not
production connector ingestion.

### 7.4 Community Connectors

The connector interface is designed so that anyone can build a connector:

1. Implement the `Connector` interface
2. Package as an npm module (or include in the repo)
3. Register in the connector registry
4. The agent automatically discovers and can use it

In later phases, a **connector marketplace** could allow the community to share
connectors (like OpenClaw's ClawHub for skills).

### 7.5 How Connectors Feed the Agent

Connectors don't just dump data — they create facts that the agent can reason about:

```
GitHub connector fetches repos →

Creates facts:
  { category: "project", key: "repo-name", value: { name: "...", stars: 42, ... }, source: "github" }
  { category: "skill", key: "python", value: { name: "Python", evidence: "12 repos" }, source: "github" }

The agent then:
  - Merges with existing facts (user already said they know Python → increase confidence)
  - Decides whether to update the page
  - Queues a message if user approval is needed
```

---

## 8. Data Model

### 8.1 Database Schema

```sql
-- Facts: everything the agent knows about you
CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSON NOT NULL,
    source TEXT DEFAULT 'chat',
    confidence REAL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'proposed', 'public', 'archived')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- Canonical taxonomy registry (extensible, but controlled)
CREATE TABLE category_registry (
    category TEXT PRIMARY KEY,
    status TEXT DEFAULT 'active',  -- 'active', 'pending', 'deprecated'
    created_by TEXT DEFAULT 'system', -- 'system', 'agent', 'user'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alias mapping used by TaxonomyNormalizer
CREATE TABLE category_aliases (
    alias TEXT PRIMARY KEY,
    category TEXT NOT NULL REFERENCES category_registry(category),
    source TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Component registry (core + community components)
CREATE TABLE component_registry (
    type TEXT PRIMARY KEY,       -- core: "hero", community: "x.author.component"
    namespace TEXT NOT NULL,     -- 'core' | 'community'
    owner TEXT NOT NULL,
    status TEXT NOT NULL,        -- 'draft' | 'certified' | 'experimental' | 'deprecated'
    version TEXT NOT NULL,
    content_schema_hash TEXT,    -- hash of the registered content schema
    renderer_ref TEXT,           -- package/module reference for renderer
    allowed_variants_json TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_component_registry_status ON component_registry(status);

-- Conversation history
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,          -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    tool_calls JSON,            -- Tool calls made in this message
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Canonical audit/event stream (tool calls, policy decisions, worker actions)
CREATE TABLE agent_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,    -- 'tool_call', 'taxonomy_review_required', 'budget_warning', ...
    actor TEXT NOT NULL,         -- 'user', 'assistant', 'worker', 'connector', 'system'
    source TEXT,                 -- 'chat', 'heartbeat', 'connector:github', ...
    entity_type TEXT,            -- 'fact', 'page', 'job', ...
    entity_id TEXT,
    payload JSON NOT NULL,
    correlation_id TEXT,         -- message_id/session_id/job_id for tracing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_agent_events_type_created ON agent_events(event_type, created_at);
CREATE INDEX idx_agent_events_corr ON agent_events(correlation_id);

-- Page configuration (the generated page)
CREATE TABLE page (
    id TEXT PRIMARY KEY DEFAULT 'main',
    username TEXT UNIQUE NOT NULL,
    config JSON NOT NULL,        -- The full page config (see Section 6.2)
    generated_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent configuration
CREATE TABLE agent_config (
    id TEXT PRIMARY KEY DEFAULT 'main',
    config JSON NOT NULL,        -- The agent identity config (see Section 4.1)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent memory (meta-knowledge, observations)
CREATE TABLE agent_memory (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,        -- Free-form observation
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Connected services
CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    connector_type TEXT NOT NULL, -- 'github', 'strava', etc.
    credentials JSON,            -- Encrypted OAuth tokens, API keys
    config JSON,                 -- Connector-specific settings
    last_sync DATETIME,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Uploaded media metadata (MVP default: binary in SQLite for single-file portability)
CREATE TABLE media_assets (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL DEFAULT 'main',
    kind TEXT NOT NULL CHECK (kind IN ('avatar', 'gallery', 'cover')),
    storage_backend TEXT NOT NULL DEFAULT 'sqlite', -- 'sqlite' | 'fs' | 's3'
    storage_key TEXT,               -- required for 'fs'/'s3', null for 'sqlite'
    blob_data BLOB,                 -- used when storage_backend='sqlite'
    mime_type TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    sha256 TEXT NOT NULL,
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'proposed', 'public', 'archived')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(storage_backend, storage_key)
);
CREATE UNIQUE INDEX uniq_media_avatar_per_profile
ON media_assets(profile_id)
WHERE kind = 'avatar';

-- Connector sync log
CREATE TABLE sync_log (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL REFERENCES connectors(id),
    status TEXT NOT NULL,        -- 'success', 'error', 'partial'
    facts_created INTEGER DEFAULT 0,
    facts_updated INTEGER DEFAULT 0,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Background jobs (heartbeat, connector sync, retries)
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,         -- 'heartbeat', 'connector_sync', 'page_regen', 'taxonomy_review'
    payload JSON NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'running', 'done', 'error'
    run_after DATETIME NOT NULL,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_jobs_due ON jobs(status, run_after);

-- LLM usage accounting and guardrails
CREATE TABLE llm_usage_daily (
    day TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    PRIMARY KEY(day, provider, model)
);

CREATE TABLE llm_limits (
    id TEXT PRIMARY KEY DEFAULT 'main',
    daily_token_limit INTEGER DEFAULT 150000,
    monthly_cost_limit_usd REAL DEFAULT 25.0,
    daily_cost_warning_usd REAL DEFAULT 1.0,
    daily_cost_hard_limit_usd REAL DEFAULT 2.0,
    warning_thresholds_json TEXT DEFAULT '[0.5,0.75,0.9,1.0]',
    heartbeat_call_limit INTEGER DEFAULT 3,
    hard_stop BOOLEAN DEFAULT TRUE,
    warning_cooldown_minutes INTEGER DEFAULT 60,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Embeddings for semantic search
-- (managed by sqlite-vec extension)
CREATE VIRTUAL TABLE fact_embeddings USING vec0(
    fact_id TEXT,
    embedding FLOAT[384]         -- Dimension depends on model
);

-- Full-text search index
CREATE VIRTUAL TABLE facts_fts USING fts5(
    category, key, value_text,
    content='facts',
    content_rowid='rowid'
);
```

### 8.2 Storage

**SQLite** as the sole database. In MVP, one file contains your full identity,
including avatar media (`media_assets.blob_data`).

If optional media backends (`fs`/`s3`) are enabled later, portability remains:
backup = SQLite + media bundle.

Why SQLite:
- Zero configuration
- Single file — trivially portable and backupable
- Extensions: FTS5 (full-text search), sqlite-vec (vector search)
- Performance: more than sufficient for single-user workloads
- Works everywhere: server, desktop, edge

### 8.3 Export & Portability

Your data is always exportable:

| Format | What | Use case |
|---|---|---|
| SQLite file | Everything (MVP/default) | Full backup, migrate to another instance |
| Bundle (`.zip`/`.tar`) | SQLite + media assets | Full backup when using `fs`/`s3` media backends |
| JSON | Knowledge base + page config | Machine-readable, API consumption |
| HTML | Generated page | Host anywhere (GitHub Pages, S3, etc.) |
| PDF | Profile as document | CV, job applications |
| Markdown | Profile as text | Embed in README, docs |

The static HTML export is particularly important — it means you can generate your page
with OpenSelf and then host it anywhere, completely independently. No lock-in.

### 8.4 Consistency & Concurrency

To keep behavior stable when chat, heartbeat, and connectors all write concurrently:

1. **Single writer per user**: mutations are serialized through one queue/worker per user.
2. **Atomic updates**: fact writes + page config changes + `agent_events` writes are committed in
   one transaction.
3. **Optimistic concurrency**: updates include `updated_at` preconditions; stale writes fail
   and are retried with fresh state.
4. **Conflict policy**: user-confirmed facts win over inferred connector facts; otherwise
   latest trusted source wins by timestamp + confidence.
5. **Idempotency**: connector sync runs are keyed by external event ID to prevent duplicates.

### 8.5 Media Storage

MVP decision: avatar-only uploads. No gallery/media wall uploads in MVP.

Binary assets are not stored as base64 blobs in `facts` or `page.config`.

Default strategy (self-hosted, MVP):
- Metadata + binary in SQLite (`media_assets`, `storage_backend='sqlite'`)
- `page.config` references avatar via media id (preferred) or resolved URL path
- Single-file backup remains true for personal instances

Optional strategy (later/advanced deployments):
- Filesystem or S3-compatible backend (`storage_backend='fs'|'s3'`)
- Same metadata table, different resolver

MVP guardrails:
- One avatar per profile (enforced by `uniq_media_avatar_per_profile` index)
- Max upload size: 2 MB
- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`
- Processing pipeline: strip EXIF, generate normalized WebP sizes (`128x128`, `512x512`)
- Deduplication by SHA-256 hash
- Avatar visibility follows the same `private/proposed/public/archived` lifecycle as facts

Non-avatar visual elements should be text/icons/emoticons from the design system,
not user-uploaded binaries.

### 8.6 LLM Cost & Rate Limits

Cost control is enforced in the runtime, not left to provider dashboards alone.

Default guardrails (single-user self-hosted starter profile):
1. Daily token cap: `150000`
2. Monthly estimated cost cap: `$25`
3. Daily cost warning: `$1`
4. Daily hard-stop cap: `$2`
5. Per-heartbeat call cap: `3`
6. Warning thresholds: `50%, 75%, 90%, 100%`
7. Hard-stop mode (`hard_stop=true`) blocks new calls when limits are reached
8. Soft mode (`hard_stop=false`) allows explicit manual override in UI

Accounting is tracked per day/provider/model in `llm_usage_daily`.

Configuration precedence (highest first):
1. Runtime settings persisted in `llm_limits` (changed via admin/settings UI)
2. Environment variables (`LLM_*`) loaded at boot
3. Schema defaults in `llm_limits`

Boot behavior:
- If `llm_limits` row does not exist, create it from env values (or schema defaults).
- After creation, DB values are the source of truth.

---

## 9. UX Principles

### 9.1 The 10 Commandments

1. **The user's time is sacred.** 5 minutes should produce a complete page.
2. **Value before everything.** Show the page before asking for an account.
3. **The agent proposes, the person decides.** Nothing goes live without consent.
4. **No vanity metrics.** No likes, no followers, no "profile completeness" bars.
5. **Finite by design.** When the profile is updated, the app says "you're good" and lets you go.
6. **Accessible to everyone.** A 70-year-old and a 20-year-old should both succeed.
7. **Conversation, not forms.** Never make the user fill out a structured form.
8. **Radical transparency.** The user can always see why the agent did something.
9. **Celebrate the person, not the app.** The page showcases YOU, not OpenSelf.
10. **If usage time decreases, we are winning.** Less time in the app = more value delivered.

### 9.2 Conversation Design

**The agent's persona:** A reflective companion. Not a fake friend, not a motivational
coach, not a robot. Like a good journalist who helps you tell your story.

**Tone:** Warm but not invasive. Curious but not nosy. Concise but not cold.

**Anti-patterns:**
- Never ask what the agent already knows
- Never more than 3 questions in a row
- Never "Great question!" or filler phrases
- Never push the user to share more than they want
- Never guilt-trip for inactivity ("You haven't visited in 2 weeks!")

**When to stop:**
> "Your page is up to date. Nothing new from your connected services.
> If you have something new to tell me, I'm here. Otherwise, see you next time!"

### 9.3 Onboarding (The First Minute)

Based on the Peak-End Rule: the "wow moment" must arrive in under 60 seconds.

```
0:00  App opens. No registration form. One prompt:
      "Tell me about yourself — who are you and what are you into?"

0:15  User responds.

0:30  Agent generates a draft page in real-time.

0:45  WOW MOMENT — the page exists. It already looks great.

1:00  "Like it? Want to change anything?"

2:00  Refinements via conversation.

3:00  "Choose your username" → create account.

5:00  Page is live. User shares the URL.
```

**Key principle:** Value before registration. Like Duolingo (complete a lesson before
creating an account), the user sees their page before committing.

### 9.4 Accessibility

- **Voice as primary modality** — not an accessory. If someone can only speak
  (no typing), they should still get a full page. The agent listens (Whisper),
  reasons, and can speak back (TTS). See Section 4.7.
- **Screen reader support** — full ARIA compliance, WCAG AAA contrast (7:1)
- **Language-first onboarding** — the app asks for the user's language before
  anything else. The agent converses, extracts facts, and generates the page in
  that language. See Section 2 (How It Works).
- **Automatic page translation** — visitors who speak a different language can
  view the page translated. See Section 6.7.
- **Low-bandwidth** — generated pages are lightweight, fast on any connection
- **No jargon** — the app never uses technical terms unless the user does first

---

## 10. Technical Stack

Chosen for: simplicity, AI-coding compatibility, mature ecosystem, single-developer
feasibility.

| Component | Technology | Why |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | Full-stack in one project. SSR/SSG for public pages. |
| **Language** | TypeScript | Type safety. AI coding assistants generate it well. |
| **UI** | Tailwind CSS + shadcn/ui | Beautiful components fast. AI generates them perfectly. |
| **Database** | SQLite (via Drizzle ORM) | Zero config. One file. Portable. |
| **Search** | SQLite FTS5 + sqlite-vec | Full-text + vector search without external dependencies. |
| **AI SDK** | Vercel AI SDK | BYOM out of the box: OpenAI, Anthropic, Ollama, Google. Streaming. Tool calling. |
| **Auth** | NextAuth.js (Auth.js) | OAuth (Google, GitHub, email). Only needed for multi-user/cloud. |
| **Voice STT** | Web Speech API + Whisper | Browser-native speech input. Whisper (local or API) for server-side transcription. Multi-language. |
| **Voice TTS** | eSpeak NG / Piper / Provider APIs | Open-source local TTS (eSpeak NG, Piper) for privacy. Cloud TTS APIs for premium quality (opt-in). |
| **Translation** | LLM + DeepL/Google Translate (fallback) | Page auto-translation for visitors. Pre-cached for common languages. |
| **Background Jobs** | Dedicated Node.js worker + SQLite `jobs` table | Heartbeat, connector sync, retries outside request lifecycle. |
| **License** | AGPL-3.0 (outbound) + CLA/CAA (inbound) | Copyleft on hosted forks + explicit contribution rights for future relicensing/commercial options. |

### What we DON'T use (and why)

| Not using | Why not |
|---|---|
| PostgreSQL | Overkill for single-user. SQLite is simpler and more portable. |
| LangChain | Too much abstraction. Vercel AI SDK is simpler and sufficient. |
| Vector database (Pinecone, etc.) | sqlite-vec keeps everything in one file. |
| Docker (for MVP) | Adds complexity. Node.js + SQLite runs everywhere. |
| React Native / mobile | Browser-first. PWA later if needed. |
| WASM plugins (for MVP) | Connectors are TypeScript modules first. WASM is Phase 3. |

---

## 11. Deployment

### 11.1 Self-Hosted (Primary)

OpenSelf runs on any machine with Node.js:

```bash
git clone https://github.com/openself/openself
cd openself
cp .env.example .env          # Set your LLM API key
npm install
npm run dev                    # Web app → localhost:3000
npm run worker:dev             # Background worker (jobs/scheduler; heartbeat/connectors in Phase 1+)
```

**BYOM (Bring Your Own Model):**
```env
# .env — choose your LLM

# Option A: OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Option B: Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Option C: Local (Ollama)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.3

# Option D: Google
AI_PROVIDER=google
GOOGLE_API_KEY=...

# Cost guardrails (recommended)
LLM_DAILY_TOKEN_LIMIT=150000
LLM_MONTHLY_COST_LIMIT_USD=25
LLM_DAILY_COST_WARNING_USD=1
LLM_DAILY_COST_HARD_LIMIT_USD=2
LLM_WARNING_THRESHOLDS_PCT=50,75,90,100
HEARTBEAT_MAX_LLM_CALLS=3
LLM_HARD_STOP=true

# Used to seed llm_limits on first boot; after seeding, DB values are authoritative
```

### 11.2 One-Click Deploy

For people who want their own instance without touching a terminal:

```
[Deploy to Vercel]  [Deploy to Railway]  [Deploy to Fly.io]
```

These buttons deploy a fully functional instance with zero configuration beyond
setting an LLM API key. Vercel's free tier is sufficient for a personal instance.
For serverless targets, scheduler ticks run via platform cron invoking an internal
endpoint (for example every 5 minutes).

### 11.3 Static Export

For maximum portability, the generated page can be exported as static HTML:

```bash
npm run export -- --username tommaso
# → /out/tommaso/index.html (self-contained, host anywhere)
```

This HTML file can be uploaded to GitHub Pages, Netlify, S3, or any static
host. The page works completely independently of OpenSelf.

### 11.4 Future: Managed Cloud

When (and if) the community requests it, a managed service at
`openself.com` will offer:

- Sign up → talk → page live at `openself.com/username`
- No API keys needed (LLM is included)
- Automatic backups
- Custom domain support
- Always-on connectors (heartbeat runs on our servers)

This is a **service**, not a feature gate. The self-hosted version has 100% of
the functionality. The cloud version is convenience.

**Pricing (future, only when demand exists):**

| Tier | Price | Includes |
|---|---|---|
| Free | €0 | Page + 10 AI messages/month + 1 connector |
| Pro | €9/month | Unlimited AI + all connectors + custom domain + priority |

### 11.5 Runtime Model (Web + Worker)

OpenSelf runs with two execution roles:

1. **Web app (Next.js)**: chat UI, public pages, APIs
2. **Worker (Node.js process)**: heartbeat, connector polling, retries, scheduled tasks

Why this split:
- Next.js request handlers are not a reliable place for long-lived periodic jobs
- Worker execution can be bounded, retried, and monitored independently

Scheduling model:
- Human config (`interval: "24h"`) is compiled into `jobs.run_after`
- Worker dequeues due jobs and processes them transactionally
- Serverless deployments use cron-triggered scheduler ticks to enqueue due work

---

## 12. Security & Privacy

### 12.1 Principles

1. **Privacy by default.** New facts are `private` until explicitly made public.
   The agent asks before exposing sensitive information.
2. **Data minimization.** Only store what's needed. Conversation history is summarized
   and archived, not kept indefinitely.
3. **Local-first.** In self-hosted mode, data never leaves your machine.
4. **No tracking.** The app does not track usage, does not have analytics, does not
   phone home.
5. **Transparent AI.** The user can inspect tool calls and automated decisions in a debug
   view backed by `agent_events`.

### 12.2 Connector Security

- OAuth tokens stored encrypted in the database
- Encryption keys are externalized (`OPENSELF_ENCRYPTION_KEY` self-hosted, KMS in cloud)
- Key rotation uses key versioning + background re-encryption
- Connectors have read-only access to external services by default
- API keys can be rotated without data loss
- Connector permissions are granular (user chooses what to share)
- Connector credentials are never exposed to the LLM context

### 12.3 Page Visibility

Every fact has a `visibility` field:
- `private` — stored in KB, never shown on public page
- `proposed` — visible only in onboarding/draft preview, not public
- `public` — appears on the public page
- `archived` — removed from the page but preserved in KB for history/context

The agent uses private facts to understand you better (e.g., salary expectations,
personal struggles) without ever putting them on the page.

Onboarding policy:
- Facts start as `private`
- Candidate non-sensitive facts can be moved to `proposed` for draft preview
- One final publish checkpoint promotes approved `proposed` facts to `public`

### 12.4 LLM Privacy

- **Self-hosted + Ollama**: Zero data leaves your machine. Fully air-gapped possible.
- **Self-hosted + cloud LLM**: Your data is sent to the LLM provider (OpenAI, etc.).
  Standard LLM provider privacy policies apply.
- **Managed cloud (future)**: Data stored on our servers (EU), encrypted at rest.
  LLM calls go through our infrastructure.

The user always knows where their data goes. The app is explicit about this in onboarding.

### 12.5 LLM Cost Safety

To avoid runaway costs (for example from heartbeat loops or connector bursts):

- Every LLM call checks limits before execution (`llm_limits`)
- Usage is metered after each call (`llm_usage_daily`)
- Heartbeat has a hard cap of LLM calls per run
- Warning notifications fire at 50/75/90/100% budget usage (cooldown applied)
- On limit breach:
  - `hard_stop=true`: block calls and surface actionable error
  - `hard_stop=false`: queue warning + allow explicit manual override
- The worker never retries rate-limited calls without backoff and jitter

### 12.6 VisibilityPolicy (Onboarding vs Steady State)

Visibility is mode-aware and enforced by `VisibilityPolicy`:

1. **Onboarding mode**
   - Default for new facts: `private`
   - Non-sensitive, high-confidence facts may be marked `proposed`
   - Draft preview renders `public + proposed`
   - Final publish checkpoint is required to promote `proposed -> public`
2. **Steady-state mode**
   - Default for new facts: `private`
   - Any public change requires explicit per-change confirmation (unless auto-approve exists)
3. **Sensitive categories**
   - Always start and remain `private` until explicit user action
   - Examples: compensation, health, personal struggles, private contacts
4. **Non-sensitive proposal allowlist (default)**
   - `identity` (public profile fields only), `project`, `skill`, `interest`, `achievement`,
     `activity`, `social` (public handles/links)
   - `identity` public profile fields (explicit):
     - `name.full`
     - `tagline.text`
     - `location.city`, `location.country`
     - `avatarMediaId` (if approved)
     - `pronouns` (only if explicitly provided/approved)
   - `identity` fields never auto-proposed: legal name variants, phone, personal email,
     exact address, date of birth, private contacts
   - Categories outside the allowlist remain `private` unless explicitly approved
5. **Archived state**
   - Facts transition from `public` to `archived` when no longer relevant for the page
     (old job, past event, superseded info)
   - Archived facts are preserved in the KB for history, context, and potential reactivation
   - The agent uses archived facts for reasoning (e.g., career evolution analysis)
     but never renders them on the public page

---

## 13. Roadmap

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

Not in this phase:
  - No auth / multi-user
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
  [ ] Collect structured feedback: UX friction, agent quality, rendering bugs
  [ ] Stress-test LLM adapter with diverse languages, edge-case inputs, and adversarial prompts
  [ ] Fix critical issues surfaced during dogfooding
  [ ] LLM Evals pass rate ≥ 95% on canned test suite
```

**Definition of done (gate):** At least 10 real profiles exist, critical bugs are
resolved, and the team has confidence the 5-minute promise holds for non-developers.

### Phase 1 — Living Agent (Months 2-4)

**Goal:** The agent comes alive. It remembers, adapts, and connects to the world.

```
Agent:
  [ ] Agent config (personality, tone, behavior — evolving)
  [ ] Agent memory (meta-observations about the user)
  [ ] Semantic search (sqlite-vec embeddings)
  [ ] Heartbeat system (periodic self-reflection)
  [ ] Conversation context assembly (facts + history + page state)
  [ ] LLM usage metering + budget enforcement (daily token limits, cost caps, warning thresholds)
  [ ] Anti-abuse hardening (conversation pace throttle, session length caps, stealth captcha on onboarding→chat transition)
  [ ] Fact conflict resolver v1 (source precedence + supersede semantics + deterministic merge policy)
  [ ] LLM Evals expansion (multi-session coherence: assert KB integrity after 50+ simulated conversations)

Connectors:
  [ ] Connector interface definition
  [ ] GitHub connector (OAuth, repos, languages, contributions)
  [ ] RSS/Atom connector (blog posts from any feed)
  [ ] Manual import (CSV/JSON upload — including LinkedIn data export as priority import source)

Page:
  [ ] All components (timeline, achievements, stats, reading, music, contact)
  [ ] All themes (5 total)
  [ ] Component variants
  [ ] Static HTML export
  [ ] PDF export (profile as CV)

Infrastructure:
  [ ] One-click deploy buttons (Vercel, Railway)
  [ ] .env.example with all providers
  [ ] README with screenshots, quick start, demo video
  [ ] Add `LICENSE` (AGPL-3.0) + copyright notices
  [ ] Add inbound contribution policy (`CLA` or `CAA`) + GitHub signature bot
```

**Definition of done:** The agent remembers you across sessions, proactively suggests
updates, pulls data from GitHub, and you can export your page as static HTML.

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
  [ ] Auth / multi-user (NextAuth — for managed hosting)
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

## 14. Design Decisions

Key architectural decisions and their rationale, recorded as ADRs
(Architecture Decision Records).

### ADR-001: SQLite over PostgreSQL

**Decision:** Use SQLite as the sole database.

**Context:** PostgreSQL is the standard for web apps, but we're building a single-user
tool that should be trivially portable.

**Rationale:**
- MVP default: one file = entire identity (backup = copy a file)
- Zero configuration (no database server to run)
- FTS5 and sqlite-vec provide search without external services
- Performance is more than sufficient for our workload
- Aligns with local-first philosophy

**Trade-off:** Multi-user/cloud deployment will need a SQLite-per-user strategy or a
future migration to PostgreSQL for the managed service. Advanced media backends
(`fs`/`s3`) may introduce sidecar storage by choice.

### ADR-002: Component-based page generation over free-form HTML

**Decision:** The agent composes pages from pre-built components via a JSON config,
rather than generating raw HTML.

**Context:** Having the AI generate arbitrary HTML would give maximum creative freedom
but minimum consistency and reliability.

**Rationale:**
- Deterministic: same config = same page, always
- Safe: the AI cannot produce broken or ugly layouts
- Testable: components are tested independently
- Themeable: themes apply to all components uniformly
- Accessible: components are built with a11y from the start
- Recognizable: all OpenSelf pages share a visual DNA

**Trade-off:** Less creative freedom than raw HTML generation. Mitigated by offering
many components, variants, themes, and style options.

### ADR-003: Vercel AI SDK over LangChain/LiteLLM

**Decision:** Use Vercel AI SDK as the AI layer.

**Context:** Multiple options exist for LLM abstraction in TypeScript.

**Rationale:**
- Native BYOM: supports OpenAI, Anthropic, Google, Ollama with unified API
- Streaming built-in
- Tool calling built-in
- TypeScript-native (not a Python port)
- Well-maintained, backed by Vercel
- AI coding assistants generate excellent code for it

**Trade-off:** Tighter coupling with Vercel ecosystem. Acceptable because we use it
purely as an SDK, not as a platform dependency.

### ADR-004: AGPL-3.0 Outbound + CLA/CAA Inbound

**Decision:**
- Outbound project license is AGPL-3.0.
- Inbound external contributions require a signed agreement (`CLA` or `CAA`) before merge.

**Context:**
- MIT/Apache would be more permissive; GPL would protect code but not network use.
- AGPL alone does not prohibit third parties from commercial hosting/resale.
- Future dual-licensing/commercial transactions require explicit rights on contributed code.

**Rationale:**
- AGPL requires anyone who modifies and hosts OpenSelf to share source changes.
- The project remains open and copyleft-aligned by default.
- Inbound `CLA`/`CAA` gives maintainers legal clarity for relicensing, sublicensing,
  and transfer scenarios.
- Legal policy is explicit at PR time (bot-enforced), reducing ambiguity later.

**Trade-off:**
- AGPL still allows commercial use by others (with copyleft obligations).
- `CLA`/`CAA` introduces contributor friction and may reduce community PR volume.
- `CLA` is usually easier for community adoption; `CAA` gives stronger ownership control.

### ADR-005: Conversation-first over form-first

**Decision:** The primary input method is natural conversation, not forms or fields.

**Context:** Traditional profile builders use structured forms. We use an AI agent.

**Rationale:**
- Lower friction: talking is easier than filling forms
- Richer data: conversations reveal personality, not just facts
- Accessible: works for people who struggle with forms
- Engaging: people enjoy talking about themselves to an interested listener
- Flexible: the agent can ask follow-up questions that a form cannot

**Trade-off:** LLM cost per interaction. Mitigated by BYOM (user pays their own LLM
costs in self-hosted mode) and efficient prompt engineering.

### ADR-006: No separate .org and .cloud domains

**Decision:** Everything lives under a single domain: `openself.com`.

**Context:** Many open-source projects split into a .org (community) and a .com/.cloud
(commercial). This creates confusion about what's free and what's paid.

**Rationale:**
- One brand, one domain, one community
- No confusion between "free version" and "paid version"
- Self-hosted users and cloud users are the same community
- The software is identical everywhere — cloud is just hosting

### ADR-007: TypeScript connectors first, WASM later

**Decision:** Connectors are TypeScript modules in Phase 0-2. WASM is Phase 3.

**Context:** WASM would provide better sandboxing and language-agnosticism for plugins.

**Rationale:**
- TypeScript is simpler to write and debug
- The community already knows TypeScript
- Sandboxing is less critical when connectors are reviewed and included in the repo
- WASM adds significant complexity (Extism runtime, PDK, cross-compilation)
- Premature optimization: we don't know if we'll have community connectors soon

**Trade-off:** Less sandboxing, less language choice. Acceptable for early phases.
WASM migration path is clear when needed.

### ADR-008: Community Components — Build-Time Trusted First, Runtime Untrusted Later

**Decision:** In Phase 2, community React components are allowed only via build/deploy-time
installation with pinned versions. Runtime remote code loading is out of scope by default.

**Context:** Executing third-party React dynamically in Next.js is risky:
- Server execution can expose privileged runtime surfaces if not fully isolated
- Client runtime loading increases XSS/supply-chain risk
- Runtime bundling/isolation complexity is high for a small team

**Rationale:**
- Security first: reduce privilege and attack surface
- Reproducible deployments via lockfile and deterministic builds
- Simpler ops/debugging than runtime code fetch/compile
- Compatible with existing CI gates (schema, visual, a11y, performance)

**Trade-off:** Less "instant plugin install" feel. Mitigated by:
- Fast build-time installation workflow
- DSL/template contribution path for non-code customizations
- Future iframe sandbox mode for truly untrusted runtime extensions

**Future path:** If dynamic execution becomes necessary, use cross-origin sandboxed iframes
and structured message contracts only.

### ADR-009: Scalability Strategy — Design for 10K, Evolve to 1M

**Decision:** Design for 10,000 users with clean architecture, then evolve to
hyperscale. Do not prematurely optimize for 1M users.

**Context:** The architecture must support both single-user self-hosting and a
future managed cloud with many users. Over-engineering for scale now would slow
down the MVP. Under-engineering would create a dead end.

**Rationale — three key decisions:**

1. **Stateless agent** — The agent must not depend on in-memory state. Everything
   must be reconstructable from the database. This enables horizontal scaling.
2. **Async job queue** — Heartbeat, insight analysis, connector sync, and trend
   analysis must run in background workers, not in request-response handlers.
   This is already in the architecture (Section 11.5).
3. **Data access layer abstraction** — All database access goes through a repository
   layer (Drizzle ORM). No raw SQL scattered in business logic. This makes future
   database migration (SQLite → PostgreSQL) feasible without rewriting everything.

**Known scaling bottlenecks to address when needed:**

| Bottleneck | When it matters | Migration path |
|---|---|---|
| SQLite write concurrency | 100K+ users with concurrent writes | PostgreSQL (via Drizzle, same schema) |
| Heartbeat LLM cost | 100K+ users with daily heartbeat | Event-driven (skip if nothing changed), batch processing, tiered models |
| Insight/trend engine | Any user-level daily analysis | Centralized trend cache, shared knowledge graph, RAG |
| Real-time voice | High concurrent voice sessions | Edge compute, WebRTC, local Whisper |

**LLM cost is the real constraint**, not CPU, RAM, or storage. Sustainability
requires:
- Event-driven heartbeat (not blind polling)
- Multi-model routing (cheap model for simple tasks, expensive for complex)
- Local inference for lightweight functions (embedding, classification)
- Possibly fine-tuned small models for frequent operations

**Trade-off:** The current architecture is not hyperscale-ready. But it is
modular, with separated memory/agent/rendering/connector layers. Each layer
can be extracted into its own service independently. This is the right balance
for now.

### ADR-010: Agent as Identity Coach, Not Social Network

**Decision:** The agent evolves into a personal identity coach (gap analysis,
trend alignment, career navigation) but never becomes a social network.

**Context:** As the agent gains more context about the user, it could naturally
evolve toward social features (feeds, connections, engagement). This is explicitly
rejected.

**Rationale:**
- The agent works for the user, not for an advertiser or engagement algorithm
- Suggestions are private (only the user sees them), not public
- Opportunities are filtered by relevance, not engagement potential
- No vanity metrics, no comparison, no competition
- No feed, no timeline of others, no "who viewed your profile"

**The boundary:** OpenSelf is an assistant, not a platform. Users opt-in to
discovery (Section 6.9) but never to engagement mechanics.

**Trade-off:** Less viral growth potential. This is intentional — organic growth
through genuine value, not addiction mechanics.

---

## 15. Execution Spec

This section defines what the runtime must do, independent of prompt quality.

### 15.1 Ownership Boundaries

- The LLM proposes; the application enforces.
- The LLM never writes directly to database tables.
- All mutations pass through deterministic services:
  - `PromptAssembler` (system prompt block composition)
  - `TaxonomyNormalizer` (category canonicalization)
  - `VisibilityPolicy` (`private`/`proposed`/`public`/`archived` enforcement)
  - `BudgetGuard` (token/cost limits)
  - `PageConfigValidator` (schema validation before persist/render)
  - `MutationExecutor` (transaction + conflict policy)

### 15.2 Mutation Pipeline

For every write action (`create_fact`, `update_fact`, connector ingest, heartbeat update):

1. Validate payload schema.
2. Normalize category via alias registry.
3. Apply visibility and confidence policy defaults.
4. Check LLM budget/rate limits (if LLM call is required).
5. Commit fact + page diff + audit/tool log in one transaction.
6. Enqueue follow-up jobs (render, notification, sync) idempotently.

Audit/tool log target:
- Write all non-chat operational events to `agent_events`.
- `messages.tool_calls` remains a conversation-local mirror for chat UX.

### 15.3 Taxonomy Normalization Contract

- Input: raw `category` from LLM/tool.
- Output: canonical `category` persisted in `facts.category`.
- Deterministic resolution order:
  1. Built-in aliases
  2. `category_aliases` table
  3. New canonical category registration (if valid)
- The runtime stores raw input in `agent_events.payload` for traceability.

### 15.4 Scheduler Contract

- Scheduler source of truth is the `jobs` table (`run_after`, `status`).
- Worker acquires due jobs with leasing semantics and bounded retries.
- Cron endpoints only enqueue work; they do not execute long jobs inline.

### 15.5 Media Contract

- MVP is avatar-only: one profile image upload, no gallery uploads.
- MVP default stores avatar binary in SQLite (`media_assets.blob_data`).
- Optional backends (`fs`, `s3`) are supported later without schema changes.
- Schema-level constraint: max one avatar per profile (`uniq_media_avatar_per_profile`).
- Avatar visibility uses the same `private/proposed/public/archived` state machine.
- Public rendering uses sanitized, size-bounded derivatives.

### 15.6 Taxonomy Bootstrap Contract

`category_registry` and `category_aliases` are initialized by migration seed data.

Seeded canonical categories (minimum):
- `identity`, `experience`, `project`, `skill`, `interest`, `achievement`, `activity`, `social`, `reading`

Seeded aliases (examples):
- `job`, `work`, `employment` -> `experience`
- `skills`, `tech` -> `skill`
- `hobby`, `hobbies` -> `interest`

Runtime behavior:
- If category is known: normalize and write.
- If category is unknown but valid: create in `category_registry` with `status='pending'`,
  write fact using the new canonical slug, and create an `agent_events` record with
  `event_type='taxonomy_review_required'`.
- Optionally enqueue `jobs.job_type='taxonomy_review'` for async reviewer workflows.
- If invalid: reject write with deterministic validation error.

### 15.7 Bootstrap Seed (SQL Reference)

Suggested migration files:
- `db/migrations/0001_core_schema.sql` (creates taxonomy tables)
- `db/migrations/0002_taxonomy_seed.sql` (seeds canonical categories + aliases)
- `db/migrations/0003_component_registry.sql` (component registry bootstrap)

```sql
-- 0002_taxonomy_seed.sql
-- Canonical categories (minimum baseline)
INSERT OR IGNORE INTO category_registry (category, status, created_by) VALUES
  ('identity', 'active', 'system'),
  ('experience', 'active', 'system'),
  ('project', 'active', 'system'),
  ('skill', 'active', 'system'),
  ('interest', 'active', 'system'),
  ('achievement', 'active', 'system'),
  ('activity', 'active', 'system'),
  ('social', 'active', 'system'),
  ('reading', 'active', 'system');

-- Aliases
INSERT OR IGNORE INTO category_aliases (alias, category, source) VALUES
  ('job', 'experience', 'system'),
  ('work', 'experience', 'system'),
  ('employment', 'experience', 'system'),
  ('career', 'experience', 'system'),
  ('skills', 'skill', 'system'),
  ('tech', 'skill', 'system'),
  ('hobby', 'interest', 'system'),
  ('hobbies', 'interest', 'system'),
  ('book', 'reading', 'system'),
  ('books', 'reading', 'system'),
  ('event', 'activity', 'system'),
  ('events', 'activity', 'system'),
  ('activities', 'activity', 'system');
```

### 15.8 TaxonomyNormalizer (TypeScript Reference)

Suggested runtime file:
- `src/lib/taxonomy/normalizeCategory.ts`

```ts
export type NormalizeResult = {
  canonical: string;
  action: "known" | "alias" | "created_pending";
};

type TaxonomyStore = {
  findCanonical(category: string): Promise<string | null>;
  findAlias(alias: string): Promise<string | null>;
  createPendingCategory(category: string): Promise<void>;
};

const CATEGORY_RE = /^[a-z][a-z0-9-]{1,47}$/;

function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export async function normalizeCategory(
  raw: string,
  store: TaxonomyStore,
): Promise<NormalizeResult> {
  const slug = toSlug(raw);
  if (!CATEGORY_RE.test(slug)) {
    throw new Error(`INVALID_CATEGORY:${raw}`);
  }

  const canonical = await store.findCanonical(slug);
  if (canonical) return { canonical, action: "known" };

  const aliasTarget = await store.findAlias(slug);
  if (aliasTarget) return { canonical: aliasTarget, action: "alias" };

  await store.createPendingCategory(slug);
  return { canonical: slug, action: "created_pending" };
}
```

### 15.9 Visibility State Machine

Fact visibility has four states and transitions are explicit and mode-dependent:

```
private → proposed → public → archived
   ↑                    │         │
   └────────────────────┘         │
   ↑         (revoke)             │
   └──────────────────────────────┘
              (reactivate as private, then re-propose)
```

Transition rules:
- `private -> proposed` only via `VisibilityPolicy` in onboarding/draft flows
- `proposed -> public` only on publish checkpoint approval
- `public -> archived` when the agent or user decides a fact is no longer relevant
  for the page (e.g., old job, past event) but should be preserved for history
- `archived -> private` for reactivation (re-enters the proposal flow)
- `public -> private` allowed anytime by user request/policy action
- `private -> public` direct jump is disabled in onboarding; allowed in steady state only
  with explicit approval

Renderer mode rules:
- Draft preview: render `public + proposed`
- Public page: render `public` only
- Archived facts are never rendered but remain queryable by the agent for context

### 15.10 PageConfig Validation Contract

Before any `page.config` write:
1. Validate against `PageConfig` schema (`PageConfigValidator`)
2. Run component-level `content` validators by `section.type`
3. Reject unknown/unregistered component types and invalid variants
4. Persist only schema-valid config

Renderer never queries KB during render; it consumes only persisted `PageConfig`.

### 15.11 Component Registry Contract (Phase 2+)

- Allowed `section.type` values are:
  - core allowlist in code
  - registry entries with status `certified` or `experimental` (explicit opt-in)
- Community `section.type` must match namespaced format: `x.<author>.<component>`
- Registry metadata includes at minimum:
  - `type`, `version`, `owner`, `status`
  - `content_schema_hash`
  - renderer package reference
- Validator resolves schema by `section.type` and enforces it before persistence.
- Deprecated components can still render old pages, but are blocked for new writes
  unless an explicit migration policy allows them.

### 15.12 Brand Compliance Contract (Phase 2+)

- Renderer enforces the shared token envelope (typography, spacing, radius, motion).
- Community components cannot inject:
  - global CSS overrides
  - external fonts
  - executable third-party scripts
- CI quality gates for certified components/themes:
  - schema tests
  - visual regression snapshots
  - accessibility checks
  - performance budget checks
- On policy failure:
  - fallback to a safe core variant
  - record `agent_events` entry (`event_type='component_fallback'`)

### 15.13 Schema-Repair & Failure Visibility Contract

When a `PageConfig` write fails validation:

1. Record `agent_events` (`event_type='page_config_validation_failed'`) with validator errors.
2. Run a bounded schema-repair loop:
   - feed structured validation errors back to model/tool chain
   - max attempts: 3 (configurable)
3. If all attempts fail:
   - keep previous valid page config unchanged
   - emit `event_type='page_config_retry_exhausted'`
   - return explicit user-visible message (never fail silently)

### 15.14 Live Preview Latency Contract

Onboarding split-view must follow a two-lane update model:

- Lane A (`optimistic`): deterministic preview from extracted facts, no extra LLM call
- Lane B (`synthesis`): async LLM narrative update for impacted sections only

UI states:
- `optimistic_ready`
- `synthesizing`
- `synthesis_ready`
- `synthesis_failed` (with fallback to optimistic version)

Rules:
- Chat response must not block on synthesis completion.
- Preview always renders a valid page config.
- Synthesis failure never clears existing preview output.

### 15.15 SQLite Concurrency Contract

Default runtime DB settings for web+worker mode:

1. `PRAGMA journal_mode = WAL`
2. `PRAGMA busy_timeout = 5000` (or deployment-specific equivalent)
3. Single-writer serialization per user for mutating workflows
4. Retry with jitter/backoff on lock contention (`SQLITE_BUSY`)
5. Idempotent mutation keys for connector/worker retries

`SQLITE_BUSY` incidents must be logged in `agent_events` with context (actor, job/message id).

### 15.16 Fact Conflict Resolution Contract (Phase 1+)

Conflict precedence (highest to lowest):

1. User explicit confirmation/correction
2. Connector facts with direct evidence
3. Agent inference from conversation

Merge rules:
- Contradictory lower-priority facts are marked superseded, not silently deleted.
- Preserve provenance (`source`, timestamps, confidence) for every competing fact.
- Public rendering uses only the winning fact per conflict set.
- All conflict decisions emit `agent_events` (`event_type='fact_conflict_resolved'`).

### 15.17 Observability Contract

Runtime reliability requires a minimum event taxonomy:

- `page_config_validation_failed`
- `page_config_retry_exhausted`
- `component_fallback`
- `sqlite_busy_retry`
- `fact_conflict_resolved`
- `budget_warning`

Minimum operational counters (Phase 0-1):
- validation failures per day
- retry-exhausted count per day
- synthesis failure rate
- sqlite lock retry count
- unresolved conflict queue size

No silent failure path is allowed in chat, worker, or connector execution.

### 15.18 Community Component Isolation Contract (Phase 2+)

Execution trust levels:

1. **Core components** (first-party): fully trusted
2. **Certified community packages**: trusted-by-review, installed at build-time only
3. **Untrusted runtime extensions**: disallowed by default; require iframe sandbox mode

Mandatory rules (Phase 2 default mode):
- No runtime fetching/executing remote React component bundles in request path
- Community packages must be version-pinned and resolved during build/deploy
- Registry activation requires `certified` status + explicit operator opt-in
- Rendering inputs are strictly schema-validated JSON; no eval/dynamic code paths
- Policy violations must emit `agent_events` (`event_type='component_policy_violation'`)

If iframe sandbox mode is enabled (future):
- Must use cross-origin iframe with restrictive `sandbox` attributes
- Parent/child communication only via typed `postMessage` contracts
- No direct DOM, cookie, localStorage, or server secret access from sandboxed extension
- On sandbox failure/timeouts, fallback to safe core component and log event

### 15.19 Low-Signal Onboarding Contract (`utente muto`)

The onboarding flow must handle users who provide minimal answers (short/low-information
messages or voice snippets) without hallucinating facts or stalling the experience.

Signal detection heuristics (combined):
- consecutive short replies
- low fact extraction yield per turn
- repeated generic replies ("yes", "ok", "non so", ...)

State machine:
1. `normal_interview`
2. `guided_prompts` (short, concrete choices instead of open prompts)
3. `quick_profile_mode` (minimal viable page with explicit "improve later" CTA)

Rules:
- Never fabricate details to fill gaps.
- Prefer confidence-safe defaults and generic copy over invented claims.
- Keep to at most 3 questions in a row before showing a tangible page update.
- If signal remains low after bounded attempts, publish-ready draft can still be produced
  with minimal sections (`hero`, short `bio`, optional `social`) and marked as editable.

Required fallback UX:
- Offer selectable prompt chips/examples ("Current role", "Projects", "Interests", "Links")
- Offer "skip for now" paths for each topic
- Show progress feedback ("I can already publish a basic page; we can enrich it later")

Observability:
- Emit `agent_events`:
  - `onboarding_low_signal_detected`
  - `onboarding_guided_prompt_used`
  - `onboarding_quick_profile_generated`
- Track metrics:
  - `% onboarding sessions entering low-signal mode`
  - publish completion rate from low-signal sessions
  - 7-day enrichment rate (users who come back and improve profile)

---

## Appendix: What This Document Replaces

This document consolidates and replaces the following files as the source of truth
for what we are building:

| File | Status |
|---|---|
| `01_IDEA.md` | Superseded. Core idea is in Sections 1-2. |
| `02_ANALISI_MERCATO.md` | Reference only. Market research, not architecture. |
| `03_ARCHITETTURA_E_MODELLO.md` | Superseded. Architecture is here. Business model deferred. |
| `04_RISCHI_E_SFIDE.md` | Reference only. Risk analysis, not architecture. |
| `05_IDEE_AGGIUNTIVE.md` | Partially incorporated. Features are in the Roadmap. |
| `06_VISION_DISRUPTIVA.md` | Reference only. Manifesto/philosophy, not building spec. |
| `07_ARCHITETTURA_PROTOCOLLO.md` | Phase 3 reference. Protocol comes after the product. |
| `08_STRATEGIA_BUSINESS.md` | Deferred. Business strategy comes after product-market fit. |
| `09_UX_ESPERIENZA_UMANA.md` | Core principles incorporated in Section 9. Full doc is reference. |
| `10_GOVERNANCE_E_STRUTTURA.md` | Deferred. Governance structure comes after traction. |
| `11_MVP_PIANO_CONCRETO.md` | Superseded. Build plan is in the Roadmap (Section 13). |

The old files remain in the repo as background research. **This document is what we build from.**
