"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { getUiL10n } from "@/lib/i18n/ui-strings";
import { friendlyError } from "@/lib/i18n/error-messages";

type SignupModalProps = {
  open: boolean;
  onClose: () => void;
  initialUsername?: string;
  language?: string;
};

export function SignupModal({ open, onClose, initialUsername, language = "en" }: SignupModalProps) {
  const t = getUiL10n(language);
  const [username, setUsername] = useState(initialUsername ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Sync username when initialUsername changes post-mount
  useEffect(() => {
    if (initialUsername) setUsername(initialUsername);
  }, [initialUsername]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset all form state on close
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

  const sanitizeUsername = useCallback((raw: string) => {
    return raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
  }, []);

  const handleConfirmBlur = useCallback(() => {
    if (confirmPassword && confirmPassword !== password) {
      setConfirmError(t.passwordsDoNotMatch);
    } else {
      setConfirmError(null);
    }
  }, [confirmPassword, password, t.passwordsDoNotMatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username) {
      setError(t.usernameRequired);
      return;
    }
    if (!email) {
      setError(t.emailRequired);
      return;
    }
    if (password.length < 8) {
      setError(t.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError(t.passwordsDoNotMatch);
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
        setError(friendlyError(data.code, t));
      }
    } catch {
      setError(t.networkError);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold">{t.createYourAccount}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t.signUpToPublishPage}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="signup-username" className="mb-1 block text-sm font-medium">
              {t.username}
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
                /{username}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="signup-email" className="mb-1 block text-sm font-medium">
              {t.email}
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
              {t.password}
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (confirmError) setConfirmError(null);
              }}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder={t.atLeast8Chars}
              autoComplete="new-password"
            />
          </div>

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

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? t.creatingAccount : t.signUpAndPublish}
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t.alreadyHaveAccount}{" "}
          <Link href="/login" className="underline underline-offset-2 hover:text-foreground">
            {t.logIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
