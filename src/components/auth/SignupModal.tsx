"use client";

import { useState, useEffect, useCallback } from "react";

type SignupModalProps = {
  open: boolean;
  onClose: () => void;
};

export function SignupModal({ open, onClose }: SignupModalProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const sanitizeUsername = useCallback((raw: string) => {
    return raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username) {
      setError("Username is required");
      return;
    }
    if (!email) {
      setError("Email is required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (data.success) {
        window.location.href = `/${data.username}`;
      } else {
        setError(data.error || "Registration failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold">Create your account</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Sign up to publish your page
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="signup-username" className="mb-1 block text-sm font-medium">
              Username
            </label>
            <input
              id="signup-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="yourname"
              autoFocus
              autoComplete="username"
            />
            {username && (
              <p className="mt-1 text-xs text-muted-foreground">
                openself.dev/{username}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="signup-email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Creating account..." : "Sign up & publish"}
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="underline underline-offset-2 hover:text-foreground">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
