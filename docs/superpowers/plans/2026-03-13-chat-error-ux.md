# Chat Error UX Layer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw technical error messages in the chat with user-friendly, localized messages — keeping original errors in server logs for debugging.

**Architecture:** Server classifies errors using AI SDK typed error hierarchy (`APICallError.isInstance()` etc.) and returns structured JSON `{ code, requestId }`. Client maps code to localized message via `getUiL10n()`. Client also consumes `error` state from `useChat` to catch mid-stream errors (currently invisible). Pre-stream early returns (budget, rate limit) unified with `code` field.

**Tech Stack:** TypeScript, Vercel AI SDK (`@ai-sdk/provider` error types), React (`useChat`), existing L10N system (`ui-strings.ts`)

**Design doc:** `docs/plans/2026-03-13-chat-error-ux-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/services/chat-errors.ts` | CREATE | Error classifier (`classifyChatError`) + type (`ChatErrorCode`) |
| `tests/evals/chat-errors.test.ts` | CREATE | Unit tests for error classification |
| `src/lib/i18n/ui-strings.ts` | MODIFY | Add 10 L10N keys × 8 languages |
| `src/lib/i18n/error-messages.ts` | MODIFY | Add `chatFriendlyError()` + `parseChatErrorJson()` |
| `tests/evals/chat-error-messages.test.ts` | CREATE | Unit tests for client-side error mapping |
| `src/app/api/chat/route.ts` | MODIFY | Wire classifier into `getErrorMessage` + catch block + budget/rate-limit early returns |
| `src/components/chat/ChatPanel.tsx` | MODIFY | Consume `error` from `useChat`, use `chatFriendlyError()`, L10N buttons |

---

## Chunk 1: Server-side error classifier

### Task 1: Create `classifyChatError` with tests (TDD)

**Files:**
- Create: `src/lib/services/chat-errors.ts`
- Create: `tests/evals/chat-errors.test.ts`

- [ ] **Step 1: Write failing tests for error classification**

