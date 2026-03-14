import { describe, it, expect } from "vitest";
import { getToolToastMessage, TOOL_TOAST_MESSAGES } from "@/lib/i18n/tool-toast-messages";

describe("getToolToastMessage", () => {
  it("returns English message for known tool", () => {
    expect(getToolToastMessage("create_fact", "en")).toBe("Fact added");
  });

  it("returns localized message for known tool and language", () => {
    expect(getToolToastMessage("create_fact", "it")).toBe("Informazione aggiunta");
    expect(getToolToastMessage("generate_page", "de")).toBe("Seite generiert");
  });

  it("falls back to English for unknown language", () => {
    expect(getToolToastMessage("create_fact", "xx")).toBe("Fact added");
  });

  it("returns undefined for unknown tool", () => {
    expect(getToolToastMessage("unknown_tool", "en")).toBeUndefined();
  });

  it("has all 8 languages for every tool", () => {
    const expectedLangs = ["en", "it", "de", "fr", "es", "pt", "ja", "zh"];
    for (const [toolName, msgs] of Object.entries(TOOL_TOAST_MESSAGES)) {
      for (const lang of expectedLangs) {
        expect(msgs[lang], `Missing ${lang} for ${toolName}`).toBeTruthy();
      }
    }
  });
});
