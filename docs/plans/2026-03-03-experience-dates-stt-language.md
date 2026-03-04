# Experience Facts Without Dates + STT Language Hint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Two fixes: (1) the agent must always save experience facts immediately even without dates, then ask for dates next; (2) the STT server fallback must pass the language hint end-to-end through to Whisper so proper nouns (e.g. "Cassa Depositi e Prestiti") are transcribed in the correct language model.

**Architecture:**
- Fix 1 is a prompt-only change in `src/lib/agent/prompts.ts` — no schema or DB changes needed. The experience schema already supports `start: null / end: null`.
- Fix 2 is a three-point pipe change: (a) the client hook appends `language` to the FormData it POSTs to `/api/transcribe`; (b) the Next.js proxy extracts and forwards it to the upstream Whisper server; (c) the Python STT server (`docker/stt/server.py`) is updated to accept `language` as an optional Form field and pass it to `model.transcribe(language=...)`.

**Tech Stack:** TypeScript, Next.js App Router, Python (FastAPI + faster-whisper), Vitest

---

## Context

### Why the agent drops the company name

`SAFETY_POLICY` in `prompts.ts:44` says:

```
Only create experience facts with dates when the user provides actual dates.
```

But the experience schema has `start` and `end` as strings that can be `null`. The LLM resolves the conflict conservatively: saves only `identity/role` (no date needed) and silently drops the company. Education avoids this trap because its schema note says "Create education facts even without dates". Experience needs the same explicit permission.

Note: activity schema has no date fields at all — the null-date fix applies only to **experience**.

### Why STT drops "Cassa Depositi e Prestiti" on mobile

On iOS Safari the Web Speech API is unreliable, so the system falls back to MediaRecorder + POST to `/api/transcribe`. The server proxies to Whisper, but the language hint never reaches the Whisper model:

- Client (`useSttProvider.ts:151`): sends FormData without `language`
- Next.js proxy (`route.ts:48-49`): does not extract or forward `language`
- Python server (`server.py:64`): endpoint signature is `transcribe(file: UploadFile = File(...))` — no `language` parameter; `model.transcribe()` is called without `language`, so Whisper auto-detects

All three points must be fixed. Fixing only the proxy is insufficient.

---

## Task 1: Prompt fix — experience facts without dates

### Files
- Modify: `src/lib/agent/prompts.ts:44` (SAFETY_POLICY)
- Modify: `src/lib/agent/prompts.ts:95` (FACT_SCHEMA_REFERENCE — experience row)
- Test: `tests/evals/prompt-contracts.test.ts`

### Step 1: Write the failing test

Add to `tests/evals/prompt-contracts.test.ts`:

```ts
it("experience facts must be created immediately even without dates", () => {
  // The old rule that prevented creating experience facts without dates must be gone
  expect(src).not.toMatch(/only create experience facts with dates/i);
  // The new rule must say facts are created with null start/end
  expect(src).toMatch(/experience.*without dates|without dates.*experience/i);
  expect(src).toMatch(/start.*null|null.*start/i);
});
```

Run: `npx vitest run tests/evals/prompt-contracts.test.ts`
Expected: **FAIL**

### Step 2: Edit SAFETY_POLICY

In `src/lib/agent/prompts.ts`, find the sentence inside `SAFETY_POLICY` const:

```
NEVER fabricate precise dates from approximate durations. If the user says "8 years of experience", store the duration as a stat fact (e.g., {label: "Years Experience", value: "8+"}). Do NOT invent start/end dates like "2015-01 – 2023-01". Only create experience facts with dates when the user provides actual dates. If dates are needed for display, ask the user.
```

Replace with:

```
NEVER fabricate precise dates from approximate durations. If the user says "8 years of experience", store the duration as a stat fact (e.g., {label: "Years Experience", value: "8+"}). Do NOT invent start/end dates like "2015-01 – 2023-01".
Always create experience facts immediately, even without dates — use start: null, end: null. NEVER skip or defer saving an experience fact just because the user did not provide dates. In your very next message, ask whether they remember the start (and end) date for that experience.
```

### Step 3: Edit FACT_SCHEMA_REFERENCE — experience row

In `src/lib/agent/prompts.ts`, find the experience row in the schema table (around line 95):

```
| experience | company-kebab | {role: "...", company: "...", start: "2020-03", end: "2023-06"|null, status: "current"|"past", type?: "employment"|"freelance"|"client"} | type: "employment" (default if omitted), "freelance", or "client". Use "client" for project clients (e.g. Barilla branding). Clients appear in Projects section. Use real dates like "2020-03", never placeholders like "YYYY-MM". |
```