Create `tests/evals/chat-errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyChatError, formatChatErrorResponse, type ChatErrorCode } from "@/lib/services/chat-errors";

// Mock AI SDK error classes for testing (they use Symbol-based isInstance)
import { APICallError, LoadAPIKeyError, NoSuchModelError, NoContentGeneratedError } from "@ai-sdk/provider";

describe("classifyChatError", () => {
  // --- AI SDK typed errors ---
  it("classifies APICallError with 429 as AI_RATE_LIMITED", () => {
    const err = new APICallError({
      message: "Rate limit exceeded",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 429,
    });
    expect(classifyChatError(err)).toBe("AI_RATE_LIMITED" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 408 as AI_TIMEOUT", () => {
    const err = new APICallError({
      message: "Request timeout",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 408,
    });
    expect(classifyChatError(err)).toBe("AI_TIMEOUT" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 413 as CONTEXT_TOO_LONG", () => {
    const err = new APICallError({
      message: "Request too large",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 413,
    });
    expect(classifyChatError(err)).toBe("CONTEXT_TOO_LONG" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 500 as AI_PROVIDER_UNAVAILABLE", () => {
    const err = new APICallError({
      message: "Internal server error",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 500,
    });
    expect(classifyChatError(err)).toBe("AI_PROVIDER_UNAVAILABLE" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 503 as AI_PROVIDER_UNAVAILABLE", () => {
    const err = new APICallError({
      message: "Service unavailable",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 503,
    });
    expect(classifyChatError(err)).toBe("AI_PROVIDER_UNAVAILABLE" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 400 and content_filter as CONTENT_FILTERED", () => {
    const err = new APICallError({
      message: "Content filter triggered",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 400,
      data: { error: { type: "content_filter" } },
    });
    expect(classifyChatError(err)).toBe("CONTENT_FILTERED" satisfies ChatErrorCode);
  });

  it("classifies APICallError with unknown 400 as CHAT_INTERNAL_ERROR", () => {
    const err = new APICallError({
      message: "Bad request",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 400,
    });
    expect(classifyChatError(err)).toBe("CHAT_INTERNAL_ERROR" satisfies ChatErrorCode);
  });

  it("classifies LoadAPIKeyError as MODEL_NOT_CONFIGURED", () => {
    const err = new LoadAPIKeyError({ message: "API key missing" });
    expect(classifyChatError(err)).toBe("MODEL_NOT_CONFIGURED" satisfies ChatErrorCode);
  });

  it("classifies NoSuchModelError as MODEL_NOT_CONFIGURED", () => {
    const err = new NoSuchModelError({
      modelId: "gpt-nonexistent",
      modelType: "languageModel",
    });
    expect(classifyChatError(err)).toBe("MODEL_NOT_CONFIGURED" satisfies ChatErrorCode);
  });

  it("classifies NoContentGeneratedError as AI_NO_CONTENT", () => {
    const err = new NoContentGeneratedError();
    expect(classifyChatError(err)).toBe("AI_NO_CONTENT" satisfies ChatErrorCode);
  });

  // --- Native JS errors (string matching fallback) ---
  it("classifies fetch failed as AI_PROVIDER_UNAVAILABLE", () => {
    expect(classifyChatError(new TypeError("fetch failed"))).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("classifies ECONNREFUSED as AI_PROVIDER_UNAVAILABLE", () => {
    expect(classifyChatError(new Error("connect ECONNREFUSED 127.0.0.1:11434"))).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("classifies AbortError as AI_TIMEOUT", () => {
    const err = new DOMException("The operation was aborted", "AbortError");
    expect(classifyChatError(err)).toBe("AI_TIMEOUT");
  });

  it("classifies timeout string as AI_TIMEOUT", () => {
    expect(classifyChatError(new Error("Request timeout after 30000ms"))).toBe("AI_TIMEOUT");
  });

  it("classifies budget exceeded as BUDGET_EXCEEDED", () => {
    expect(classifyChatError(new Error("Monthly budget exceeded"))).toBe("BUDGET_EXCEEDED");
  });

  it("classifies unknown error as CHAT_INTERNAL_ERROR", () => {
    expect(classifyChatError(new Error("Something unexpected"))).toBe("CHAT_INTERNAL_ERROR");
  });

  it("classifies non-Error values as CHAT_INTERNAL_ERROR", () => {
    expect(classifyChatError("string error")).toBe("CHAT_INTERNAL_ERROR");
    expect(classifyChatError(42)).toBe("CHAT_INTERNAL_ERROR");
    expect(classifyChatError(null)).toBe("CHAT_INTERNAL_ERROR");
  });

  // --- formatChatErrorResponse ---
  describe("formatChatErrorResponse", () => {
    it("returns JSON with code and requestId", () => {
      const result = formatChatErrorResponse(new Error("test"), "req-123");
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("code");
      expect(parsed).toHaveProperty("requestId", "req-123");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/chat-errors.test.ts`
Expected: FAIL — module `@/lib/services/chat-errors` not found

- [ ] **Step 3: Implement `classifyChatError`**

Create `src/lib/services/chat-errors.ts`:

