import { describe, expect, it } from "vitest";
import { canMutateSection, extractLocks } from "@/lib/layout/lock-policy";
import type { Section, SectionLock } from "@/lib/page-config/schema";

function makeSection(lock?: SectionLock): Section {
  return {
    id: "s1",
    type: "skills",
    content: {},
    lock,
  };
}

describe("canMutateSection", () => {
  it("allows mutation when no lock present", () => {
    const section = makeSection();
    expect(canMutateSection(section, "position", "agent").allowed).toBe(true);
    expect(canMutateSection(section, "widget", "heartbeat").allowed).toBe(true);
    expect(canMutateSection(section, "content", "composer").allowed).toBe(true);
  });

  describe("user lock", () => {
    const lock: SectionLock = {
      position: true,
      widget: true,
      content: true,
      lockedBy: "user",
      lockedAt: new Date().toISOString(),
      reason: "User chose this",
    };

    it("blocks agent from all mutations", () => {
      const section = makeSection(lock);
      expect(canMutateSection(section, "position", "agent").allowed).toBe(false);
      expect(canMutateSection(section, "widget", "agent").allowed).toBe(false);
      expect(canMutateSection(section, "content", "agent").allowed).toBe(false);
    });

    it("blocks heartbeat from all mutations", () => {
      const section = makeSection(lock);
      expect(canMutateSection(section, "position", "heartbeat").allowed).toBe(false);
      expect(canMutateSection(section, "widget", "heartbeat").allowed).toBe(false);
      expect(canMutateSection(section, "content", "heartbeat").allowed).toBe(false);
    });

    it("allows user to override own lock", () => {
      const section = makeSection(lock);
      expect(canMutateSection(section, "position", "user").allowed).toBe(true);
      expect(canMutateSection(section, "widget", "user").allowed).toBe(true);
      expect(canMutateSection(section, "content", "user").allowed).toBe(true);
    });

    it("blocks composer from locked mutations", () => {
      const section = makeSection(lock);
      expect(canMutateSection(section, "position", "composer").allowed).toBe(false);
    });
  });

  describe("agent lock", () => {
    const lock: SectionLock = {
      position: true,
      widget: true,
      content: false,
      lockedBy: "agent",
      lockedAt: new Date().toISOString(),
    };

    it("allows user to override", () => {
      const section = makeSection(lock);
      expect(canMutateSection(section, "position", "user").allowed).toBe(true);
    });

    it("allows agent to override own lock", () => {
      const section = makeSection(lock);
      expect(canMutateSection(section, "position", "agent").allowed).toBe(true);
    });

    it("blocks heartbeat from locked position/widget", () => {
      const section = makeSection(lock);
      expect(canMutateSection(section, "position", "heartbeat").allowed).toBe(false);
      expect(canMutateSection(section, "widget", "heartbeat").allowed).toBe(false);
    });

    it("allows heartbeat for unlocked content", () => {
      const section = makeSection(lock);
      expect(canMutateSection(section, "content", "heartbeat").allowed).toBe(true);
    });
  });

  describe("granular locks", () => {
    it("only blocks the locked mutation kind", () => {
      const lock: SectionLock = {
        position: true,
        widget: false,
        content: false,
        lockedBy: "user",
        lockedAt: new Date().toISOString(),
      };
      const section = makeSection(lock);
      expect(canMutateSection(section, "position", "agent").allowed).toBe(false);
      expect(canMutateSection(section, "widget", "agent").allowed).toBe(true);
      expect(canMutateSection(section, "content", "agent").allowed).toBe(true);
    });
  });
});

describe("extractLocks", () => {
  it("extracts locks from sections into a map", () => {
    const lock: SectionLock = {
      position: true,
      lockedBy: "user",
      lockedAt: new Date().toISOString(),
    };
    const sections: Section[] = [
      { id: "s1", type: "skills", content: {}, lock },
      { id: "s2", type: "bio", content: {} },
    ];
    const map = extractLocks(sections);
    expect(map.size).toBe(1);
    expect(map.get("s1")).toEqual(lock);
    expect(map.has("s2")).toBe(false);
  });
});