Replace with:

```
| experience | company-kebab | {role: "...", company: "...", start: "2020-03"\|null, end: "2023-06"\|null, status: "current"\|"past", type?: "employment"\|"freelance"\|"client"} | Create experience facts even without dates — start/end can be null and added later. status is mandatory ("current" if still there, "past" otherwise). type: "employment" (default), "freelance", or "client". Real dates like "2020-03", never placeholders. |
```

### Step 4: Run the test

Run: `npx vitest run tests/evals/prompt-contracts.test.ts`
Expected: **PASS**

### Step 5: Run full prompt test suite

Run: `npx vitest run tests/evals/prompt-contracts.test.ts tests/evals/anti-fabrication-prompt.test.ts tests/evals/build-system-prompt.test.ts`
Expected: all **PASS**

### Step 6: Commit

```bash
git add src/lib/agent/prompts.ts tests/evals/prompt-contracts.test.ts
git commit -m "fix(agent): create experience facts immediately even without dates, ask dates next"
```

---

## Task 2: STT — pass language hint to server (client side)

### Files
- Modify: `src/hooks/useSttProvider.ts` (startServerFallback, around line 151; dependency array at line 209)
- Test: `tests/evals/voice-stt-provider.test.ts`

### Step 1: Write the failing test

Add to `tests/evals/voice-stt-provider.test.ts`:

```ts
it("server fallback appends language to FormData and language is in dependency array", async () => {
  const fs = await import("fs");
  const src = fs.readFileSync("src/hooks/useSttProvider.ts", "utf-8");

  // Must append language
  const serverFallbackBlock = src.slice(
    src.indexOf("startServerFallback"),
    src.indexOf("}, [onResult, onFinalResult])")
  );
  expect(serverFallbackBlock).toContain('formData.append("language"');

  // language must be in the dependency array to prevent stale closures
  expect(src).toMatch(/\[onResult,\s*onFinalResult,\s*language\]/);
});
```

Run: `npx vitest run tests/evals/voice-stt-provider.test.ts`
Expected: **FAIL**

### Step 2: Edit startServerFallback — append language

In `src/hooks/useSttProvider.ts`, find (around line 151-152):

```ts
const formData = new FormData();
formData.append("file", blob, "audio.webm");
```

Replace with:

```ts
const formData = new FormData();
formData.append("file", blob, "audio.webm");
if (language) formData.append("language", language);
```

### Step 3: Update useCallback dependency array

In `src/hooks/useSttProvider.ts`, find the closing of `startServerFallback` (around line 209):

```ts
}, [onResult, onFinalResult]);
```

Replace with:

```ts
}, [onResult, onFinalResult, language]);
```

This prevents the callback from using a stale language value after a language switch.

### Step 4: Run the test

Run: `npx vitest run tests/evals/voice-stt-provider.test.ts`
Expected: **PASS**

### Step 5: Commit

```bash
git add src/hooks/useSttProvider.ts tests/evals/voice-stt-provider.test.ts
git commit -m "fix(stt): pass language hint to server fallback transcription; fix stale closure"
```

---

## Task 3: STT — forward language hint through Next.js proxy

### Files
- Modify: `src/app/api/transcribe/route.ts` (around lines 47-50)
- Test: `tests/evals/voice-transcribe-route.test.ts`

### Step 1: Write the failing test

Add to `tests/evals/voice-transcribe-route.test.ts`:

```ts
it("language field is extracted from incoming form and forwarded to upstream", async () => {
  const fs = await import("fs");
  const src = fs.readFileSync("src/app/api/transcribe/route.ts", "utf-8");
  expect(src).toContain('formData.get("language")');
  expect(src).toContain('upstreamForm.append("language"');
});
```

Run: `npx vitest run tests/evals/voice-transcribe-route.test.ts`
Expected: **FAIL**

### Step 2: Edit the transcribe route

In `src/app/api/transcribe/route.ts`, find (around lines 47-50):

```ts
// Re-build FormData for upstream
const upstreamForm = new FormData();
upstreamForm.append("file", file, "audio.webm");
```

Replace with:

```ts
// Re-build FormData for upstream
const upstreamForm = new FormData();
upstreamForm.append("file", file, "audio.webm");
const language = formData.get("language");
if (typeof language === "string" && language.trim()) {
  upstreamForm.append("language", language.trim());
}
```

### Step 3: Run the test

Run: `npx vitest run tests/evals/voice-transcribe-route.test.ts`
Expected: **PASS**

### Step 4: Commit

```bash
git add src/app/api/transcribe/route.ts tests/evals/voice-transcribe-route.test.ts
git commit -m "fix(stt): forward language hint from Next.js proxy to Whisper server"
```

