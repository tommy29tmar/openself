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
