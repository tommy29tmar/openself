# Multi-Provider Tier Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the model tier system to support per-tier provider override via `provider:model` format in env vars, and deploy the recommended 3-model setup (gemini-2.0-flash / claude-sonnet-4-6 / gemini-2.5-pro) to Coolify.

**Architecture:** Parse optional `google:gemini-2.0-flash` prefix in `AI_MODEL_FAST/STANDARD/REASONING` env vars. If the prefix exactly matches a known provider (`google|openai|anthropic|ollama`), instantiate that provider's SDK regardless of `AI_PROVIDER`. Otherwise treat the whole value as a plain model ID (backward compat for `llama3.2:latest`, `ft:gpt-4:xxx`, etc.). Expose `getProviderForTier(tier)` for tier-accurate usage recording. Backward compatible — existing setups require zero changes.

**Tech Stack:** TypeScript, Vercel AI SDK (`@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic`), Vitest, Coolify API.

---

## Task 1: Refactor `provider.ts` — multi-provider parsing + expose `getProviderForTier`

**Files:**
- Modify: `src/lib/ai/provider.ts`
- Modify: `tests/evals/model-tiering.test.ts`

### Step 1: Write the failing tests

Update import at line 19 of `tests/evals/model-tiering.test.ts`:
```typescript
import { getModelForTier, getModelIdForTier, getProviderForTier } from "@/lib/ai/provider";
```

Add at bottom (before final `}`):
```typescript
describe("multi-provider tier routing", () => {
  it("AI_MODEL_FAST with known provider prefix returns model from that provider", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_MODEL_FAST = "google:gemini-2.0-flash";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    const model = getModelForTier("fast") as any;
    expect(model.modelId).toBe("gemini-2.0-flash");
    expect(model.provider).toBe("google");
  });

  it("AI_MODEL_STANDARD with known provider prefix overrides AI_PROVIDER", () => {
    process.env.AI_PROVIDER = "google";
    process.env.AI_MODEL_STANDARD = "anthropic:claude-sonnet-4-6";
    const model = getModelForTier("standard") as any;
    expect(model.modelId).toBe("claude-sonnet-4-6");
    expect(model.provider).toBe("anthropic");
  });

  it("getModelIdForTier strips known provider prefix", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_MODEL_FAST = "google:gemini-2.0-flash";
    expect(getModelIdForTier("fast")).toBe("gemini-2.0-flash");
  });

  it("backward compat: plain model id without prefix uses AI_PROVIDER", () => {
    process.env.AI_PROVIDER = "google";
    process.env.AI_MODEL_FAST = "gemini-2.0-flash-lite";
    const model = getModelForTier("fast") as any;
    expect(model.modelId).toBe("gemini-2.0-flash-lite");
    expect(model.provider).toBe("google");
  });

  it("backward compat: model id with unknown prefix (e.g. ollama tag) treated as plain id", () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.AI_MODEL_FAST = "llama3.2:latest";
    const model = getModelForTier("fast") as any;
    // unknown prefix → whole value is modelId, provider = AI_PROVIDER (ollama)
    expect(model.modelId).toBe("llama3.2:latest");
    expect(model.provider).toBe("ollama");
  });

  it("getProviderForTier returns overridden provider when known prefix is set", () => {
    process.env.AI_PROVIDER = "google";
    process.env.AI_MODEL_STANDARD = "anthropic:claude-sonnet-4-6";
    expect(getProviderForTier("standard")).toBe("anthropic");
  });

  it("getProviderForTier falls back to AI_PROVIDER without known prefix", () => {
    process.env.AI_PROVIDER = "anthropic";
    delete process.env.AI_MODEL_FAST;
    expect(getProviderForTier("fast")).toBe("anthropic");
  });

  it("throws only when known provider prefix is followed by empty model id", () => {
    process.env.AI_MODEL_FAST = "google:";
    expect(() => getModelForTier("fast")).toThrow(/empty model-id/);
  });

  it("does NOT throw on unknown prefix (treats as plain id)", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL_FAST = "ft:gpt-4:my-fine-tune";
    expect(() => getModelForTier("fast")).not.toThrow();
  });
});
```

