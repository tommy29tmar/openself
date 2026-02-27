import { describe, it, expect } from "vitest";
import { isSectionComplete } from "@/lib/page-config/section-completeness";
import type { Section } from "@/lib/page-config/schema";

describe("isSectionComplete — at-a-glance", () => {
  it("should be complete when stats are present", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { stats: [{ label: "repos", value: "47" }] },
    };
    expect(isSectionComplete(section)).toBe(true);
  });

  it("should be complete when skillGroups are present", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { skillGroups: [{ domain: "Frontend", skills: ["React"] }] },
    };
    expect(isSectionComplete(section)).toBe(true);
  });

  it("should be complete when interests are present", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { interests: [{ name: "open source" }] },
    };
    expect(isSectionComplete(section)).toBe(true);
  });

  it("should be incomplete when all arrays are empty", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { stats: [], skillGroups: [], interests: [] },
    };
    expect(isSectionComplete(section)).toBe(false);
  });

  it("should be incomplete when content has no recognized fields", () => {
    const section: Section = {
      id: "aag-1",
      type: "at-a-glance" as any,
      content: { title: "At a Glance" },
    };
    expect(isSectionComplete(section)).toBe(false);
  });
});
