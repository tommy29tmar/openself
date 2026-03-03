import { describe, it, expect } from "vitest";
import { getLane, getSpacingClass } from "@/components/layout-templates/MonolithLayout";

describe("MonolithLayout lanes", () => {
  it("assigns hero lane to hero section", () => {
    expect(getLane("hero")).toBe("hero");
  });
  it("assigns reading lane to bio", () => {
    expect(getLane("bio")).toBe("reading");
  });
  it("assigns bleed lane to projects", () => {
    expect(getLane("projects")).toBe("bleed");
  });
  it("assigns reading lane to skills (dense)", () => {
    expect(getLane("skills")).toBe("reading");
  });
  it("assigns hero lane to footer", () => {
    expect(getLane("footer")).toBe("hero");
  });
  it("defaults to reading for unknown types", () => {
    expect(getLane("unknown-type")).toBe("reading");
  });
});

describe("MonolithLayout spacing", () => {
  it("gives 80px (mb-20) after hero", () => {
    expect(getSpacingClass("hero", false)).toBe("mb-20");
  });
  it("gives 48px (mb-12) after bio", () => {
    expect(getSpacingClass("bio", false)).toBe("mb-12");
  });
  it("gives 32px (mb-8) after skills", () => {
    expect(getSpacingClass("skills", false)).toBe("mb-8");
  });
  it("gives 80px before footer (last section)", () => {
    expect(getSpacingClass("bio", true)).toBe("mb-20");
  });
});