### Step 2: Run test to verify it fails
```bash
npx vitest run tests/evals/model-tiering.test.ts --reporter=verbose 2>&1 | tail -30
```
Expected: FAIL.

### Step 3: Implement in `provider.ts`

**A) Add after `TIER_ENV_KEYS` constant:**
```typescript
interface ModelSpec {
  provider: Provider | null;
  modelId: string;
}

/**
 * Parses "provider:model-id" or bare "model-id".
 * A known provider prefix (google|openai|anthropic|ollama) triggers cross-provider dispatch.
 * Unknown prefix (e.g. "llama3.2:latest", "ft:gpt-4:xxx") → plain model id, uses AI_PROVIDER.
 * Throws only when a KNOWN provider prefix is found but model-id is empty.
 */
function parseTierEnvValue(val: string): ModelSpec {
  const colonIdx = val.indexOf(":");
  if (colonIdx === -1) return { provider: null, modelId: val };
  const prefix = val.slice(0, colonIdx);
  const id = val.slice(colonIdx + 1);
  const valid: Provider[] = ["google", "openai", "anthropic", "ollama"];
  if (!valid.includes(prefix as Provider)) {
    // Not a provider prefix → treat full value as model id (e.g. llama3.2:latest, ft:gpt-4:xxx)
    return { provider: null, modelId: val };
  }
  if (!id) {
    throw new Error(
      `Invalid AI_MODEL_* value "${val}": known provider prefix "${prefix}" has empty model-id after ":".`
    );
  }
  return { provider: prefix as Provider, modelId: id };
}

function resolveModelSpecForTier(resolved: ModelTier): ModelSpec {
  for (const envKey of TIER_ENV_KEYS[resolved]) {
    const val = process.env[envKey];
    if (val) return parseTierEnvValue(val);
  }
  const globalOverride = process.env.AI_MODEL;
  if (globalOverride) return { provider: null, modelId: globalOverride };
  const provider = getProvider();
  return { provider, modelId: TIER_MODEL_TABLES[resolved][provider] };
}
```

**B) Add `buildModel` helper (before the exported functions):**
```typescript
function buildModel(provider: Provider, modelId: string): LanguageModel {
  switch (provider) {
    case "google": {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
      return createGoogleGenerativeAI({ apiKey })(modelId);
    }
    case "openai":
      return openai(modelId);
    case "anthropic":
      return anthropic(modelId);
    case "ollama": {
      const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
      return createOpenAI({ baseURL, apiKey: "ollama" })(modelId);
    }
  }
}
```

**C) Replace `resolveModelIdForTier`:**
```typescript
function resolveModelIdForTier(resolved: ModelTier): string {
  return resolveModelSpecForTier(resolved).modelId;
}
```

**D) Replace `getModelForTier`:**
```typescript
export function getModelForTier(tier: ModelTier | LegacyModelTier): LanguageModel {
  const resolved = resolveTier(tier);
  const { provider: specProvider, modelId } = resolveModelSpecForTier(resolved);
  return buildModel(specProvider ?? getProvider(), modelId);
}
```

**E) Add new export `getProviderForTier` (after `getModelForTier`):**
```typescript
/** Returns the effective provider for a tier, respecting provider:model prefix overrides. */
export function getProviderForTier(tier: ModelTier | LegacyModelTier): string {
  const resolved = resolveTier(tier);
  const { provider: specProvider } = resolveModelSpecForTier(resolved);
  return specProvider ?? getProvider();
}
```

**F) Replace `getModel()` to use `buildModel`:**
```typescript
export function getModel(): LanguageModel {
  const provider = getProvider();
  const modelId = process.env.AI_MODEL ?? DEFAULT_MODELS[provider];
  return buildModel(provider, modelId);
}
```

