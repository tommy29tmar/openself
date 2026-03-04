# Design: `/uat-explore` — Exploratory UAT with Dynamic Persona

**Date:** 2026-03-03
**Status:** Approved

## Problem

The current `/uat` skill uses hardcoded chat messages ("Ciao! Sono Marco", "Faccio il designer, UX"). This:
- Tests only one fixed conversation path
- Doesn't adapt to agent reply changes
- Always uses Italian, same profession, same personality
- Misses edge cases that emerge from natural conversation

## Solution

An exploratory UAT agent that:
1. **Generates a unique persona** at each run (name, profession, language, personality)
2. **Reads every agent reply** and responds in-character (no scripted messages)
3. **Verifies after every interaction** with full-page screenshots + DB checks
4. **Follows goal-based completion** (not a fixed step sequence)

## Architecture

### Level 1: Persona Generator

At run start, the agent invents a persona:

| Field | Example | Purpose |
|-------|---------|---------|
| Name | "Yuki Tanaka" | Identity |
| Profession | "Landscape architect" | Bio/projects variety |
| City | "Kyoto" | Location diversity |
| Preferred language | "ja" | L10N testing |
| Communication style | "terse, one-word answers" | Agent resilience |
| Personality | "indecisive, changes mind often" | Contradiction handling |
| Personal goal | "portfolio for clients" | Motivation |
| Tech level | "low — doesn't understand tech terms" | UX accessibility |

Persona is generated fresh each run. This naturally tests: L10N, diverse languages, edge case conversations, various interaction styles.

### Level 2: Conversation Engine

No pre-scripted messages. The agent:
1. Reads the app-agent's reply in full
2. Decides what to say based on persona + current goal
3. Responds in-character (short messages, 5-15 words, in persona's language)
4. Adapts to whatever the agent asks or suggests

### Level 3: Verification Layer

After EVERY interaction where the agent takes an action:
- **DB check**: `sqlite3` query to verify facts/config/page state
- **Full-page screenshot**: `fullPage: true` to capture entire scrollable page (not just viewport)
- **Console check**: monitor for errors

## Goals (Completion Criteria)

All goals must be achieved, in any order:

| # | Goal | Verification |
|---|------|-------------|
| G1 | Introduce self to agent | DB: >= 1 identity fact |
| G2 | Provide 5+ personal facts | DB: count(facts) >= 5 |
| G3 | Have a page generated | DB: draft exists with config |
| G4 | Test >= 2 different layouts | DB: config layout changed 2+ times |
| G5 | Test >= 2 different themes | DB: config theme changed 2+ times |
| G6 | Contradict self at least once | Behavior: change previously given info |
| G7 | Make an out-of-scope request | Behavior: ask for something impossible |
| G8 | Publish the page | DB: page with status published |
| G9 | Verify published page | Playwright: navigate to /{username}, full-page screenshot |
| G10 | Modify after publishing | DB: fact updated post-publish |

## Output Format

Produces `uat/UAT-REPORT.md` in the **same format** as the scripted UAT, so `uat-loop` can use it as input. Adds:
- **Persona** section (who was simulated)
- **Conversation Log** section (all messages exchanged)
- **Goal Checklist** (which goals were achieved)

## Comparison

| Aspect | /uat (scripted) | /uat-explore (exploratory) |
|--------|----------------|---------------------------|
| Chat messages | Fixed | Generated in-character |
| Persona | Always Marco, UX, Milano | Different every run |
| Language | Always Italian | Varies with persona |
| Path | Linear, 12 steps | Free-form, goal-based |
| Reproducibility | High | Low (report documents everything) |
| Bug coverage | Only expected path | Discovers unexpected edge cases |
| Screenshots | Viewport only | Full-page always |

## Integration

- **Standalone**: `/uat-explore` works on its own
- **Loop-compatible**: Produces same `UAT-REPORT.md` format, usable as runner in `/uat-loop`
