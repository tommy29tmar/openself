# Chat Error UX Layer — Design Document

**Date:** 2026-03-13
**Status:** Implemented
**Scope:** ~280 lines across 7 files (+ 42 tests)

## Problem

Chat errors (AI provider down, timeout, rate limiting, budget exceeded, etc.) were shown raw to the user as a red banner. Users saw technical messages like "fetch failed", "429 Too Many Requests", or provider SDK error strings with no actionable guidance.

## Solution

Hybrid server-side classification + client-side L10N mapping:

1. **Server classifies errors** using `APICallError.isInstance()` (Symbol-based cross-package check) on AI SDK typed error hierarchy with string-matching fallback only for native fetch/abort errors
2. **Server returns structured JSON** with `{ code, requestId }` — both in pre-stream JSON responses and mid-stream via `getErrorMessage` callback (stringified JSON surviving double-encoding)
3. **Client maps code → localized message** via `getUiL10n()`. Zero regex on client. Specific codes get actionable messages; generic fallback includes requestId for support traceability
4. **Client consumes `error` state from `useChat`** via defense-in-depth `useEffect` (re-localizes on language change) + `onError` callback

## Multi-Model Challenge Summary

Design survived 2-round adversarial review (Gemini + Claude Agent + Claude), plus 2 rounds of code review by 5 specialist reviewers (server classifier, client-side, route integration, L10N quality, structural).

**What changed during design:**
- Dropped `[CODE]` prefix hack → JSON stringified contract in `getErrorMessage`
- Switched from string matching → `APICallError.isInstance()` (Symbol-based, cross-package safe)
- Fixed critical gap: `ChatPanel` must destructure `error` from `useChat` (mid-stream errors go to `setError()`, not `onError()`)
- Added requestId to generic error display
- Added L10N for Retry/Refresh buttons (were only IT/EN)

**What changed during code review:**
- Added 401/403 → `MODEL_NOT_CONFIGURED` (invalid API keys)
- Added Anthropic content filter message-based fallback (no structured `data.error.type`)
- Removed `"network"` from string matching (false-positive risk)
- Removed dead `SPECIFIC_ERROR_CODES` set (redundant with map lookup logic)
- Added structured `MESSAGE_LIMIT` code check before string matching fallback
- Added `type="button"` on 3 `LimitReachedUI` buttons
- Added `disabled={isLoading}` on Refresh chat button
- Fixed `BUDGET_EXCEEDED` → HTTP 429 in catch block (was 500)
- Fixed PT `chatRetry`: "Repetir" → "Tentar novamente"
- Added security invariant test (no API key/message/stack leak in response)
- Added UUID validation on `requestId` (prevents text injection in error banner)

**What was rejected:**
- StreamData channel for errors (unreliable after stream crash)
- Client-side fallback regex classifier (redundant)
- `useEffect` removal (kept as defense-in-depth — re-localizes on language change)

## Architecture

```
Server (route.ts)                          Client (ChatPanel.tsx)
┌─────────────────────┐                    ┌──────────────────────┐
│ classifyChatError()  │                    │ onError callback     │
│ isInstance() checks  │                    │ + useEffect defense  │
│ + statusCode map     │                    │                      │
│ + message fallback   │                    │ parseChatErrorJson() │
│                      │                    │ UUID-validated reqId │
│ Pre-stream: JSON     │───{code,reqId}───→│                      │
│ Mid-stream: JSON str │───"{code,reqId}"─→│ chatFriendlyError()  │
│ Catch: JSON + 429/500│───{code,reqId}───→│ code → L10N message  │
│                      │                    │ generic + Ref: reqId │
│ console.error(raw)   │                    │                      │
│ (always, for debug)  │                    │ Error banner:        │
│                      │                    │ role="alert" + a11y  │
│ No String(error)     │                    │ Retry + Refresh btns │
│ No warningMessage    │                    │ disabled={isLoading} │
└─────────────────────┘                    └──────────────────────┘
```

## Error Codes

| Code | Trigger | HTTP Status | User-actionable? |
|---|---|---|---|
| `AI_PROVIDER_UNAVAILABLE` | APICallError 5xx, ECONNREFUSED, fetch failed, ENOTFOUND, socket hang up | 500 | Wait and retry |
| `AI_RATE_LIMITED` | APICallError 429 | 429 | Wait and retry |
| `AI_TIMEOUT` | APICallError 408, AbortError, DOMException | 500 | Retry |
| `BUDGET_EXCEEDED` | Internal budget check, string "budget"/"monthly limit" | 429 | Contact admin |
| `MODEL_NOT_CONFIGURED` | LoadAPIKeyError, NoSuchModelError, APICallError 401/403 | 500 | Check setup |
| `CONTEXT_TOO_LONG` | APICallError 413 | 500 | Start new chat |
| `CONTENT_FILTERED` | Provider safety filter (`content_filter`, `content_policy_violation`, message "content policy") | 500 | Rephrase |
| `AI_NO_CONTENT` | NoContentGeneratedError | 500 | Generic + requestId |
| `CHAT_INTERNAL_ERROR` | Catch-all | 500 | Generic + requestId |

## Security

- `formatChatErrorResponse` returns only `{ code, requestId }` — no error messages, stack traces, URLs, or provider details
- `requestId` validated with UUID regex on client (prevents text injection in error banner)
- Pre-stream error responses removed `rateResult.reason` and `warningMessage` fields
- Catch block uses hardcoded `"Internal error"` string, not `String(error)`
- Security invariant enforced by test

## L10N Keys (10 new × 8 languages)

chatErrorGeneric, chatErrorProviderDown, chatErrorRateLimit, chatErrorTimeout,
chatErrorBudget, chatErrorModelConfig, chatErrorContextTooLong, chatErrorContentFiltered,
chatRetry, chatRefresh

## Files

| File | Action | Lines | Tests |
|---|---|---|---|
| `src/lib/services/chat-errors.ts` | NEW | 76 | 24 tests |
| `src/lib/i18n/error-messages.ts` | MODIFY | +30 | 18 tests |
| `src/lib/i18n/ui-strings.ts` | MODIFY | +80 (10 keys × 8 langs) | — |
| `src/app/api/chat/route.ts` | MODIFY | ~16 lines changed | — |
| `src/components/chat/ChatPanel.tsx` | MODIFY | ~28 lines changed | — |
| `tests/evals/chat-errors.test.ts` | NEW | 190 | — |
| `tests/evals/chat-error-messages.test.ts` | NEW | 94 | — |
