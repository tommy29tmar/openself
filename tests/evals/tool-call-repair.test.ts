import { describe, it, expect } from "vitest";
import {
  stringifyToolArgsForRepair,
  stripMarkdownCodeFences,
} from "@/lib/agent/tool-call-repair";

describe("stringifyToolArgsForRepair", () => {
  it("passes strings through unchanged", () => {
    expect(stringifyToolArgsForRepair('{"ok":true}')).toBe('{"ok":true}');
  });

  it("returns empty string for undefined", () => {
    expect(stringifyToolArgsForRepair(undefined)).toBe("");
  });

  it("serializes plain objects", () => {
    expect(stringifyToolArgsForRepair({ ok: true })).toBe('{"ok":true}');
  });

  it("does not throw on circular objects", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => stringifyToolArgsForRepair(circular)).not.toThrow();
    expect(stringifyToolArgsForRepair(circular)).toBe("[object Object]");
  });
});

describe("stripMarkdownCodeFences", () => {
  it("removes fenced json wrappers", () => {
    expect(stripMarkdownCodeFences('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it("trims unfenced text safely", () => {
    expect(stripMarkdownCodeFences('  {"ok":true}  ')).toBe('{"ok":true}');
  });
});
