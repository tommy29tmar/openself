"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check for OAuth errors in URL
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const oauthError = params?.get("error");

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

      {/* OAuth buttons — rendered for all, server returns 404 if not configured */}
      <div className="flex w-full max-w-sm flex-col gap-2">
        <a
          href="/api/auth/google"
          className="flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with Google
        </a>
        <a
          href="/api/auth/github"
          className="flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with GitHub
        </a>
        <a
          href="/api/auth/discord"
          className="flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with Discord
        </a>
        <a
          href="/api/auth/linkedin"
          className="flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with LinkedIn
        </a>
        <a
          href="/api/auth/twitter"
          className="flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with X (Twitter)
        </a>
        <a
          href="/api/auth/apple"
          className="flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with Apple
        </a>
      </div>

      <div className="flex w-full max-w-sm items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

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
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