```typescript
import { APICallError, LoadAPIKeyError, NoSuchModelError, NoContentGeneratedError } from "@ai-sdk/provider";

/**
 * Structured error codes for chat errors.
 * Server classifies, client maps to L10N messages.
 */
export type ChatErrorCode =
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "BUDGET_EXCEEDED"
  | "MODEL_NOT_CONFIGURED"
  | "CONTEXT_TOO_LONG"
  | "CONTENT_FILTERED"
  | "AI_NO_CONTENT"
  | "CHAT_INTERNAL_ERROR";

/**
 * Classify a chat error into a structured code.
 * Priority: AI SDK typed errors (most reliable) → string matching fallback (native fetch/abort only).
 */
export function classifyChatError(error: unknown): ChatErrorCode {
  // AI SDK typed errors — structured, reliable
  if (APICallError.isInstance(error)) {
    const { statusCode } = error;
    if (statusCode === 429) return "AI_RATE_LIMITED";
    if (statusCode === 408) return "AI_TIMEOUT";
    if (statusCode === 413) return "CONTEXT_TOO_LONG";
    if (statusCode != null && statusCode >= 500) return "AI_PROVIDER_UNAVAILABLE";
    // Check for content filter in error data (provider-specific)
    const data = error.data as Record<string, unknown> | undefined;
    const errType = (data?.error as Record<string, unknown>)?.type;
    if (errType === "content_filter" || errType === "content_policy_violation") {
      return "CONTENT_FILTERED";
    }
    return "CHAT_INTERNAL_ERROR";
  }
  if (LoadAPIKeyError.isInstance(error)) return "MODEL_NOT_CONFIGURED";
  if (NoSuchModelError.isInstance(error)) return "MODEL_NOT_CONFIGURED";
  if (NoContentGeneratedError.isInstance(error)) return "AI_NO_CONTENT";

  // String matching fallback — only for native JS errors (fetch, AbortError, etc.)
  const msg = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  if (msg.includes("budget") || msg.includes("monthly limit")) return "BUDGET_EXCEEDED";
  if (msg.includes("timeout") || msg.includes("aborted") || msg.includes("aborterror") ||
      (error instanceof DOMException && error.name === "AbortError")) return "AI_TIMEOUT";
  if (msg.includes("econnrefused") || msg.includes("fetch failed") || msg.includes("enotfound") ||
      msg.includes("network") || msg.includes("socket hang up")) return "AI_PROVIDER_UNAVAILABLE";

  return "CHAT_INTERNAL_ERROR";
}

/**
 * Format a chat error as a JSON string for stream error responses.
 * Includes the classified code and requestId for client-side mapping.
 */
export function formatChatErrorResponse(error: unknown, requestId: string): string {
  const code = classifyChatError(error);
  return JSON.stringify({ code, requestId });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/chat-errors.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/chat-errors.ts tests/evals/chat-errors.test.ts
git commit -m "feat: add chat error classifier with AI SDK typed error support"
```

---

## Chunk 2: L10N keys + client-side error mapping

### Task 2: Add L10N keys to `ui-strings.ts`

**Files:**
- Modify: `src/lib/i18n/ui-strings.ts`

- [ ] **Step 1: Add 10 new keys to the `UiStrings` interface**

In `src/lib/i18n/ui-strings.ts`, add after `activitySeverity: string;` (line 174):

```typescript
  // Chat errors
  chatErrorGeneric: string;
  chatErrorProviderDown: string;
  chatErrorRateLimit: string;
  chatErrorTimeout: string;
  chatErrorBudget: string;
  chatErrorModelConfig: string;
  chatErrorContextTooLong: string;
  chatErrorContentFiltered: string;
  chatRetry: string;
  chatRefresh: string;
```

- [ ] **Step 2: Add EN values**

In the `en` object, after `activitySeverity: "Severity",` (line 308):

```typescript
  chatErrorGeneric: "Something went wrong. Please try again.",
  chatErrorProviderDown: "The AI service is temporarily unavailable. Please try again shortly.",
  chatErrorRateLimit: "Too many requests — please wait a moment and try again.",
  chatErrorTimeout: "The response took too long. Please try again.",
  chatErrorBudget: "Monthly usage limit reached.",
  chatErrorModelConfig: "AI configuration issue. Please check your setup.",
  chatErrorContextTooLong: "The conversation is too long. Try starting a new chat.",
  chatErrorContentFiltered: "The message could not be processed. Try rephrasing.",
  chatRetry: "Retry",
  chatRefresh: "Refresh chat",
```

- [ ] **Step 3: Add IT values**

In the `it` object, after `activitySeverity: "Gravità",` (line 442):

