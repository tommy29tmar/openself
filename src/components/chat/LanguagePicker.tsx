"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

type LanguagePickerProps = {
  onSelect: (language: LanguageCode) => void;
};

function detectBrowserLanguage(): LanguageCode {
  if (typeof navigator === "undefined") return "en";
  const browserLang = navigator.language.split("-")[0];
  const match = LANGUAGES.find((l) => l.code === browserLang);
  return match ? match.code : "en";
}

export function LanguagePicker({ onSelect }: LanguagePickerProps) {
  const [selected, setSelected] = useState<LanguageCode>("en");

  useEffect(() => {
    setSelected(detectBrowserLanguage());
  }, []);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-sm space-y-6 px-4">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">OpenSelf</h1>
          <p className="text-sm text-muted-foreground">
            Choose your language to get started
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((lang) => (
            <Button
              key={lang.code}
              variant={selected === lang.code ? "default" : "outline"}
              className="h-10"
              onClick={() => setSelected(lang.code)}
            >
              {lang.label}
            </Button>
          ))}
        </div>

        <Button className="w-full" size="lg" onClick={() => onSelect(selected)}>
          Continue
        </Button>
      </div>
    </div>
  );
}
