import { describe, it, expect } from "vitest";
import { splitItems } from "@/components/page/CollapsibleList";

describe("CollapsibleList splitItems helper", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("visible = slice(0, visibleCount)", () => {
    const { visible } = splitItems(items, 2);
    expect(visible).toEqual(["a", "b"]);
  });

  it("hidden = slice(visibleCount)", () => {
    const { hidden } = splitItems(items, 2);
    expect(hidden).toEqual(["c", "d", "e"]);
  });

  it("hidden.length = items.length - visibleCount", () => {
    const { hidden } = splitItems(items, 2);
    expect(hidden.length).toBe(3);
  });

  it("no accordion when items.length <= visibleCount", () => {
    const { hidden } = splitItems(["a", "b"], 2);
    expect(hidden.length).toBe(0);
  });

  it("all visible when visibleCount >= items.length", () => {
    const { visible, hidden } = splitItems(["a", "b"], 10);
    expect(visible).toEqual(["a", "b"]);
    expect(hidden).toEqual([]);
  });
});
