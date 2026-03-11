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