---

## Task 4: STT — update Python server to accept and use language hint

### Files
- Modify: `docker/stt/server.py` (endpoint at line 63-91)

Note: The `faster_whisper.WhisperModel.transcribe()` method accepts `language: Optional[str]` where the value is an ISO 639-1 code (e.g. "it", "en"). When provided, it skips auto-detection and uses the specified acoustic model directly.

### Step 1: Write the structural test

Add to `tests/evals/voice-transcribe-route.test.ts`:

```ts
it("Python STT server accepts language form field and passes it to model.transcribe", async () => {
  const fs = await import("fs");
  const py = fs.readFileSync("docker/stt/server.py", "utf-8");
  // Endpoint must accept a language Form parameter
  expect(py).toMatch(/language.*Form|Form.*language/);
  // model.transcribe must be called with language keyword argument
  expect(py).toContain("language=");
});
```

Run: `npx vitest run tests/evals/voice-transcribe-route.test.ts`
Expected: **FAIL**

### Step 2: Edit server.py — add Form import and Optional

In `docker/stt/server.py`, find:

```python
from fastapi import FastAPI, UploadFile, File, HTTPException
```

Replace with:

```python
from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from typing import Optional
```

### Step 3: Edit server.py — add allowlist and update endpoint signature

Find the endpoint (line 63-64):

```python
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
```

Replace with:

```python
# ISO 639-1 codes accepted by faster-whisper
_ALLOWED_LANGUAGES = {
    "af","ar","az","be","bg","bn","bo","br","bs","ca","cs","cy","da","de",
    "el","en","es","et","eu","fa","fi","fo","fr","gl","gu","ha","hi","hr",
    "ht","hu","hy","id","is","it","ja","jw","ka","kk","km","kn","ko","la",
    "lb","ln","lo","lt","lv","mg","mi","mk","ml","mn","mr","ms","mt","my",
    "ne","nl","nn","no","oc","pa","pl","ps","pt","ro","ru","sa","sd","si",
    "sk","sl","sn","so","sq","sr","su","sv","sw","ta","te","tg","th","tk",
    "tl","tr","tt","uk","ur","uz","vi","yi","yo","zh",
}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: Optional[str] = Form(None)):
```

### Step 4: Edit server.py — validate language and pass to transcribe

Find the `model.transcribe()` call:

```python
        segments, info = model.transcribe(
            tmp.name,
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 700},
            condition_on_previous_text=False,
        )
```

Replace with:

```python
        # Validate language hint against allowlist
        lang_hint = language.strip().lower() if language else None
        if lang_hint and lang_hint not in _ALLOWED_LANGUAGES:
            logger.warning(f"Unknown language hint '{lang_hint}', ignoring")
            lang_hint = None

        segments, info = model.transcribe(
            tmp.name,
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 700},
            condition_on_previous_text=False,
            language=lang_hint,
        )
```

### Step 5: Run all tests

Run: `npx vitest run tests/evals/voice-transcribe-route.test.ts tests/evals/voice-stt-provider.test.ts tests/evals/voice-manager.test.ts tests/evals/voice-integration.test.ts tests/evals/voice-abort-safety.test.ts tests/evals/voice-feature-flags.test.ts`
Expected: all **PASS**

### Step 6: Commit

```bash
git add docker/stt/server.py tests/evals/voice-transcribe-route.test.ts
git commit -m "fix(stt): accept language hint in Python server and pass to faster-whisper"
```

---

## Task 5: Final verification

```bash
npx vitest run
```

Expected: all tests pass (≥ 2196 + new tests added).

---

## Summary of changes

| File | Change |
|------|--------|
| `src/lib/agent/prompts.ts` | Remove date-gate on experience; add rule: create immediately with null dates, ask next turn. Scoped to experience only (not activity which has no date fields). |
| `src/lib/agent/prompts.ts` | Experience schema row: mark start/end as nullable, note matches education pattern |
| `src/hooks/useSttProvider.ts` | Append `language` to FormData in server fallback; add `language` to useCallback deps array |
| `src/app/api/transcribe/route.ts` | Extract `language` from incoming form, forward to Whisper upstream |
| `docker/stt/server.py` | Accept optional `language` Form field; validate against ISO 639-1 allowlist; pass to `model.transcribe(language=...)` |
| `tests/evals/prompt-contracts.test.ts` | New test: experience-without-dates rule |
| `tests/evals/voice-stt-provider.test.ts` | New test: language in FormData + in deps array |
| `tests/evals/voice-transcribe-route.test.ts` | New tests: language forwarded by proxy + consumed by Python server |
