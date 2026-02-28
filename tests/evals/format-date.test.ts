import { describe, it, expect } from "vitest";
import { formatFactDate } from "@/lib/i18n/format-date";

describe("formatFactDate", () => {
  it("shows year only for YYYY-01-01 dates", () => {
    expect(formatFactDate("2023-01-01", "en")).toBe("2023");
    expect(formatFactDate("2023-01-01", "it")).toBe("2023");
  });

  it("shows month + year in English", () => {
    expect(formatFactDate("2023-03-15", "en")).toBe("March 2023");
  });

  it("shows month + year in Italian", () => {
    expect(formatFactDate("2023-03-15", "it")).toBe("marzo 2023");
  });

  it("handles YYYY-MM format", () => {
    expect(formatFactDate("2023-03", "it")).toBe("marzo 2023");
  });

  it("handles plain year", () => {
    expect(formatFactDate("2023", "en")).toBe("2023");
  });

  it("passes through non-date strings", () => {
    expect(formatFactDate("Ongoing", "en")).toBe("Ongoing");
    expect(formatFactDate("", "en")).toBe("");
  });

  it("handles German month names", () => {
    expect(formatFactDate("2023-03-15", "de")).toBe("März 2023");
  });
});
