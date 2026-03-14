"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }

    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        setTokenValid(data.valid === true);
        setValidating(false);
      })
      .catch(() => {
        setTokenValid(false);
        setValidating(false);
      });
  }, [token]);

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
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Validating link...</p>
      </main>
    );
  }

  if (!token || !tokenValid) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-4">Invalid or expired link</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This password reset link is no longer valid. Please request a new one.
          </p>
          <Link href="/forgot-password" className="text-sm underline">
            Request new link
          </Link>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-4">Password updated</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your password has been reset. You can now sign in with your new password.
          </p>
          <Link href="/login" className="text-sm underline font-medium">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (confirmError) setConfirmError(null);
          }}
          placeholder="New password (min 8 characters)"
          required
          minLength={8}
          className="min-h-[48px] rounded border bg-background px-3 py-2 text-sm"
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
          placeholder="Confirm new password"
          required
          minLength={8}
          className="min-h-[48px] rounded border bg-background px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        {confirmError && (
          <p className="text-sm text-red-600 dark:text-red-400">{confirmError}</p>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <Button type="submit" disabled={loading} className="min-h-[48px]">
          {loading ? "Resetting..." : "Reset password"}
        </Button>
      </form>
    </main>
  );
}
