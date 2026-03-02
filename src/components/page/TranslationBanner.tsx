import { LANGUAGE_NAMES } from "@/lib/i18n/language-names";
import type { LanguageCode } from "@/lib/i18n/languages";

type TranslationBannerProps = {
  sourceLanguage: string;
  username: string;
};

export function TranslationBanner({
  sourceLanguage,
  username,
}: TranslationBannerProps) {
  const langName =
    LANGUAGE_NAMES[sourceLanguage as LanguageCode] ??
    sourceLanguage;

  return (
    <div className="w-full bg-[var(--page-bg-secondary,#f5f5f5)] border-b border-[var(--page-border,#e5e5e5)] px-4 py-2 text-center text-xs text-[var(--page-fg-secondary,#666)]">
      Machine-translated from {langName}.{" "}
      <a
        href={`/${username}?lang=original`}
        className="underline hover:text-[var(--page-fg,#111)] transition-colors"
      >
        View original
      </a>
    </div>
  );
}
