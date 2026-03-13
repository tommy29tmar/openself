import { describe, it, expect } from "vitest";
import {
  stringifyToolArgsForRepair,
  stripMarkdownCodeFences,
  repairJsonValue,
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

describe("repairJsonValue", () => {
  it("fixes unquoted keys with quoted values (most common LLM case)", () => {
    const result = JSON.parse(repairJsonValue('{role: "designer"}'));
    expect(result).toEqual({ role: "designer" });
  });

  it("fixes unquoted string values", () => {
    const result = JSON.parse(repairJsonValue('{"role": sound designer}'));
    expect(result).toEqual({ role: "sound designer" });
  });

  it("fixes both unquoted keys and values", () => {
    const result = JSON.parse(repairJsonValue("{role: sound designer, company: Acme}"));
    expect(result).toEqual({ role: "sound designer", company: "Acme" });
  });

  it("fixes unquoted keys with multiple already-quoted values", () => {
    const result = JSON.parse(repairJsonValue('{role: "sound designer", company: "Milestone"}'));
    expect(result).toEqual({ role: "sound designer", company: "Milestone" });
  });

  it("passes valid JSON through unchanged", () => {
    const valid = '{"role":"designer","company":"Acme"}';
    expect(repairJsonValue(valid)).toBe(valid);
  });

  it("preserves numeric values", () => {
    const result = JSON.parse(repairJsonValue("{count: 42}"));
    expect(result).toEqual({ count: 42 });
  });

  it("preserves negative numeric values", () => {
    const result = JSON.parse(repairJsonValue("{offset: -5}"));
    expect(result).toEqual({ offset: -5 });
  });

  it("preserves boolean values", () => {
    const result = JSON.parse(repairJsonValue("{active: true}"));
    expect(result).toEqual({ active: true });
  });

  it("preserves null values", () => {
    const result = JSON.parse(repairJsonValue("{end: null}"));
    expect(result).toEqual({ end: null });
  });

  it("returns original if repair fails", () => {
    const garbage = "not json at all";
    expect(repairJsonValue(garbage)).toBe(garbage);
  });
});