### Step 4: Run tests
```bash
npx vitest run tests/evals/model-tiering.test.ts tests/evals/provider-tiers.test.ts --reporter=verbose 2>&1 | tail -40
```
Expected: all PASS.

### Step 5: Commit
```bash
git add src/lib/ai/provider.ts tests/evals/model-tiering.test.ts
git commit -m "feat(ai): multi-provider tier routing via provider:model env format"
```

---

## Task 2: Fix usage recording + update all affected provider mocks

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/services/summary-service.ts`
- Modify: `tests/evals/chat-route-bootstrap.test.ts`
- Modify: `tests/evals/chat-route-import-flag.test.ts`
- Modify: `tests/evals/chat-context-integration.test.ts`
- Modify: `tests/evals/journal-summary.test.ts`

### Step 1: Update `chat/route.ts`

Add `getProviderForTier` to the import line at top (keep `getProviderName` for existing usages).
Replace `const provider = getProviderName();` (~line 299) with:
```typescript
const provider = getProviderForTier("standard");
```

### Step 2: Update `summary-service.ts`

Add `getProviderForTier` to import. Replace:
```typescript
recordUsage(getProviderName(), modelId, tokensIn, tokensOut);
```
with:
```typescript
recordUsage(getProviderForTier("standard"), modelId, tokensIn, tokensOut);
```

### Step 3: Add `getProviderForTier` mock to all 4 test files

For each file, add to the `vi.mock("@/lib/ai/provider", ...)` factory:
```typescript
getProviderForTier: vi.fn(() => "mock-provider"),
```

Files:
- `tests/evals/chat-route-bootstrap.test.ts`
- `tests/evals/chat-route-import-flag.test.ts`
- `tests/evals/chat-context-integration.test.ts`
- `tests/evals/journal-summary.test.ts`

### Step 4: Run affected tests
```bash
npx vitest run \
  tests/evals/journal-summary.test.ts \
  tests/evals/chat-route-bootstrap.test.ts \
  tests/evals/chat-route-import-flag.test.ts \
  tests/evals/chat-context-integration.test.ts \
  --reporter=verbose 2>&1 | tail -40
```
Expected: PASS.

### Step 5: Run full test suite
```bash
npx vitest run 2>&1 | tail -20
```
Expected: no regressions.

### Step 6: Commit
```bash
git add \
  src/app/api/chat/route.ts \
  src/lib/services/summary-service.ts \
  tests/evals/chat-route-bootstrap.test.ts \
  tests/evals/chat-route-import-flag.test.ts \
  tests/evals/chat-context-integration.test.ts \
  tests/evals/journal-summary.test.ts
git commit -m "fix(ai): use tier-aware provider in usage recording, update test mocks"
```

---

## Task 3: Update `.env.example`

**Files:** Modify `.env.example`

### Step 1: Add after the existing LLM Provider block:
```
# === Multi-provider tier routing (recommended for production) ===
# Format: AI_MODEL_<TIER>=<provider>:<model-id>
# Recognized provider prefixes: google, openai, anthropic, ollama.
# Unknown prefix (e.g. "llama3.2:latest") is treated as plain model-id using AI_PROVIDER.
#
# Recommended setup (Anthropic + Google):
# AI_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_GENERATIVE_AI_API_KEY=AIza...
#
# AI_MODEL_FAST=google:gemini-2.0-flash          # $0.075/M input — translation, schema
# AI_MODEL_STANDARD=anthropic:claude-sonnet-4-6  # $3/M input    — chat (user-facing)
# AI_MODEL_REASONING=google:gemini-2.5-pro       # $1.25/M input — conformity analysis
```

### Step 2: Commit
```bash
git add .env.example
git commit -m "docs(env): document multi-provider tier routing with recommended 3-model setup"
```

---

## Task 4: Push to remote

```bash
git push origin main
```
Expected: all commits pushed. If protected branch, open PR before Coolify deploy.

---

## Task 5: Configure Coolify — upsert env vars on both apps

**Context:**
- Coolify: `$COOLIFY_BASE_URL` (http://89.167.111.236:8000)
- Web UUID: `cokksgw48goscs8okgk48okw` | Worker UUID: `y4o0k84wcko0co0c0gcw84ws`
- Auth: `$COOLIFY_API_TOKEN`

> **Prerequisite:** Have `GOOGLE_GENERATIVE_AI_API_KEY` ready (Google AI Studio: https://aistudio.google.com/app/apikey).

### Step 1: List current env keys on BOTH apps

```bash
for UUID in cokksgw48goscs8okgk48okw y4o0k84wcko0co0c0gcw84ws; do
  echo "=== $UUID ==="
  curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
    "$COOLIFY_BASE_URL/api/v1/applications/$UUID/envs" \
    | jq '[.[] | {uuid: .uuid, key: .key, is_secret: .is_secret}]'
