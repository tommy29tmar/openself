"use client";

import { useEffect, useState } from "react";
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
  await fetch("/api/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, regenerateDraft }),
  });
}

export default function BuilderPage() {
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const localLanguage = readStoredLanguage();

      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load preferences");
        }

        const data = await res.json() as { language?: unknown; hasPage?: boolean };
        const serverLanguage = isLanguageCode(data.language) ? data.language : null;

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

  return <SplitView language={language} onLanguageChange={handleSelectLanguage} />;
}
