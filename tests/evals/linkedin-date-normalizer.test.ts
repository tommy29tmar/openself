import { describe, it, expect } from "vitest";
import { normalizeLinkedInDate } from "@/lib/connectors/linkedin-zip/date-normalizer";

describe("normalizeLinkedInDate", () => {
  // Standard LinkedIn formats
  it("parses 'Apr 2024' → '2024-04'", () => {
    expect(normalizeLinkedInDate("Apr 2024")).toBe("2024-04");
  });
  it("parses 'Jan 2020' → '2020-01'", () => {
    expect(normalizeLinkedInDate("Jan 2020")).toBe("2020-01");
  });
  it("parses 'Dec 2019' → '2019-12'", () => {
    expect(normalizeLinkedInDate("Dec 2019")).toBe("2019-12");
  });

  // Full date formats
  it("parses '2016-10-26 10:15 UTC' → '2016-10-26'", () => {
    expect(normalizeLinkedInDate("2016-10-26 10:15 UTC")).toBe("2016-10-26");
  });
  it("parses '11 Feb 2026' → '2026-02-11'", () => {
    expect(normalizeLinkedInDate("11 Feb 2026")).toBe("2026-02-11");
  });
  it("parses '2/9/26, 2:53 PM' → '2026-02-09'", () => {
    expect(normalizeLinkedInDate("2/9/26, 2:53 PM")).toBe("2026-02-09");
  });

  // Year-only
  it("parses '2022' → '2022'", () => {
    expect(normalizeLinkedInDate("2022")).toBe("2022");
  });

  // Edge cases
  it("returns null for empty string", () => {
    expect(normalizeLinkedInDate("")).toBeNull();
  });
  it("returns null for whitespace", () => {
    expect(normalizeLinkedInDate("   ")).toBeNull();
  });
  it("returns null for garbage input", () => {
    expect(normalizeLinkedInDate("not a date")).toBeNull();
  });
  it("returns null for 'YYYY' placeholder", () => {
    expect(normalizeLinkedInDate("YYYY")).toBeNull();
  });
  it("returns null for 'YYYY-MM-DD' placeholder", () => {
    expect(normalizeLinkedInDate("YYYY-MM-DD")).toBeNull();
  });
  it("returns null for null", () => {
    expect(normalizeLinkedInDate(null)).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(normalizeLinkedInDate(undefined)).toBeNull();
  });
  it("handles leading/trailing whitespace", () => {
    expect(normalizeLinkedInDate("  Apr 2024  ")).toBe("2024-04");
  });
  it("parses single-digit day '5 Mar 2023' → '2023-03-05'", () => {
    expect(normalizeLinkedInDate("5 Mar 2023")).toBe("2023-03-05");
  });
  // US short with 1900s
  it("parses '1/15/98' → '1998-01-15'", () => {
    expect(normalizeLinkedInDate("1/15/98")).toBe("1998-01-15");
  });
});