done
```
Note whether `ANTHROPIC_API_KEY` is present on EACH app. It must be set on both (web uses it for chat, worker uses it for summaries).

### Step 2: Define upsert helper

```bash
upsert_env() {
  local APP_UUID="$1" KEY="$2" VALUE="$3" IS_SECRET="$4"
  local EXISTING_UUID
  EXISTING_UUID=$(curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
    "$COOLIFY_BASE_URL/api/v1/applications/$APP_UUID/envs" \
    | jq -r --arg k "$KEY" '.[] | select(.key == $k) | .uuid')
  if [ -n "$EXISTING_UUID" ]; then
    curl -s -X PATCH \
      -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
      -H "Content-Type: application/json" \
      "$COOLIFY_BASE_URL/api/v1/applications/$APP_UUID/envs/$EXISTING_UUID" \
      -d "{\"key\":\"$KEY\",\"value\":\"$VALUE\",\"is_secret\":$IS_SECRET}"
  else
    curl -s -X POST \
      -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
      -H "Content-Type: application/json" \
      "$COOLIFY_BASE_URL/api/v1/applications/$APP_UUID/envs" \
      -d "{\"key\":\"$KEY\",\"value\":\"$VALUE\",\"is_secret\":$IS_SECRET}"
  fi
  echo " ← $KEY on $APP_UUID"
}
```

### Step 3: Upsert on web app

```bash
# Verify/add ANTHROPIC_API_KEY on web (if absent from Step 1)
upsert_env cokksgw48goscs8okgk48okw ANTHROPIC_API_KEY "YOUR_ANTHROPIC_KEY" true

# Google API key (secret=true)
upsert_env cokksgw48goscs8okgk48okw GOOGLE_GENERATIVE_AI_API_KEY "YOUR_GOOGLE_KEY" true

# Model tier vars (not secret)
upsert_env cokksgw48goscs8okgk48okw AI_MODEL_FAST "google:gemini-2.0-flash" false
upsert_env cokksgw48goscs8okgk48okw AI_MODEL_STANDARD "anthropic:claude-sonnet-4-6" false
upsert_env cokksgw48goscs8okgk48okw AI_MODEL_REASONING "google:gemini-2.5-pro" false
```

### Step 4: Upsert same vars on worker app

```bash
upsert_env y4o0k84wcko0co0c0gcw84ws ANTHROPIC_API_KEY "YOUR_ANTHROPIC_KEY" true
upsert_env y4o0k84wcko0co0c0gcw84ws GOOGLE_GENERATIVE_AI_API_KEY "YOUR_GOOGLE_KEY" true
upsert_env y4o0k84wcko0co0c0gcw84ws AI_MODEL_FAST "google:gemini-2.0-flash" false
upsert_env y4o0k84wcko0co0c0gcw84ws AI_MODEL_STANDARD "anthropic:claude-sonnet-4-6" false
upsert_env y4o0k84wcko0co0c0gcw84ws AI_MODEL_REASONING "google:gemini-2.5-pro" false
```

### Step 5: Verify keys set on both apps (key presence only — no values printed)

```bash
for UUID in cokksgw48goscs8okgk48okw y4o0k84wcko0co0c0gcw84ws; do
  echo "=== $UUID ==="
  curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
    "$COOLIFY_BASE_URL/api/v1/applications/$UUID/envs" \
    | jq '[.[] | select(.key | test("AI_MODEL|GOOGLE_GENERATIVE|ANTHROPIC_API")) | {key:.key, is_secret:.is_secret}]'