```typescript
  chatErrorGeneric: "Qualcosa è andato storto. Riprova.",
  chatErrorProviderDown: "Il servizio AI non è al momento disponibile. Riprova tra poco.",
  chatErrorRateLimit: "Troppe richieste — attendi un momento e riprova.",
  chatErrorTimeout: "La risposta ha impiegato troppo. Riprova.",
  chatErrorBudget: "Limite di utilizzo mensile raggiunto.",
  chatErrorModelConfig: "Problema di configurazione AI. Verifica la configurazione.",
  chatErrorContextTooLong: "La conversazione è troppo lunga. Prova ad avviarne una nuova.",
  chatErrorContentFiltered: "Il messaggio non è stato elaborato. Prova a riformulare.",
  chatRetry: "Riprova",
  chatRefresh: "Aggiorna chat",
```

- [ ] **Step 4: Add DE values**

In the `de` object, after `activitySeverity: "Schweregrad",` (line 576):

```typescript
  chatErrorGeneric: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  chatErrorProviderDown: "Der KI-Dienst ist vorübergehend nicht verfügbar. Bitte versuche es gleich noch einmal.",
  chatErrorRateLimit: "Zu viele Anfragen — bitte warte einen Moment und versuche es erneut.",
  chatErrorTimeout: "Die Antwort hat zu lange gedauert. Bitte versuche es erneut.",
  chatErrorBudget: "Monatliches Nutzungslimit erreicht.",
  chatErrorModelConfig: "KI-Konfigurationsproblem. Bitte überprüfe die Einstellungen.",
  chatErrorContextTooLong: "Die Unterhaltung ist zu lang. Versuche einen neuen Chat zu starten.",
  chatErrorContentFiltered: "Die Nachricht konnte nicht verarbeitet werden. Versuche sie umzuformulieren.",
  chatRetry: "Erneut versuchen",
  chatRefresh: "Chat aktualisieren",
```

- [ ] **Step 5: Add FR values**

In the `fr` object, after `activitySeverity: "Gravité",` (line 710):

```typescript
  chatErrorGeneric: "Quelque chose s'est mal passé. Veuillez réessayer.",
  chatErrorProviderDown: "Le service IA est temporairement indisponible. Réessayez dans un instant.",
  chatErrorRateLimit: "Trop de requêtes — veuillez patienter un moment et réessayer.",
  chatErrorTimeout: "La réponse a pris trop de temps. Veuillez réessayer.",
  chatErrorBudget: "Limite d'utilisation mensuelle atteinte.",
  chatErrorModelConfig: "Problème de configuration IA. Vérifiez votre configuration.",
  chatErrorContextTooLong: "La conversation est trop longue. Essayez d'en démarrer une nouvelle.",
  chatErrorContentFiltered: "Le message n'a pas pu être traité. Essayez de le reformuler.",
  chatRetry: "Réessayer",
  chatRefresh: "Actualiser le chat",
```

- [ ] **Step 6: Add ES values**

In the `es` object, after `activitySeverity: "Gravedad",` (line 844):

```typescript
  chatErrorGeneric: "Algo salió mal. Inténtalo de nuevo.",
  chatErrorProviderDown: "El servicio de IA no está disponible temporalmente. Inténtalo en un momento.",
  chatErrorRateLimit: "Demasiadas solicitudes — espera un momento e inténtalo de nuevo.",
  chatErrorTimeout: "La respuesta tardó demasiado. Inténtalo de nuevo.",
  chatErrorBudget: "Límite de uso mensual alcanzado.",
  chatErrorModelConfig: "Problema de configuración de IA. Revisa tu configuración.",
  chatErrorContextTooLong: "La conversación es demasiado larga. Intenta iniciar un nuevo chat.",
  chatErrorContentFiltered: "El mensaje no pudo procesarse. Intenta reformularlo.",
  chatRetry: "Reintentar",
  chatRefresh: "Actualizar chat",
```

- [ ] **Step 7: Add PT values**

In the `pt` object, after `activitySeverity: "Gravidade",` (line 978):

