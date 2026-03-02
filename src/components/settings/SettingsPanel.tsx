"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LANGUAGE_OPTIONS, type LanguageCode } from "@/lib/i18n/languages";
import {
  AVAILABLE_FONTS,
  FONT_LABELS,
  type AvailableFont,
} from "@/lib/page-config/fonts";
import { AVAILABLE_THEMES } from "@/lib/page-config/schema";
import { cn } from "@/lib/utils";
import { LAYOUT_TEMPLATES, type LayoutTemplateId } from "@/lib/layout/contracts";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { ConnectorSection } from "@/components/settings/ConnectorSection";
import { AvatarSection } from "@/components/settings/AvatarSection";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  language: string;
  onLanguageChange: (lang: LanguageCode) => void;
  /** When true, only the Language section is shown (no draft to style yet). */
  languageOnly?: boolean;
  theme: string;
  onThemeChange: (theme: string) => void;
  colorScheme: "light" | "dark";
  onColorSchemeChange: (scheme: "light" | "dark") => void;
  fontFamily: string;
  onFontFamilyChange: (font: AvailableFont) => void;
  layoutTemplate?: LayoutTemplateId;
  onLayoutTemplateChange?: (t: LayoutTemplateId) => void;
  /** Called after avatar upload/remove to trigger preview refresh */
  onAvatarChange?: () => void;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function OptionGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">{children}</div>
  );
}

function OptionButton({
  selected,
  onClick,
  disabled,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={selected ? "default" : "outline"}
      size="sm"
      className={cn(
        "h-8 flex-1 text-xs font-medium transition-all",
        disabled && "pointer-events-none opacity-40",
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

export function SettingsPanel({
  open,
  onClose,
  language,
  onLanguageChange,
  languageOnly = false,
  theme,
  onThemeChange,
  colorScheme,
  onColorSchemeChange,
  fontFamily,
  onFontFamilyChange,
  layoutTemplate = "monolith",
  onLayoutTemplateChange,
  onAvatarChange,
}: SettingsPanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[55] bg-black/20 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-[56] w-80 border-l bg-background shadow-xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-full flex-col overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Settings</h2>
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close settings"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-col gap-6 px-5 py-5">
            {/* Language */}
            <div className="flex flex-col gap-2.5">
              <SectionLabel>Language</SectionLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <OptionButton
                    key={lang.code}
                    selected={language === lang.code}
                    onClick={() => onLanguageChange(lang.code)}
                  >
                    {lang.label}
                  </OptionButton>
                ))}
              </div>
            </div>

            {!languageOnly && (
              <>
                {/* Theme */}
                <div className="flex flex-col gap-2.5">
                  <SectionLabel>Theme</SectionLabel>
                  <OptionGroup>
                    {AVAILABLE_THEMES.map((t) => (
                      <OptionButton
                        key={t}
                        selected={theme === t}
                        onClick={() => onThemeChange(t)}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </OptionButton>
                    ))}
                  </OptionGroup>
                </div>

                {/* Color */}
                <div className="flex flex-col gap-2.5">
                  <SectionLabel>Color</SectionLabel>
                  <OptionGroup>
                    <OptionButton
                      selected={colorScheme === "light"}
                      onClick={() => onColorSchemeChange("light")}
                    >
                      Light
                    </OptionButton>
                    <OptionButton
                      selected={colorScheme === "dark"}
                      onClick={() => onColorSchemeChange("dark")}
                    >
                      Dark
                    </OptionButton>
                  </OptionGroup>
                </div>

                {/* Font */}
                <div className="flex flex-col gap-2.5">
                  <SectionLabel>Font</SectionLabel>
                  <OptionGroup>
                    {AVAILABLE_FONTS.map((f) => (
                      <OptionButton
                        key={f}
                        selected={fontFamily === f}
                        onClick={() => onFontFamilyChange(f)}
                      >
                        {FONT_LABELS[f]}
                      </OptionButton>
                    ))}
                  </OptionGroup>
                </div>

                {/* Layout */}
                <div className="flex flex-col gap-2.5">
                  <SectionLabel>Layout</SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LAYOUT_TEMPLATES.map((t) => {
                      const tmpl = getLayoutTemplate(t);
                      return (
                        <OptionButton
                          key={t}
                          selected={layoutTemplate === t}
                          onClick={() => onLayoutTemplateChange?.(t)}
                        >
                          {tmpl.name}
                        </OptionButton>
                      );
                    })}
                  </div>
                </div>

                {/* Avatar */}
                <div className="flex flex-col gap-2.5">
                  <SectionLabel>Avatar</SectionLabel>
                  <AvatarSection onAvatarChange={onAvatarChange} />
                </div>

                {/* Integrations */}
                <div className="flex flex-col gap-2.5">
                  <SectionLabel>Integrations</SectionLabel>
                  <ConnectorSection />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