done
```
Expected: 5 keys each, API keys have `is_secret: true`.

---

## Task 6: Deploy both apps and verify

### Step 1: Trigger web deploy
```bash
WEB_DEPLOY=$(curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/api/v1/deploy?uuid=cokksgw48goscs8okgk48okw&force=false")
WEB_DEPLOY_UUID=$(echo "$WEB_DEPLOY" | jq -r '.deployments[0].deployment_uuid')
echo "Web deploy: $WEB_DEPLOY_UUID"
```

### Step 2: Trigger worker deploy
```bash
WORKER_DEPLOY=$(curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/api/v1/deploy?uuid=y4o0k84wcko0co0c0gcw84ws&force=false")
WORKER_DEPLOY_UUID=$(echo "$WORKER_DEPLOY" | jq -r '.deployments[0].deployment_uuid')
echo "Worker deploy: $WORKER_DEPLOY_UUID"
```

### Step 3: Poll web deployment until finished (with timeout guard)
```bash
WEB_DONE=false
for i in $(seq 1 30); do
  STATUS=$(curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
    "$COOLIFY_BASE_URL/api/v1/deployments/$WEB_DEPLOY_UUID" | jq -r '.status')
  echo "[$i/30] web: $STATUS"
  if [ "$STATUS" = "finished" ]; then WEB_DONE=true; echo "Web deploy DONE"; break; fi
  if [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; then echo "Web deploy FAILED"; exit 1; fi
  sleep 10
done
if [ "$WEB_DONE" = "false" ]; then echo "Web deploy TIMED OUT after 5 minutes"; exit 1; fi
```

### Step 4: Poll worker deployment (same pattern)
Same as Step 3 but with `$WORKER_DEPLOY_UUID`. Fails with exit 1 on timeout or error.

### Step 5: Smoke tests (only after both deploys confirmed finished)
```bash
# Homepage returns 200
curl -s -o /dev/null -w "homepage: %{http_code}\n" https://openself.dev/

# Bootstrap endpoint exists (401 = auth expected, NOT 500)
curl -s -o /dev/null -w "bootstrap: %{http_code}\n" https://openself.dev/api/chat/bootstrap
```
Expected: `homepage: 200`, `bootstrap: 200` or `bootstrap: 401`.

---

## Summary

| Tier | Model | Provider | Use case |
|---|---|---|---|
| fast | gemini-2.0-flash | Google | translation, schema, coherence |
| standard | claude-sonnet-4-6 | Anthropic | chat, summaries |
| reasoning | gemini-2.5-pro | Google | conformity analysis, rewrite |

**Files changed:**
- `src/lib/ai/provider.ts` — multi-provider parsing, `getProviderForTier`, `buildModel` helper
- `tests/evals/model-tiering.test.ts` — provider routing + backward compat tests
- `src/app/api/chat/route.ts` — tier-aware provider in usage recording
- `src/lib/services/summary-service.ts` — tier-aware provider in usage recording
- `tests/evals/chat-route-bootstrap.test.ts` — add `getProviderForTier` mock
- `tests/evals/chat-route-import-flag.test.ts` — add `getProviderForTier` mock
- `tests/evals/chat-context-integration.test.ts` — add `getProviderForTier` mock
- `tests/evals/journal-summary.test.ts` — add `getProviderForTier` mock
- `.env.example` — document multi-provider setup