```typescript
  chatErrorGeneric: "Algo correu mal. Tente novamente.",
  chatErrorProviderDown: "O serviço de IA está temporariamente indisponível. Tente novamente em breve.",
  chatErrorRateLimit: "Muitos pedidos — aguarde um momento e tente novamente.",
  chatErrorTimeout: "A resposta demorou demais. Tente novamente.",
  chatErrorBudget: "Limite de utilização mensal atingido.",
  chatErrorModelConfig: "Problema de configuração de IA. Verifique a configuração.",
  chatErrorContextTooLong: "A conversa é muito longa. Tente iniciar um novo chat.",
  chatErrorContentFiltered: "A mensagem não pôde ser processada. Tente reformular.",
  chatRetry: "Tentar novamente",
  chatRefresh: "Atualizar chat",
```

- [ ] **Step 8: Add JA values**

In the `ja` object, after `activitySeverity: "重要度",` (line 1112):

```typescript
  chatErrorGeneric: "エラーが発生しました。もう一度お試しください。",
  chatErrorProviderDown: "AIサービスが一時的に利用できません。しばらくしてから再度お試しください。",
  chatErrorRateLimit: "リクエストが多すぎます。少し待ってからもう一度お試しください。",
  chatErrorTimeout: "応答に時間がかかりすぎました。もう一度お試しください。",
  chatErrorBudget: "月間利用上限に達しました。",
  chatErrorModelConfig: "AI設定に問題があります。設定を確認してください。",
  chatErrorContextTooLong: "会話が長すぎます。新しいチャットを開始してください。",
  chatErrorContentFiltered: "メッセージを処理できませんでした。言い換えてお試しください。",
  chatRetry: "再試行",
  chatRefresh: "チャットを更新",
```

- [ ] **Step 9: Add ZH values**

In the `zh` object, after `activitySeverity: "严重程度",` (line 1246):

```typescript
  chatErrorGeneric: "出现错误，请重试。",
  chatErrorProviderDown: "AI服务暂时不可用，请稍后重试。",
  chatErrorRateLimit: "请求过多——请稍等片刻后重试。",
  chatErrorTimeout: "响应时间过长，请重试。",
  chatErrorBudget: "已达到月度使用限额。",
  chatErrorModelConfig: "AI配置问题，请检查您的设置。",
  chatErrorContextTooLong: "对话过长，请尝试开始新的聊天。",
  chatErrorContentFiltered: "无法处理该消息，请尝试改写。",
  chatRetry: "重试",
  chatRefresh: "刷新聊天",
```

- [ ] **Step 10: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors (all 8 language objects satisfy `UiStrings` interface)

- [ ] **Step 11: Commit**

```bash
git add src/lib/i18n/ui-strings.ts
git commit -m "feat: add chat error L10N keys (10 keys × 8 languages)"
```

### Task 3: Add `chatFriendlyError` and `parseChatErrorJson` with tests

