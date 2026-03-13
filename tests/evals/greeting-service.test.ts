import { describe, it, expect } from "vitest";
import { computeGreeting } from "@/lib/agent/greeting";

describe("computeGreeting", () => {
  it("returns hardcoded first_visit greeting per language", () => {
    const result = computeGreeting({
      journeyState: "first_visit",
      language: "it",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("Come ti chiami");
  });

  it("returns first_visit greeting in English", () => {
    const result = computeGreeting({
      journeyState: "first_visit",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("What's your name");
  });

  it("returns returning_no_page greeting with name", () => {
    const result = computeGreeting({
      journeyState: "returning_no_page",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 2,
      situations: [],
    });
    expect(result).toContain("Tommaso");
    expect(result).toContain("Riprendiamo");
  });

  it("returns returning_no_page greeting without name", () => {
    const result = computeGreeting({
      journeyState: "returning_no_page",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("Welcome back");
    expect(result).not.toContain("null");
  });

  it("returns draft_ready greeting", () => {
    const result = computeGreeting({
      journeyState: "draft_ready",
      language: "en",
      userName: "Alice",
      lastSeenDaysAgo: 1,
      situations: [],
    });
    expect(result).toContain("Alice");
    expect(result).toContain("page");
  });

  it("returns active_fresh greeting", () => {
    const result = computeGreeting({
      journeyState: "active_fresh",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 0,
      situations: [],
    });
    expect(result).toContain("Tommaso");
  });

  it("returns active_stale greeting for short absence (<30 days)", () => {
    const result = computeGreeting({
      journeyState: "active_stale",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 10,
      situations: [],
    });
    expect(result).toContain("Tommaso");
  });

  it("returns active_stale greeting for long absence (>=30 days)", () => {
    const result = computeGreeting({
      journeyState: "active_stale",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 45,
      situations: [],
    });
    expect(result).toContain("Tommaso");
    expect(result).toContain("mese");
  });

  it("returns blocked greeting", () => {
    const result = computeGreeting({
      journeyState: "blocked",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("limit");
  });

  it("appends sparse profile hint when situation active", () => {
    const result = computeGreeting({
      journeyState: "active_fresh",
      language: "it",
      userName: "Tommaso",
      lastSeenDaysAgo: 0,
      situations: ["has_sparse_profile"],
    });
    expect(result).toContain("dettagli");
  });

  it("appends pending proposals hint when situation active", () => {
    const result = computeGreeting({
      journeyState: "active_fresh",
      language: "en",
      userName: "Alice",
      lastSeenDaysAgo: 0,
      situations: ["has_pending_soul_proposals"],
    });
    expect(result).toContain("proposal");
  });

  it("appends pending episodic patterns hint when situation active", () => {
    const result = computeGreeting({
      journeyState: "active_fresh",
      language: "en",
      userName: "Alice",
      lastSeenDaysAgo: 0,
      situations: ["has_pending_episodic_patterns"],
    });
    expect(result).toContain("patterns");
  });

  it("does not append situation hints to first_visit", () => {
    const result = computeGreeting({
      journeyState: "first_visit",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: ["has_sparse_profile"],
    });
    expect(result).not.toContain("detail");
  });

  it("does not append situation hints to blocked", () => {
    const result = computeGreeting({
      journeyState: "blocked",
      language: "en",
      userName: null,
      lastSeenDaysAgo: null,
      situations: ["has_sparse_profile"],
    });
    expect(result).not.toContain("detail");
  });

  it("falls back to en for unsupported language", () => {
    const result = computeGreeting({
      journeyState: "first_visit",
      language: "xx",
      userName: null,
      lastSeenDaysAgo: null,
      situations: [],
    });
    expect(result).toContain("What's your name");
  });
});
