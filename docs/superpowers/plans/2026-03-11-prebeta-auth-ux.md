# Pre-Beta Auth UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add confirm password across all 3 auth surfaces, dynamic OAuth buttons (only configured providers) on /login and /signup pages, and forgot-password link on /login. SignupModal: confirm password only (no OAuth — publish flow safety).

**Architecture:** Server-side provider registry (`getConfiguredProviders()`) checks env vars (including `NEXT_PUBLIC_BASE_URL` for providers that build callback URLs) and returns configured OAuth providers. Login and signup pages become server wrappers passing providers as props to client form components. OAuthButtons is a pure presentational component shared by login/signup pages. SignupModal gets only a confirm password field (no OAuth — adding OAuth would break the atomic publish flow since callbacks don't resume publish).

**Tech Stack:** Next.js App Router (Server Components + React Context), TypeScript, Tailwind CSS

**Design doc:** `/tmp/brainstorm-prebeta-auth/synthesis.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/auth/providers.ts` | Provider registry + `getConfiguredProviders()` (server-only) |
| Create | `src/components/auth/OAuthButtons.tsx` | Pure presentational OAuth button list |
| ~~Create~~ | ~~`src/components/auth/AuthProvidersContext.tsx`~~ | ~~Dropped — no consumer until OAuth-in-modal is safe~~ |
| Create | `src/components/auth/LoginForm.tsx` | Client form extracted from login page |
| Create | `src/components/auth/SignupForm.tsx` | Client form extracted from signup page |
| Create | `tests/evals/auth-providers.test.ts` | Tests for provider registry |
| ~~Modify~~ | ~~`src/app/layout.tsx`~~ | ~~Dropped — no context provider needed~~ |
| Modify | `src/app/login/page.tsx` | Convert to server wrapper, delegate to `LoginForm` |
| Modify | `src/app/signup/page.tsx` | Convert to server wrapper, delegate to `SignupForm` |
| Modify | `src/components/auth/SignupModal.tsx` | Add confirm password field (no OAuth — publish flow safety) |
| Modify | `src/lib/i18n/ui-strings.ts` | Add 3 new L10N keys × 8 languages |
| Modify | `tests/evals/ui-strings.test.ts` | Add new keys to REQUIRED_KEYS |

---

## Chunk 1: Provider Registry + Tests

### Task 1: Provider registry

**Files:**
- Create: `src/lib/auth/providers.ts`
- Create: `tests/evals/auth-providers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/evals/auth-providers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getConfiguredProviders", () => {
  const originalEnv = process.env;

  const PROVIDER_ENV_VARS = [
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
    "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET",
    "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET",
    "TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET",
    "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY",
    "NEXT_PUBLIC_BASE_URL",
  ];

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all provider env vars for hermetic tests
    for (const v of PROVIDER_ENV_VARS) delete process.env[v];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty array when no providers configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_ID;
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders()).toEqual([]);
  });

  it("returns google when CLIENT_ID, CLIENT_SECRET, and NEXT_PUBLIC_BASE_URL are set", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    const providers = getConfiguredProviders();
    expect(providers).toEqual([
      { id: "google", label: "Google", authUrl: "/api/auth/google" },
    ]);
  });

  it("skips google when NEXT_PUBLIC_BASE_URL is missing", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders().find(p => p.id === "google")).toBeUndefined();
  });

  it("skips provider when only CLIENT_ID is set (missing SECRET)", async () => {
    process.env.GITHUB_CLIENT_ID = "test-id";
    // GITHUB_CLIENT_SECRET not set
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders()).toEqual([]);
  });

  it("apple requires all 5 env vars (including NEXT_PUBLIC_BASE_URL)", async () => {
    process.env.APPLE_CLIENT_ID = "id";
    process.env.APPLE_TEAM_ID = "team";
    process.env.APPLE_KEY_ID = "key";
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    // APPLE_PRIVATE_KEY not set
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders().find(p => p.id === "apple")).toBeUndefined();

    process.env.APPLE_PRIVATE_KEY = "pk";
    vi.resetModules();
    const { getConfiguredProviders: gcp2 } = await import("@/lib/auth/providers");
    expect(gcp2().find(p => p.id === "apple")).toBeDefined();
  });

  it("returns providers in registry order", async () => {
    process.env.GITHUB_CLIENT_ID = "id";
    process.env.GITHUB_CLIENT_SECRET = "secret";
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    const ids = getConfiguredProviders().map(p => p.id);
    expect(ids.indexOf("google")).toBeLessThan(ids.indexOf("github"));
  });

  it("discord/linkedin/twitter require NEXT_PUBLIC_BASE_URL", async () => {
    process.env.DISCORD_CLIENT_ID = "id";
    process.env.DISCORD_CLIENT_SECRET = "secret";
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const { getConfiguredProviders } = await import("@/lib/auth/providers");
    expect(getConfiguredProviders().find(p => p.id === "discord")).toBeUndefined();

    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
    vi.resetModules();
    const { getConfiguredProviders: gcp2 } = await import("@/lib/auth/providers");
    expect(gcp2().find(p => p.id === "discord")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/auth-providers.test.ts`
Expected: FAIL — module `@/lib/auth/providers` not found

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth/providers.ts`:

```typescript
/**
 * OAuth provider registry.
 * Server-only — checks env vars to determine which providers are configured.
 * To add a new provider: add one entry to PROVIDER_REGISTRY.
 *
 * NOTE: This registry is intentionally stricter than the route handlers.
 * Routes fall back to localhost for NEXT_PUBLIC_BASE_URL (dev convenience),
 * but the registry requires it to be set — we don't want UI buttons that
 * redirect to localhost:3000 in production. The registry controls UI
 * visibility; routes control runtime behavior.
 */

export type OAuthProviderInfo = {
  id: string;
  label: string;
  authUrl: string;
};

const PROVIDER_REGISTRY: Array<{
  id: string;
  label: string;
  envVars: string[];
}> = [
  { id: "google", label: "Google", envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL"] },
  { id: "github", label: "GitHub", envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] },
  { id: "discord", label: "Discord", envVars: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL"] },
  { id: "linkedin", label: "LinkedIn", envVars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL"] },
  { id: "twitter", label: "X (Twitter)", envVars: ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL"] },
  { id: "apple", label: "Apple", envVars: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "NEXT_PUBLIC_BASE_URL"] },
];

export function getConfiguredProviders(): OAuthProviderInfo[] {
  return PROVIDER_REGISTRY
    .filter((p) => p.envVars.every((v) => !!process.env[v]))
    .map((p) => ({ id: p.id, label: p.label, authUrl: `/api/auth/${p.id}` }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/auth-providers.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/providers.ts tests/evals/auth-providers.test.ts
git commit -m "feat: add OAuth provider registry with env var detection

getConfiguredProviders() returns only providers whose required env vars
are all set. Includes NEXT_PUBLIC_BASE_URL check for providers that
need it for callback URLs (Discord, LinkedIn, Twitter)."
```

---

## Chunk 2: Shared UI Components (OAuthButtons + AuthProvidersContext)

### Task 2: OAuthButtons component

**Files:**
- Create: `src/components/auth/OAuthButtons.tsx`

- [ ] **Step 1: Create OAuthButtons component**

```tsx
"use client";

import type { OAuthProviderInfo } from "@/lib/auth/providers";

type OAuthButtonsProps = {
  providers: OAuthProviderInfo[];
};

export function OAuthButtons({ providers }: OAuthButtonsProps) {
  if (providers.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-2">
      {providers.map((p) => (
        <a
          key={p.id}
          href={p.authUrl}
          className="flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with {p.label}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/auth/OAuthButtons.tsx
git commit -m "feat: add shared OAuthButtons component

Pure presentational component that renders OAuth provider links.
Receives providers as prop — no internal fetch."
```

### ~~Task 3: AuthProvidersContext~~ (DROPPED)

> **Removed:** No consumer in current scope — SignupModal doesn't get OAuth buttons
> (publish flow safety). Will be added when OAuth-in-modal has return-to-publish support.

---

## Chunk 3: L10N Keys

### Task 4: Add new L10N keys

**Files:**
- Modify: `src/lib/i18n/ui-strings.ts`
- Modify: `tests/evals/ui-strings.test.ts`

- [ ] **Step 1: Add keys to UiStrings interface**

In `src/lib/i18n/ui-strings.ts`, add to the interface after `alreadyHaveAccount`:

```typescript
  // Confirm password
  confirmPassword: string;
  passwordsDoNotMatch: string;

  // Forgot password
  forgotPassword: string;
```

- [ ] **Step 2: Add translations to all 8 language maps**

Add to `en`:
```typescript
  confirmPassword: "Confirm password",
  passwordsDoNotMatch: "Passwords do not match",
  forgotPassword: "Forgot password?",
```

Add to `it`:
```typescript
  confirmPassword: "Conferma password",
  passwordsDoNotMatch: "Le password non coincidono",
  forgotPassword: "Password dimenticata?",
```

Add to `de`:
```typescript
  confirmPassword: "Passwort bestätigen",
  passwordsDoNotMatch: "Passwörter stimmen nicht überein",
  forgotPassword: "Passwort vergessen?",
```

Add to `fr`:
```typescript
  confirmPassword: "Confirmer le mot de passe",
  passwordsDoNotMatch: "Les mots de passe ne correspondent pas",
  forgotPassword: "Mot de passe oublié ?",
```

Add to `es`:
```typescript
  confirmPassword: "Confirmar contraseña",
  passwordsDoNotMatch: "Las contraseñas no coinciden",
  forgotPassword: "¿Contraseña olvidada?",
```

Add to `pt`:
```typescript
  confirmPassword: "Confirmar palavra-passe",
  passwordsDoNotMatch: "As palavras-passe não coincidem",
  forgotPassword: "Esqueceu a palavra-passe?",
```

Add to `ja`:
```typescript
  confirmPassword: "パスワード確認",
  passwordsDoNotMatch: "パスワードが一致しません",
  forgotPassword: "パスワードをお忘れですか？",
```

Add to `zh`:
```typescript
  confirmPassword: "确认密码",
  passwordsDoNotMatch: "密码不匹配",
  forgotPassword: "忘记密码？",
```

- [ ] **Step 3: Update test REQUIRED_KEYS**

In `tests/evals/ui-strings.test.ts`, add to the `REQUIRED_KEYS` array:

```typescript
    // Confirm password + forgot password
    "confirmPassword", "passwordsDoNotMatch", "forgotPassword",
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evals/ui-strings.test.ts`
Expected: all PASS (8 languages × required keys + fallback + Italian check)

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/ui-strings.ts tests/evals/ui-strings.test.ts
git commit -m "feat: add L10N keys for confirm password and forgot password

3 new keys × 8 languages: confirmPassword, passwordsDoNotMatch,
forgotPassword."
```

---

## Chunk 4: Login Page Refactor

### Task 5: Extract LoginForm, convert login page to server wrapper

**Files:**
- Create: `src/components/auth/LoginForm.tsx`
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Create LoginForm client component**

Create `src/components/auth/LoginForm.tsx` — this is the current login page logic extracted into a client component, with dynamic OAuth buttons and "Forgot password?" link:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import type { OAuthProviderInfo } from "@/lib/auth/providers";

type LoginFormProps = {
  providers: OAuthProviderInfo[];
  oauthError?: string | null;
};

export function LoginForm({ providers, oauthError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        window.location.href = "/builder";
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>

      {oauthError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          OAuth sign-in failed. Please try again.
        </p>
      )}

      {/* OAuth buttons — only configured providers */}
      <div className="w-full max-w-sm">
        <OAuthButtons providers={providers} />
      </div>

      {providers.length > 0 && (
        <div className="flex w-full max-w-sm items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="rounded border bg-background px-3 py-2 text-sm"
          autoComplete="email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={8}
          className="rounded border bg-background px-3 py-2 text-sm"
          autoComplete="current-password"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline">
            Create an account
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          Forgot password?{" "}
          <a
            href="mailto:tom@openself.dev?subject=Password%20reset%20request"
            className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
          >
            tom@openself.dev
          </a>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Convert login page to server wrapper**

Replace `src/app/login/page.tsx` entirely:

```tsx
import { getConfiguredProviders } from "@/lib/auth/providers";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const providers = getConfiguredProviders();
  const { error } = await searchParams;
  return <LoginForm providers={providers} oauthError={error ?? null} />;
}
```

Note: In Next.js App Router, `searchParams` is a Promise in server components.
The `oauthError` is resolved server-side and passed as a prop to avoid hydration
mismatch (the `window.location.search` pattern would render `null` on the server
but the error string on the client, causing a React hydration error).

- [ ] **Step 3: Verify app compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/LoginForm.tsx src/app/login/page.tsx
git commit -m "refactor: login page → server wrapper + LoginForm client component

Login page is now a server component that calls getConfiguredProviders()
and passes result to LoginForm. OAuth buttons are dynamic (only
configured providers). Added 'Forgot password?' with inline email.
Divider hidden when no OAuth providers configured."
```

---

## Chunk 5: Signup Page Refactor

### Task 6: Extract SignupForm, convert signup page to server wrapper

**Files:**
- Create: `src/components/auth/SignupForm.tsx`
- Modify: `src/app/signup/page.tsx`

- [ ] **Step 1: Create SignupForm client component**

Create `src/components/auth/SignupForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import type { OAuthProviderInfo } from "@/lib/auth/providers";

type SignupFormProps = {
  providers: OAuthProviderInfo[];
};

export function SignupForm({ providers }: SignupFormProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConfirmBlur = () => {
    if (confirmPassword && confirmPassword !== password) {
      setConfirmError("Passwords do not match");
    } else {
      setConfirmError(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (data.success) {
        window.location.href = "/builder";
      } else {
        setError(data.error || "Signup failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Create an account</h1>

      {/* OAuth buttons — prominent */}
      <div className="w-full max-w-sm">
        <OAuthButtons providers={providers} />
      </div>

      {providers.length > 0 && (
        <div className="flex w-full max-w-sm items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="Username"
          required
          minLength={1}
          maxLength={39}
          pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
          className="rounded border bg-background px-3 py-2 text-sm"
          autoComplete="username"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="rounded border bg-background px-3 py-2 text-sm"
          autoComplete="email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (confirmError) setConfirmError(null);
          }}
          placeholder="Password (min 8 characters)"
          required
          minLength={8}
          className="rounded border bg-background px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (confirmError) setConfirmError(null);
          }}
          onBlur={handleConfirmBlur}
          placeholder="Confirm password"
          required
          minLength={8}
          className="rounded border bg-background px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        {confirmError && (
          <p className="text-sm text-red-600 dark:text-red-400">{confirmError}</p>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Convert signup page to server wrapper**

Replace `src/app/signup/page.tsx`:

```tsx
import { getConfiguredProviders } from "@/lib/auth/providers";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  const providers = getConfiguredProviders();
  return <SignupForm providers={providers} />;
}
```

- [ ] **Step 3: Verify app compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/SignupForm.tsx src/app/signup/page.tsx
git commit -m "refactor: signup page → server wrapper + SignupForm client component

OAuth buttons prominent, email/password secondary. Confirm password
field with onBlur validation. Divider hidden when no providers."
```

---

## Chunk 6: SignupModal Enhancement

### Task 7: Add confirm password to SignupModal (NO OAuth buttons)

**Files:**
- Modify: `src/components/auth/SignupModal.tsx`

The SignupModal is the publish-flow modal. It does atomic signup+publish via POST `/api/register`. Adding OAuth buttons here would break the publish flow because OAuth callbacks redirect to `/builder` or `/${username}` without publishing. Users who need OAuth should use the existing "Already have an account? Sign in" link which goes to `/login` where OAuth is available.

**Scope:** Only add confirm password field. No OAuth buttons. No new imports for providers.

- [ ] **Step 1: Update SignupModal**

Modify `src/components/auth/SignupModal.tsx`:

1. Add state for `confirmPassword` and `confirmError`:
```typescript
const [confirmPassword, setConfirmPassword] = useState("");
const [confirmError, setConfirmError] = useState<string | null>(null);
```

2. Add blur handler (after `sanitizeUsername`):
```typescript
const handleConfirmBlur = useCallback(() => {
  if (confirmPassword && confirmPassword !== password) {
    setConfirmError(t.passwordsDoNotMatch);
  } else {
    setConfirmError(null);
  }
}, [confirmPassword, password, t.passwordsDoNotMatch]);
```

3. Add reset `useEffect` **BEFORE** the `if (!open) return null` early return (alongside other hooks, after the Escape key handler). Reset **all** transient form state to prevent stale data on reopen, including username (rehydrate from `initialUsername` prop):
```typescript
useEffect(() => {
  if (!open) {
    setUsername(initialUsername ?? "");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setConfirmError(null);
    setSubmitting(false);
  }
}, [open, initialUsername]);
```

4. Update the existing password input `onChange` to also clear `confirmError` (prevents stuck errors when user edits the first password after blur):
```tsx
onChange={(e) => {
  setPassword(e.target.value);
  if (confirmError) setConfirmError(null);
}}
```

5. Add confirm password validation in `handleSubmit`, after the password length check:
```typescript
if (password !== confirmPassword) {
  setConfirmError(t.passwordsDoNotMatch);
  return;
}
```

6. Add confirm password input after the password input (inside the form, after the password `<div>`):
```tsx
<div>
  <label htmlFor="signup-confirm-password" className="mb-1 block text-sm font-medium">
    {t.confirmPassword}
  </label>
  <input
    id="signup-confirm-password"
    type="password"
    value={confirmPassword}
    onChange={(e) => {
      setConfirmPassword(e.target.value);
      if (confirmError) setConfirmError(null);
    }}
    onBlur={handleConfirmBlur}
    className="w-full rounded border px-3 py-2 text-sm"
    placeholder={t.confirmPassword}
    autoComplete="new-password"
  />
  {confirmError && (
    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{confirmError}</p>
  )}
</div>
```

7. Keep the existing footer exactly as-is (no OAuth buttons):
```tsx
<p className="mt-3 text-center text-xs text-muted-foreground">
  {t.alreadyHaveAccount}{" "}
  <a href="/login" className="underline underline-offset-2 hover:text-foreground">
    {t.logIn}
  </a>
</p>
```

- [ ] **Step 2: Verify app compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify the app starts and modal renders**

Run: `npm run dev` (check that builder loads, SignupModal still works)

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/SignupModal.tsx
git commit -m "feat: SignupModal — add confirm password with onBlur validation

Confirm password field with blur validation + submit-time check.
No OAuth buttons in modal (publish flow requires atomic signup via
/api/register — OAuth callbacks don't resume publish). Users who
need OAuth are directed to /login via existing link."
```

---

## Chunk 7: Final Verification

### Task 8: Run full test suite + type check

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run all auth-related tests**

Run: `npx vitest run tests/evals/auth-providers.test.ts tests/evals/ui-strings.test.ts`
Expected: all PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (no regressions)

- [ ] **Step 4: Manual smoke test**

Start dev server: `npm run dev`

Verify:
1. `/login` — shows only configured OAuth providers (no 404 links), "Forgot password?" with `tom@openself.dev` visible
2. `/signup` — shows OAuth providers + confirm password field, blur validation works
3. Builder → try publish (anon) → SignupModal shows confirm password field, no OAuth buttons, "Already have an account? Sign in" link present
4. If no OAuth providers configured in .env: login/signup show only email/password form (no divider, no OAuth buttons)