**Files:**
- Modify: `src/lib/i18n/error-messages.ts`
- Create: `tests/evals/chat-error-messages.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/evals/chat-error-messages.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { chatFriendlyError, parseChatErrorJson } from "@/lib/i18n/error-messages";

describe("parseChatErrorJson", () => {
  it("parses valid JSON with code and requestId", () => {
    const result = parseChatErrorJson('{"code":"AI_TIMEOUT","requestId":"abc-123"}');
    expect(result).toEqual({ code: "AI_TIMEOUT", requestId: "abc-123" });
  });

  it("returns null for non-JSON strings", () => {
    expect(parseChatErrorJson("fetch failed")).toBeNull();
  });

  it("returns null for JSON without code field", () => {
    expect(parseChatErrorJson('{"error":"something"}')).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseChatErrorJson("")).toBeNull();
  });
});

describe("chatFriendlyError", () => {
  it("maps AI_PROVIDER_UNAVAILABLE to localized message (en)", () => {
    const msg = chatFriendlyError("AI_PROVIDER_UNAVAILABLE", "en");
    expect(msg).toContain("temporarily unavailable");
  });

  it("maps AI_RATE_LIMITED to localized message (it)", () => {
    const msg = chatFriendlyError("AI_RATE_LIMITED", "it");
    expect(msg).toContain("Troppe richieste");
  });

  it("maps AI_TIMEOUT to localized message (en)", () => {
    const msg = chatFriendlyError("AI_TIMEOUT", "en");
    expect(msg).toContain("too long");
  });

  it("maps BUDGET_EXCEEDED to localized message (en)", () => {
    const msg = chatFriendlyError("BUDGET_EXCEEDED", "en");
    expect(msg).toContain("usage limit");
  });

  it("maps MODEL_NOT_CONFIGURED to localized message (en)", () => {
    const msg = chatFriendlyError("MODEL_NOT_CONFIGURED", "en");
    expect(msg).toContain("check your setup");
  });

  it("maps CONTEXT_TOO_LONG to localized message (en)", () => {
    const msg = chatFriendlyError("CONTEXT_TOO_LONG", "en");
    expect(msg).toContain("too long");
  });

  it("maps CONTENT_FILTERED to localized message (en)", () => {
    const msg = chatFriendlyError("CONTENT_FILTERED", "en");
    expect(msg).toContain("rephrasing");
  });

  it("returns generic for unknown code", () => {
    const msg = chatFriendlyError("UNKNOWN_CODE", "en");
    expect(msg).toContain("went wrong");
  });

  it("returns generic for null code", () => {
    const msg = chatFriendlyError(null, "en");
    expect(msg).toContain("went wrong");
  });

  it("appends requestId to generic errors", () => {
    const msg = chatFriendlyError("CHAT_INTERNAL_ERROR", "en", "req-abc");
    expect(msg).toContain("Ref: req-abc");
  });

  it("does not append requestId to specific errors", () => {
    const msg = chatFriendlyError("AI_TIMEOUT", "en", "req-abc");
    expect(msg).not.toContain("Ref:");
  });

  it("falls back to en for unsupported language", () => {
    const msg = chatFriendlyError("AI_TIMEOUT", "xx");
    expect(msg).toContain("too long");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/chat-error-messages.test.ts`
Expected: FAIL — `chatFriendlyError` and `parseChatErrorJson` not exported

- [ ] **Step 3: Implement `chatFriendlyError` and `parseChatErrorJson`**

In `src/lib/i18n/error-messages.ts`, add after the existing `friendlyError` function:

```typescript
import { getUiL10n } from "./ui-strings";

/**
 * Parse a JSON error string from the chat stream.
 * Returns { code, requestId } if valid, null otherwise.
 */
export function parseChatErrorJson(raw: string): { code: string; requestId?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.code === "string") {
      return { code: parsed.code, requestId: parsed.requestId };
    }
  } catch { /* not JSON */ }
  return null;
}

// Error codes that have specific, actionable messages (no requestId appended)
const SPECIFIC_ERROR_CODES = new Set([
  "AI_PROVIDER_UNAVAILABLE",
  "AI_RATE_LIMITED",
  "AI_TIMEOUT",
  "BUDGET_EXCEEDED",
  "MODEL_NOT_CONFIGURED",
  "CONTEXT_TOO_LONG",
  "CONTENT_FILTERED",
  "AI_NO_CONTENT",
]);

/**
 * Map a chat error code to a user-friendly localized message.
 * Generic fallback includes requestId for support traceability.
 */
export function chatFriendlyError(code: string | null, language: string, requestId?: string): string {
  const t = getUiL10n(language);

  const map: Record<string, string> = {
    AI_PROVIDER_UNAVAILABLE: t.chatErrorProviderDown,
    AI_RATE_LIMITED: t.chatErrorRateLimit,
    AI_TIMEOUT: t.chatErrorTimeout,
    BUDGET_EXCEEDED: t.chatErrorBudget,
    MODEL_NOT_CONFIGURED: t.chatErrorModelConfig,
    CONTEXT_TOO_LONG: t.chatErrorContextTooLong,
    CONTENT_FILTERED: t.chatErrorContentFiltered,
    AI_NO_CONTENT: t.chatErrorGeneric,
  };

  if (code && map[code]) return map[code];

  // Generic fallback — append requestId for traceability
  const generic = t.chatErrorGeneric;
  if (requestId && (!code || !SPECIFIC_ERROR_CODES.has(code))) {
    return `${generic} Ref: ${requestId}`;
  }
  return generic;
}
```

