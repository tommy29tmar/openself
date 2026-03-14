import { describe, it, expect } from "vitest";
import { stableDeepEqual } from "@/lib/utils/stable-deep-equal";

describe("stableDeepEqual", () => {
  it("returns true for identical primitives", () => {
    expect(stableDeepEqual(1, 1)).toBe(true);
    expect(stableDeepEqual("hello", "hello")).toBe(true);
    expect(stableDeepEqual(null, null)).toBe(true);
    expect(stableDeepEqual(true, true)).toBe(true);
  });

  it("returns false for different primitives", () => {
    expect(stableDeepEqual(1, 2)).toBe(false);
    expect(stableDeepEqual("a", "b")).toBe(false);
    expect(stableDeepEqual(true, false)).toBe(false);
  });

  it("returns true for objects with same keys in different order", () => {
    expect(stableDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("returns false for objects with different values", () => {
    expect(stableDeepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("handles nested objects with key reordering", () => {
    const a = { outer: { b: 2, a: 1 }, name: "test" };
    const b = { name: "test", outer: { a: 1, b: 2 } };
    expect(stableDeepEqual(a, b)).toBe(true);
  });

  it("handles arrays", () => {
    expect(stableDeepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(stableDeepEqual([1, 2], [2, 1])).toBe(false);
  });

  it("handles arrays of objects", () => {
    const a = [{ b: 2, a: 1 }];
    const b = [{ a: 1, b: 2 }];
    expect(stableDeepEqual(a, b)).toBe(true);
  });
});
