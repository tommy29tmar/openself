import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { page, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getHiddenSections,
  toggleSectionVisibility,
} from "@/lib/services/section-visibility-service";

function seedSession(id: string) {
  db.insert(sessions)
    .values({ id, inviteCode: "test" })
    .onConflictDoNothing()
    .run();
}

function seedDraftPage(id: string) {
  seedSession(id);
  // Insert a minimal draft page row
  db.insert(page)
    .values({
      id,
      sessionId: id,
      username: "test-user",
      config: JSON.stringify({
        version: 1,
        username: "test-user",
        surface: "canvas",
        voice: "signal",
        light: "day",
        style: { primaryColor: "#111", layout: "centered" },
        sections: [],
      }),
      status: "draft",
    })
    .run();
}

function cleanup(id: string) {
  db.delete(page).where(eq(page.id, id)).run();
}

describe("section-visibility-service", () => {
  const PAGE_ID = "__test_vis__";

  beforeEach(() => {
    cleanup(PAGE_ID);
    seedDraftPage(PAGE_ID);
  });

  describe("getHiddenSections", () => {
    it("returns empty array for page with no hidden sections", () => {
      expect(getHiddenSections(PAGE_ID)).toEqual([]);
    });

    it("returns empty array for non-existent page", () => {
      expect(getHiddenSections("nonexistent")).toEqual([]);
    });

    it("returns hidden sections when set", () => {
      db.update(page)
        .set({ hiddenSections: JSON.stringify(["skills", "education"]) })
        .where(eq(page.id, PAGE_ID))
        .run();

      expect(getHiddenSections(PAGE_ID)).toEqual(["skills", "education"]);
    });

    it("handles corrupted JSON gracefully", () => {
      db.update(page)
        .set({ hiddenSections: "not-json" })
        .where(eq(page.id, PAGE_ID))
        .run();

      expect(getHiddenSections(PAGE_ID)).toEqual([]);
    });
  });

  describe("toggleSectionVisibility", () => {
    it("hides a section", () => {
      const result = toggleSectionVisibility(PAGE_ID, "skills", false);
      expect(result).toContain("skills");

      // Verify persistence
      expect(getHiddenSections(PAGE_ID)).toContain("skills");
    });

    it("shows a hidden section", () => {
      toggleSectionVisibility(PAGE_ID, "skills", false);
      const result = toggleSectionVisibility(PAGE_ID, "skills", true);
      expect(result).not.toContain("skills");
      expect(getHiddenSections(PAGE_ID)).not.toContain("skills");
    });

    it("is idempotent — hiding already hidden section", () => {
      toggleSectionVisibility(PAGE_ID, "skills", false);
      const result = toggleSectionVisibility(PAGE_ID, "skills", false);
      // Should have exactly one "skills", not duplicated
      expect(result.filter(s => s === "skills").length).toBe(1);
    });

    it("is idempotent — showing already visible section", () => {
      const result = toggleSectionVisibility(PAGE_ID, "skills", true);
      expect(result).toEqual([]);
    });

    it("can hide multiple sections independently", () => {
      toggleSectionVisibility(PAGE_ID, "skills", false);
      toggleSectionVisibility(PAGE_ID, "education", false);
      const hidden = getHiddenSections(PAGE_ID);
      expect(hidden).toContain("skills");
      expect(hidden).toContain("education");
    });

    it("can show one while keeping others hidden", () => {
      toggleSectionVisibility(PAGE_ID, "skills", false);
      toggleSectionVisibility(PAGE_ID, "education", false);
      toggleSectionVisibility(PAGE_ID, "skills", true);
      const hidden = getHiddenSections(PAGE_ID);
      expect(hidden).not.toContain("skills");
      expect(hidden).toContain("education");
    });
  });
});
