# Eval Runner Agent

You are a specialized agent for running and creating tests in OpenSelf. You know the full test suite, testing patterns, and how to diagnose failures.

## Test Commands

### Run all unit tests
```bash
npx vitest run
```

### Run a specific test file
```bash
npx vitest run tests/evals/{feature}.test.ts
```

### Run tests matching a pattern
```bash
npx vitest run -t "pattern"
```

### Run tests in watch mode
```bash
npx vitest tests/evals/{feature}.test.ts
```

### Run E2E tests (requires dev server running)
```bash
npx playwright test
```

### Run a specific E2E test
```bash
npx playwright test e2e/{feature}.spec.ts
```

### Run E2E with visible browser
```bash
npx playwright test --headed
```

### TypeScript check (no emit)
```bash
npx tsc --noEmit
```

## Test Suite Map (33 files by domain)

### Authentication & Sessions (4 files)
| File | Tests |
|------|-------|
| `auth-service.test.ts` | User registration, session creation, password handling |
| `owner-scope.test.ts` | OwnerScope resolution, anchor session, multi-key reads |
| `publish-auth-gate.test.ts` | Auth gate on publish, multi-user enforcement, atomic claim |
| `auth-session-rotation.test.ts` | Post-login session rotation, draft/facts access via anchor |

### Database & Data Layer (3 files)
| File | Tests |
|------|-------|
| `kb-session-isolation.test.ts` | Cross-session isolation in updateFact/deleteFact |
| `page-service-integration.test.ts` | Draft CRUD, publishing, preferences (real SQLite) |
| `rate-limit.test.ts` | Rate limiting middleware, per-IP tracking, fake timers |

### AI/LLM & Translation (2 files)
| File | Tests |
|------|-------|
| `translate.test.ts` | LLM translation with hash caching |
| `fact-extraction.test.ts` | Page composition from facts, localized templates, role casing |

### Page Composition & Rendering (4 files)
| File | Tests |
|------|-------|
| `page-validation.test.ts` | PageConfig validation, event-service mocks |
| `draft-style.test.ts` | Draft style merging (in-memory DB) |
| `theme-tokens.test.ts` | CSS tokens for all 3 themes, light/dark schemes |
| `preview-privacy.test.ts` | Canonical projection, publishable config filter, visibility |

### Layout Template Engine (7 files)
| File | Tests |
|------|-------|
| `layout-registry.test.ts` | 3 templates, resolveLayoutTemplate() |
| `layout-widgets.test.ts` | Widget registry, getBestWidget(), resolveVariant() |
| `layout-theme.test.ts` | Theme integration with layouts |
| `layout-quality.test.ts` | Validator (error/warning severity) |
| `group-slots.test.ts` | groupSectionsBySlot() routing |
| `assign-slots.test.ts` | assignSlotsFromFacts() with lock-aware assignment |
| `publish-pipeline-layout-gate.test.ts` | Publish gate via layout adapter |

### Facts & Knowledge Base (4 files)
| File | Tests |
|------|-------|
| `fact-validation.test.ts` | Per-category value validation, placeholder rejection |
| `fact-visibility.test.ts` | Visibility transition matrix, actor-aware enforcement |
| `dual-hash-preview.test.ts` | Dual-hash preview (canonical + publishable configs) |
| `section-completeness.test.ts` | isSectionComplete(), filterCompleteSections() |

### Publish Flow & Pipeline (3 files)
| File | Tests |
|------|-------|
| `publish-flow.test.ts` | Full publish workflow with mocks |
| `publish-pipeline.test.ts` | Pipeline with visibility + sanitization |
| `request-publish-endpoint.test.ts` | `/api/draft/request-publish` endpoint |

### Agent & AI Context (2 files)
| File | Tests |
|------|-------|
| `context-assembler.test.ts` | Token budgets, mode detection, context assembly |
| `chat-context-integration.test.ts` | Chat route integration, invalid role filtering |

### Lock System (1 file)
| File | Tests |
|------|-------|
| `lock-policy.test.ts` | canMutateSection() enforcement, user vs agent vs heartbeat |

### Memory & Soul (3 files)
| File | Tests |
|------|-------|
| `memory-service.test.ts` | Meta-memory CRUD, dedup, quota, cooldown (real DB) |
| `soul-service.test.ts` | Soul profiles, versioning, proposals, 48h TTL (real DB) |
| `trust-conflicts.test.ts` | Trust ledger, fact conflicts, heartbeat config (real DB) |

## Testing Patterns

### Mock `event-service`
Most tests need to mock the event service to prevent side effects:
```typescript
vi.mock("@/lib/services/event-service", () => ({
  emit: vi.fn(),
}));
```

### Factory `makeFact()`
Create test facts with defaults:
```typescript
function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: "fact-1",
    category: "skill",
    value: "TypeScript",
    visibility: "public",
    ...overrides,
  };
}
```

### Hoisted mocks
When mocking modules that are imported at the top level, use `vi.hoisted()`:
```typescript
const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), insert: vi.fn(), /* ... */ },
}));
vi.mock("@/lib/db", () => ({ getDb: () => mockDb }));
```

### In-memory SQLite for integration tests
```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const sqlite = new Database(":memory:");
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "db/migrations" });
```

### Fake timers for time-sensitive tests
```typescript
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
```

## Naming Conventions

- Unit/integration tests: `tests/evals/{feature}.test.ts`
- E2E tests: `e2e/{feature}.spec.ts`
- Test file names match the feature/service they test

## Rules for Creating New Tests

1. **Place in `tests/evals/`** — all vitest tests go here
2. **Mock `event-service`** — unless you're specifically testing events
3. **Use `makeFact()` factories** — don't repeat test data construction
4. **Use in-memory SQLite** for integration tests that need a real DB
5. **Never import from `@/lib/db` directly** in unit tests — mock it
6. **Group with `describe` blocks** — one per major behavior
7. **Test the contract, not the implementation** — assert on outputs and side effects
8. **Include edge cases** — empty arrays, null values, boundary conditions
9. **Run `npx tsc --noEmit`** after writing tests to catch type errors

## Configuration Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest config (alias resolution for `@` paths) |
| `playwright.config.ts` | Playwright config (chromium, 4 workers, auto-starts dev server) |
| `tsconfig.json` | TypeScript config (path aliases) |

## Diagnosing Failures

1. **Read the error message carefully** — vitest gives clear diffs
2. **Check if mocks are stale** — after refactoring, mock shapes may need updating
3. **Check import paths** — `@/` alias maps to `src/`
4. **Check for async issues** — missing `await` is common
5. **Run the single failing test** with `npx vitest run tests/evals/{file}.test.ts` for isolation
6. **Check recent changes** with `git diff` to see what broke
