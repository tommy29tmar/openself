import { describe, it, expect } from "vitest";
import { getLane } from "@/components/layout-templates/MonolithLayout";

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
