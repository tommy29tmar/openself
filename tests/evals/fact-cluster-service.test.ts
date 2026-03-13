import { describe, it, expect } from "vitest";
import {
  slugifyForMatch,
  identityMatch,
} from "@/lib/services/fact-cluster-service";

// ---------------------------------------------------------------------------
// slugifyForMatch
// ---------------------------------------------------------------------------

describe("slugifyForMatch", () => {
  it("normalizes accented characters", () => {
    expect(slugifyForMatch("Politécnico de Milano")).toBe(
      "politecnico-de-milano"
    );
  });

  it("normalizes case and whitespace", () => {
    expect(slugifyForMatch("  Senior Software  Engineer  ")).toBe(
      "senior-software-engineer"
    );
  });

  it("strips special characters", () => {
    expect(slugifyForMatch("C++ & C#")).toBe("c-c");
  });

  it("returns empty string for nullish input", () => {
    expect(slugifyForMatch(undefined)).toBe("");
    expect(slugifyForMatch(null)).toBe("");
    expect(slugifyForMatch("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// identityMatch
// ---------------------------------------------------------------------------

describe("identityMatch", () => {
  // education
  it("does NOT match education with different degrees", () => {
    const a = { institution: "Politecnico di Milano", degree: "Laurea", field: "Informatica" };
    const b = { institution: "Politécnico di Milano", degree: "Laurea Magistrale" };
    expect(identityMatch("education", a, b)).toBe(false);
  });

  it("matches education with same institution and degree slug", () => {
    const a = { institution: "MIT", degree: "MSc" };
    const b = { institution: "MIT", degree: "MSc", field: "Computer Science", startDate: "2015" };
    expect(identityMatch("education", a, b)).toBe(true);
  });

  // skill
  it("matches skill by name case-insensitive", () => {
    expect(
      identityMatch("skill", { name: "TypeScript" }, { name: "typescript" })
    ).toBe(true);
  });

  // experience
  it("matches experience by company + role", () => {
    const a = { company: "Google", role: "Software Engineer" };
    const b = { company: "Google", role: "Software Engineer", startDate: "2020" };
    expect(identityMatch("experience", a, b)).toBe(true);
  });

  it("does NOT match experience with different roles at same company", () => {
    expect(
      identityMatch(
        "experience",
        { company: "Google", role: "Software Engineer" },
        { company: "Google", role: "Tech Lead" }
      )
    ).toBe(false);
  });

  // social
  it("matches social by platform", () => {
    expect(
      identityMatch(
        "social",
        { platform: "github", url: "https://github.com/user1" },
        { platform: "GitHub", url: "https://github.com/user2" }
      )
    ).toBe(true);
  });

  // music
  it("matches music by title + artist", () => {
    expect(
      identityMatch(
        "music",
        { title: "Bohemian Rhapsody", artist: "Queen" },
        { title: "Bohemian Rhapsody", artist: "Queen", url: "https://..." }
      )
    ).toBe(true);
  });

  it("does NOT match music with different artists", () => {
    expect(
      identityMatch(
        "music",
        { title: "Yesterday", artist: "The Beatles" },
        { title: "Yesterday", artist: "Leona Lewis" }
      )
    ).toBe(false);
  });

  // identity
  it("returns false for identity category (skip)", () => {
    expect(
      identityMatch("identity", { name: "Tommaso Rossi" }, { name: "Tommaso Rossi" })
    ).toBe(false);
  });

  // project
  it("matches project by name", () => {
    expect(
      identityMatch(
        "project",
        { name: "OpenSelf", url: "https://github.com/openself" },
        { name: "openself" }
      )
    ).toBe(true);
  });

  it("matches project by url when names differ", () => {
    expect(
      identityMatch(
        "project",
        { name: "My Project", url: "https://github.com/openself" },
        { name: "OpenSelf", url: "https://github.com/openself" }
      )
    ).toBe(true);
  });

  // language
  it("matches language by language field or name", () => {
    expect(
      identityMatch(
        "language",
        { language: "Spanish", proficiency: "fluent" },
        { name: "Spanish" }
      )
    ).toBe(true);
  });

  // activity
  it("matches activity by name", () => {
    expect(
      identityMatch(
        "activity",
        { name: "Running", type: "sport" },
        { name: "running", activityCount: 5 }
      )
    ).toBe(true);
  });

  // reading
  it("does NOT match reading with different author slugs", () => {
    expect(
      identityMatch(
        "reading",
        { title: "Clean Code", author: "Robert Martin" },
        { title: "Clean Code", author: "Robert C. Martin", rating: 5 }
      )
    ).toBe(false);
  });

  it("matches reading with identical author slug", () => {
    expect(
      identityMatch(
        "reading",
        { title: "Clean Code", author: "Robert Martin" },
        { title: "Clean Code", author: "Robert Martin" }
      )
    ).toBe(true);
  });

  // stat
  it("matches stat by label", () => {
    expect(
      identityMatch(
        "stat",
        { label: "Years Experience", value: "10+" },
        { label: "years experience", value: "12" }
      )
    ).toBe(true);
  });

  // contact
  it("matches contact by type + value", () => {
    expect(
      identityMatch(
        "contact",
        { type: "email", value: "me@example.com" },
        { type: "email", value: "me@example.com", label: "Work" }
      )
    ).toBe(true);
  });

  it("does NOT match contact with different values", () => {
    expect(
      identityMatch(
        "contact",
        { type: "email", value: "me@example.com" },
        { type: "email", value: "other@example.com" }
      )
    ).toBe(false);
  });

  // achievement
  it("matches achievement by title", () => {
    expect(
      identityMatch(
        "achievement",
        { title: "AWS Solutions Architect" },
        { title: "AWS Solutions Architect", issuer: "Amazon", date: "2023" }
      )
    ).toBe(true);
  });

  // unknown
  it("returns false for unknown categories", () => {
    expect(identityMatch("unknown_cat", { x: 1 }, { x: 1 })).toBe(false);
  });
});
