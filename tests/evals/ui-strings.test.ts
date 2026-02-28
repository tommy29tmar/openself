import { describe, it, expect } from "vitest";
import { getUiL10n, type UiStrings } from "@/lib/i18n/ui-strings";

describe("UI L10N strings", () => {
  const REQUIRED_KEYS: (keyof UiStrings)[] = [
    "chat", "typeMessage", "send", "pageWillAppear", "startChatting",
    "openSettings", "closeSettings",
    "settings", "language", "theme", "color", "light", "dark", "font", "layout",
    "signUpToPublish", "publish", "publishAs", "publishing", "livePage",
    "editYourPage", "share", "logOut", "loggingOut", "logIn",
    "createYourAccount", "signUpToPublishPage", "username", "email",
    "password", "atLeast8Chars", "signUpAndPublish", "alreadyHaveAccount",
    "usernameRequired", "emailRequired", "passwordTooShort",
    "registrationFailed", "networkError",
    "improvementsReady", "review", "pageImprovements",
    "current", "proposed", "accept", "reject", "acceptAll",
    // Activity frequencies (F6)
    "freqDaily", "freqWeekly", "freqMonthly", "freqBiweekly",
    "freqFrequent", "freqRegularly", "freqOccasionally",
    // Skill domains (F9)
    "domainFrontend", "domainBackend", "domainInfra", "domainLanguages",
    "domainAiMl", "domainDesign", "domainOther",
    // Platform (F17/F22)
    "platformWebsite",
  ];

  for (const lang of ["en", "it", "de", "fr", "es", "pt", "ja", "zh"] as const) {
    it(`${lang}: all required keys present and non-empty`, () => {
      const strings = getUiL10n(lang);
      for (const key of REQUIRED_KEYS) {
        expect(strings[key], `${lang}: missing or empty '${key}'`).toBeTruthy();
      }
    });
  }

  it("falls back to English for unknown language", () => {
    const strings = getUiL10n("xx" as never);
    expect(strings.send).toBe("Send");
  });

  it("Italian strings are in Italian", () => {
    const strings = getUiL10n("it");
    expect(strings.send).toBe("Invia");
    expect(strings.settings).toBe("Impostazioni");
  });
});
