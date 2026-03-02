"use client";

import { useEffect, useState, useCallback } from "react";
import { SplitView } from "@/components/layout/SplitView";
import {
  LanguagePicker,
  type LanguageCode,
} from "@/components/chat/LanguagePicker";
import {
  detectBrowserLanguage,
  isLanguageCode,
} from "@/lib/i18n/languages";

const LANGUAGE_STORAGE_KEY = "openself.language";

function readStoredLanguage(): LanguageCode | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguageCode(raw) ? raw : null;
}

function storeLanguage(language: LanguageCode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

async function persistLanguage(language: LanguageCode, regenerateDraft: boolean): Promise<void> {
  try {
    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, regenerateDraft }),
    });
    if (res.status === 401) {
      window.location.href = "/invite";
      return;
    }
    if (!res.ok) {
      console.warn("[preferences] Failed to persist language:", res.status);
    }
  } catch (err) {
    console.warn("[preferences] Failed to persist language:", err);
  }
}

export type AuthState = {
  authenticated: boolean;
  username: string | null;
  multiUser: boolean;
  publishedUsername: string | null;
  authV2?: boolean;
};

export default function BuilderPage() {
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authState, setAuthState] = useState<AuthState>({
    authenticated: false,
    username: null,
    multiUser: false,
    publishedUsername: null,
  });
  const [publishedConfigHash, setPublishedConfigHash] = useState<string | null>(null);

  // Lightweight auth refresh — only updates auth-related state, no language or loading side effects
  const refreshAuth = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch("/api/preferences", { cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return;
      const data = await res.json();
      setAuthState({
        authenticated: !!data.authenticated,
        username: data.username ?? null,
        multiUser: !!data.multiUser,
        publishedUsername: data.publishedUsername ?? null,
        authV2: !!data.authV2,
      });
      setPublishedConfigHash(data.publishedConfigHash ?? null);
    } catch { /* silent — includes abort */ }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const localLanguage = readStoredLanguage();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch("/api/preferences", { cache: "no-store", signal: controller.signal });
        clearTimeout(timeout);
        if (res.status === 401) {
          window.location.href = "/invite";
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load preferences");
        }

        const data = await res.json() as {
          language?: unknown;
          hasPage?: boolean;
          authenticated?: boolean;
          username?: string | null;
          multiUser?: boolean;
          publishedUsername?: string | null;
          publishedConfigHash?: string | null;
          authV2?: boolean;
        };
        const serverLanguage = isLanguageCode(data.language) ? data.language : null;

        if (!cancelled) {
          setAuthState({
            authenticated: !!data.authenticated,
            username: data.username ?? null,
            multiUser: !!data.multiUser,
            publishedUsername: data.publishedUsername ?? null,
            authV2: !!data.authV2,
          });
          setPublishedConfigHash(data.publishedConfigHash ?? null);
        }

        const resolvedLanguage = serverLanguage
          ?? (data.hasPage ? (localLanguage ?? detectBrowserLanguage()) : null);

        if (resolvedLanguage && !cancelled) {
          setLanguage(resolvedLanguage);
          storeLanguage(resolvedLanguage);

          if (!serverLanguage) {
            await persistLanguage(resolvedLanguage, data.hasPage === true);
          }
        }
      } catch {
        if (localLanguage && !cancelled) {
          setLanguage(localLanguage);
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  // Re-validate auth on tab switch, back navigation, and window focus
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAuth();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void refreshAuth();
    };
    const onFocus = () => void refreshAuth();

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshAuth]);

  const handleSelectLanguage = async (selectedLanguage: LanguageCode) => {
    setLanguage(selectedLanguage);
    storeLanguage(selectedLanguage);
    await persistLanguage(selectedLanguage, true);
  };

  if (bootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!language) {
    return <LanguagePicker onSelect={handleSelectLanguage} />;
  }

  return (
    <SplitView
      language={language}
      onLanguageChange={handleSelectLanguage}
      authState={authState}
      publishedConfigHash={publishedConfigHash}
      onPublishedConfigHashChange={setPublishedConfigHash}
    />
  );
}
