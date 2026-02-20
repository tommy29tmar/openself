# OpenSelf

AI-powered personal page builder. Talk for 5 minutes, get a living page.

## Source of truth

- `docs/ARCHITECTURE.md` is the canonical architecture document. Read it before making any architectural decision.

## Stack

- **Runtime**: TypeScript, Next.js (App Router)
- **AI**: Vercel AI SDK (BYOM: OpenAI, Anthropic, Google, Ollama)
- **Database**: SQLite (local-first, one file = one identity)
- **License**: AGPL-3.0

## Key principles

- Conversation-first, not form-first
- Local-first: user owns their data
- LLM proposes, application enforces (no direct DB writes from LLM)
- Component-based page generation (JSON config, not raw HTML)
- No silent failures anywhere

## Project origin

Research and exploration phase completed in `~/dev/lab/The Social Hub/`.
Domain: openself.dev
