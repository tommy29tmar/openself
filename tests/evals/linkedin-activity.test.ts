import { describe, it, expect } from "vitest";
import {
  mapCertificationsToEpisodic,
  mapArticlesToEpisodic,
} from "@/lib/connectors/linkedin-zip/activity-mapper";

describe("mapCertificationsToEpisodic", () => {
  it("maps certifications with dates to episodic events", () => {
    const rows = [
      {
        Name: "AWS Solutions Architect",
        "Started On": "Jan 2026",
        "Finished On": "Feb 2026",
        Authority: "Amazon",
      },
    ];
    const result = mapCertificationsToEpisodic(rows);
    expect(result.length).toBe(1);
    expect(result[0].actionType).toBe("certification");
    expect(result[0].source).toBe("linkedin");
    expect(result[0].narrativeSummary).toContain("AWS Solutions Architect");
    expect(result[0].narrativeSummary).toContain("Amazon");
    expect(result[0].eventAtUnix).toBeGreaterThan(0);
    expect(result[0].externalId).toMatch(/^li:cert:/);
  });

  it("uses Started On when Finished On is empty", () => {
    const rows = [
      {
        Name: "PMP",
        "Started On": "Jun 2021",
        "Finished On": "",
        Authority: "PMI",
      },
    ];
    const result = mapCertificationsToEpisodic(rows);
    expect(result.length).toBe(1);
    expect(result[0].actionType).toBe("certification");
    expect(result[0].narrativeSummary).toContain("PMP");
  });

  it("skips certifications without any dates", () => {
    const rows = [
      { Name: "No Date Cert", "Started On": "", "Finished On": "", Authority: "Test" },
    ];
    const result = mapCertificationsToEpisodic(rows);
    expect(result.length).toBe(0);
  });

  it("skips certifications without a name", () => {
    const rows = [
      { Name: "", "Started On": "Jan 2026", "Finished On": "", Authority: "X" },
    ];
    const result = mapCertificationsToEpisodic(rows);
    expect(result.length).toBe(0);
  });

  it("generates stable externalIds for dedup", () => {
    const rows = [
      {
        Name: "AWS Solutions Architect",
        "Started On": "Jan 2026",
        "Finished On": "Feb 2026",
        Authority: "Amazon",
      },
    ];
    const r1 = mapCertificationsToEpisodic(rows);
    const r2 = mapCertificationsToEpisodic(rows);
    expect(r1[0].externalId).toBe(r2[0].externalId);
  });

  it("truncates long narrativeSummary to 200 chars", () => {
    const rows = [
      {
        Name: "A".repeat(250),
        "Started On": "Jan 2026",
        "Finished On": "",
        Authority: "Test",
      },
    ];
    const result = mapCertificationsToEpisodic(rows);
    expect(result[0].narrativeSummary.length).toBeLessThanOrEqual(200);
  });

  it("handles multiple rows", () => {
    const rows = [
      { Name: "Cert A", "Started On": "Jan 2020", "Finished On": "", Authority: "Org1" },
      { Name: "Cert B", "Started On": "", "Finished On": "Mar 2021", Authority: "Org2" },
      { Name: "Cert C", "Started On": "", "Finished On": "", Authority: "Org3" },
    ];
    const result = mapCertificationsToEpisodic(rows);
    // Cert A and Cert B have dates, Cert C does not
    expect(result.length).toBe(2);
  });
});

describe("mapArticlesToEpisodic", () => {
  it("maps articles with dates to episodic events", () => {
    const rows = [
      {
        Title: "My Tech Journey",
        PublishedDate: "2026-01-15",
        Url: "https://linkedin.com/pulse/xyz",
      },
    ];
    const result = mapArticlesToEpisodic(rows);
    expect(result.length).toBe(1);
    expect(result[0].actionType).toBe("publication");
    expect(result[0].source).toBe("linkedin");
    expect(result[0].narrativeSummary).toContain("My Tech Journey");
    expect(result[0].externalId).toMatch(/^li:article:/);
  });

  it("skips articles without dates", () => {
    const rows = [
      { Title: "No Date Article", PublishedDate: "", Url: "https://example.com" },
    ];
    const result = mapArticlesToEpisodic(rows);
    expect(result.length).toBe(0);
  });

  it("skips articles without a title", () => {
    const rows = [
      { Title: "", PublishedDate: "2026-01-15", Url: "https://example.com" },
    ];
    const result = mapArticlesToEpisodic(rows);
    expect(result.length).toBe(0);
  });

  it("falls back to Date column if PublishedDate is missing", () => {
    const rows = [
      { Title: "Fallback Date", Date: "Jan 2025", Url: "" },
    ];
    const result = mapArticlesToEpisodic(rows);
    expect(result.length).toBe(1);
    expect(result[0].actionType).toBe("publication");
  });

  it("generates stable externalIds", () => {
    const rows = [
      { Title: "My Article", PublishedDate: "2026-01-15", Url: "https://linkedin.com/pulse/xyz" },
    ];
    const r1 = mapArticlesToEpisodic(rows);
    const r2 = mapArticlesToEpisodic(rows);
    expect(r1[0].externalId).toBe(r2[0].externalId);
  });
});
