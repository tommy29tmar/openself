import { describe, it, expect } from "vitest";
import { parseLinkedInCsv } from "@/lib/connectors/linkedin-zip/parser";

describe("parseLinkedInCsv", () => {
  it("parses clean CSV with headers", () => {
    const csv = "Name,Title\nAlice,Engineer\nBob,Designer";
    const rows = parseLinkedInCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Name: "Alice", Title: "Engineer" });
    expect(rows[1]).toEqual({ Name: "Bob", Title: "Designer" });
  });

  it("handles BOM", () => {
    const csv = "\uFEFFName,Title\nAlice,Engineer";
    const rows = parseLinkedInCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe("Alice");
  });

  it("handles preamble rows", () => {
    const csv =
      "Notes: Some metadata about connections\nFirst Name,Last Name,Company\nJohn,Doe,Acme";
    const rows = parseLinkedInCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]["First Name"]).toBe("John");
  });

  it("handles multiline quoted fields", () => {
    const csv = 'Name,Bio\nAlice,"I am a\nmultiline\nbio"';
    const rows = parseLinkedInCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Bio).toContain("\n");
  });

  it("returns empty array for empty file", () => {
    expect(parseLinkedInCsv("")).toEqual([]);
  });

  it("returns empty array for header-only file", () => {
    const csv = "Name,Title\n";
    const rows = parseLinkedInCsv(csv);
    expect(rows).toHaveLength(0);
  });

  it("handles comment-style preamble", () => {
    const csv = "# This is a comment\nName,Title\nAlice,Engineer";
    const rows = parseLinkedInCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe("Alice");
  });

  it("trims whitespace from values", () => {
    const csv = "Name, Title \n Alice , Engineer ";
    const rows = parseLinkedInCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe("Alice");
    expect(rows[0].Title).toBe("Engineer");
  });
});