Note: The `import { getUiL10n } from "./ui-strings";` is needed at the top of the file. The existing `import type { UiStrings }` should be kept.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/chat-error-messages.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run all existing tests to check for regressions**

Run: `npx vitest run`
Expected: ALL PASS (no regressions — only additions)

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/error-messages.ts tests/evals/chat-error-messages.test.ts
git commit -m "feat: add chatFriendlyError + parseChatErrorJson for chat error mapping"
```

---

## Chunk 3: Wire server + client

### Task 4: Wire classifier into chat route

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add import**

At the top of `src/app/api/chat/route.ts`, add after the action-claim-guard import (line 34):

```typescript
import { classifyChatError, formatChatErrorResponse } from "@/lib/services/chat-errors";
```

- [ ] **Step 2: Update `getErrorMessage` callback**

Replace lines 490-498 (the `getErrorMessage` callback) with:

```typescript
      getErrorMessage: (error) => {
        console.error("[chat] Stream error:", error);
        // Revert import event flag on stream error (G2)
        if (importFlag) {
          try { revertImportEvent(writeSessionId); } catch { /* best-effort */ }
        }
        return formatChatErrorResponse(error, requestId);
      },
```

- [ ] **Step 3: Update pre-stream catch block**

Replace lines 500-509 (the catch block) with:

```typescript
  } catch (error) {
    console.error("[chat] Error:", error, { requestId });
    // Revert import event flag on pre-stream error (G2)
    if (importFlag) {
      try { revertImportEvent(writeSessionId); } catch { /* best-effort */ }
    }
    const code = classifyChatError(error);
    return new Response(
      JSON.stringify({ error: "Internal error", code, requestId }),
      { status: code === "AI_RATE_LIMITED" ? 429 : 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } },
    );
  }
