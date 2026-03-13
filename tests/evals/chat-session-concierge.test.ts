import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/lib/db before importing session-activity (which imports sqlite at module level)
vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
  },
  db: {},
}));

import { computeGreeting } from "@/lib/agent/greeting";
import { isSessionActive, getSessionTtlMinutes } from "@/lib/services/session-activity";

describe("Concierge Chat Model — Integration", () => {
  describe("greeting + session activity coordination", () => {
    it("expired session → greeting computed, isActive=false", () => {
      const oldTimestamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
      const active = isSessionActive(oldTimestamp, 120);
      expect(active).toBe(false);

      const greeting = computeGreeting({
        journeyState: "active_fresh",
        language: "it",
        userName: "Tommaso",
        lastSeenDaysAgo: 0,
        situations: [],
      });
      expect(greeting).toContain("Tommaso");
      expect(greeting).toContain("pagina");
    });

    it("active session → no new greeting needed", () => {
      const recentTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      const active = isSessionActive(recentTimestamp, 120);
      expect(active).toBe(true);
    });

    it("first_visit always gets hardcoded greeting regardless of activity", () => {
      const greeting = computeGreeting({
        journeyState: "first_visit",
        language: "de",
        userName: null,
        lastSeenDaysAgo: null,
        situations: [],
      });
      expect(greeting).toContain("Wie heißt du");
    });

    it("all 8 languages produce non-empty first_visit greeting", () => {
      const langs = ["en", "it", "de", "fr", "es", "pt", "ja", "zh"];
      for (const lang of langs) {
        const greeting = computeGreeting({
          journeyState: "first_visit",
          language: lang,
          userName: null,
          lastSeenDaysAgo: null,
          situations: [],
        });
        expect(greeting.length).toBeGreaterThan(10);
      }
    });

    it("all 6 journey states produce non-empty greeting", () => {
      const states = [
        "first_visit", "returning_no_page", "draft_ready",
        "active_fresh", "active_stale", "blocked",
      ] as const;
      for (const state of states) {
        const greeting = computeGreeting({
          journeyState: state,
          language: "en",
          userName: "Test",
          lastSeenDaysAgo: 5,
          situations: [],
        });
        expect(greeting.length).toBeGreaterThan(5);
      }
    });

    it("TTL defaults to 120 when env not set", () => {
      delete process.env.CHAT_SESSION_TTL_MINUTES;
      expect(getSessionTtlMinutes()).toBe(120);
    });
  });
});