```

- [ ] **Step 4: Add `code` to budget check early return**

Replace lines 84-90 (budget check response) with:

```typescript
    return new Response(
      JSON.stringify({ code: "BUDGET_EXCEEDED", requestId }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
```

Note: `requestId` is defined on line 128. The budget check is on line 82, BEFORE `requestId` is declared. We need to move the requestId declaration before the budget check, or generate a dedicated one. Since `requestId` is generated on line 128 (after body parsing), and the budget check is on line 82 (before body parsing), we should generate a minimal UUID for the budget error case.

Actually, looking more carefully: the budget check is at line 82 and `requestId` is at line 128. Since `requestId` hasn't been declared yet at that point, we should either:
- Move `const requestId = randomUUID();` to just after line 65 (before the rate limit check), or
- Use a literal for early returns

The cleanest approach: move `const requestId = randomUUID();` to line 66 (right after `export async function POST(req: Request) {`), before both rate-limit and budget checks. This way all error responses can include the requestId.

Replace line 128 (`const requestId = randomUUID();`) — it will be moved to line 66.

Updated approach for Step 4:

**Step 4a: Move `requestId` declaration to top of function**

Move `const requestId = randomUUID();` from line 128 to just after `export async function POST(req: Request) {` (line 65), so it's available for all error responses.

```typescript
export async function POST(req: Request) {
  const requestId = randomUUID();

  // Rate limiting
  ...
```

Delete the original `const requestId = randomUUID();` at line 128.

**Step 4b: Add `code` and `requestId` to rate-limit early return**

Replace lines 69-78 (rate limit response) with:

```typescript
    return new Response(
      JSON.stringify({ error: rateResult.reason, code: "AI_RATE_LIMITED", requestId }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateResult.retryAfter ?? 1),
        },
      },
    );
```

**Step 4c: Add `code` and `requestId` to budget check early return**

Replace lines 84-90 (budget response) with:

```typescript
    return new Response(
      JSON.stringify({ code: "BUDGET_EXCEEDED", requestId }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: wire chat error classifier into stream + pre-stream error responses"
```

### Task 5: Update ChatPanel to consume stream errors + use L10N

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Update imports**

Replace line 9-11:

```typescript
import { extractErrorMessage } from "@/lib/services/errors";
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { friendlyError } from "@/lib/i18n/error-messages";
```

With:

```typescript
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { friendlyError, chatFriendlyError, parseChatErrorJson } from "@/lib/i18n/error-messages";
```

Note: `extractErrorMessage` import is removed — no longer needed (was only used in `onError`, now replaced by `parseChatErrorJson`).

- [ ] **Step 2: Update `onError` callback to use `chatFriendlyError`**

Replace the `onError` handler (lines 523-536):

```typescript
      onError: (error) => {
        // Check if it's a 429 with limit info
        if (error.message?.includes("Message limit reached")) {
          setLimitReached(true);
          return;
        }

        if (error.message && /unauthorized/i.test(error.message)) {
          window.location.href = "/invite";
          return;
        }

        setChatError(extractErrorMessage(error));
      },
```

With:

```typescript
      onError: (error) => {
        // Check if it's a 429 with limit info
        if (error.message?.includes("Message limit reached")) {
          setLimitReached(true);
          return;
        }

        if (error.message && /unauthorized/i.test(error.message)) {
          window.location.href = "/invite";
          return;
        }

        // Try to parse structured JSON from server (bypass extractErrorMessage which strips code/requestId)
        const parsed = parseChatErrorJson(error.message ?? "");
        setChatError(chatFriendlyError(parsed?.code ?? null, language, parsed?.requestId));
      },
```

- [ ] **Step 5: Add `role="alert"` to error banner div (accessibility)**

Replace the error banner `<div>` (line 712):

```typescript
            <div className="flex items-center gap-2 border-t bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
```

With:

```typescript
            <div role="alert" className="flex items-center gap-2 border-t bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
```

- [ ] **Step 6: Localize Retry and Refresh buttons**

Replace lines 714-728 (the two error banner buttons):

```typescript
              <button
                onClick={() => {
                  setChatError(null);
                  reload();
                }}
                className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700"
              >
                {language === "it" ? "Riprova" : "Retry"}
              </button>
              <button
                onClick={refreshChat}
                className="shrink-0 rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
              >
                {language === "it" ? "Aggiorna chat" : "Refresh chat"}
              </button>
```

With:

```typescript
              <button
                onClick={() => {
                  setChatError(null);
                  reload();
                }}
                className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700"
              >
                {t.chatRetry}
              </button>
              <button
                onClick={refreshChat}
                className="shrink-0 rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
              >
                {t.chatRefresh}
              </button>
```

- [ ] **Step 7: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/chat/ChatPanel.tsx
git commit -m "feat: show user-friendly localized chat errors instead of raw technical messages"
```

---

## Chunk 4: Verification

### Task 6: Full verification

- [ ] **Step 1: TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: ALL PASS — check total count is previous count + new tests

- [ ] **Step 3: Verify schema count constant**

The `EXPECTED_HANDLER_COUNT` is 12 (tools count) and `EXPECTED_SCHEMA_VERSION` is 34 — these should NOT change since we're not adding tools or migrations.

Run: `grep -n "EXPECTED_SCHEMA_VERSION\|EXPECTED_HANDLER_COUNT" src/lib/agent/tools.ts src/lib/db/migrate.ts`
Expected: Both unchanged from before

- [ ] **Step 4: Final commit (if any remaining changes)**

If there are any uncommitted changes from fixing issues found during verification:

```bash
git add -A
git commit -m "fix: address verification issues in chat error UX layer"
```
