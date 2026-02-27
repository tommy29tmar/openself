import { describe, it, expect } from "vitest";
import {
  sectionCopyCache,
  sectionCopyState,
  sectionCopyProposals,
} from "@/lib/db/schema";

describe("section copy schema tables", () => {
  it("sectionCopyCache has expected columns", () => {
    const cols = Object.keys(sectionCopyCache);
    expect(cols).toContain("ownerKey");
    expect(cols).toContain("sectionType");
    expect(cols).toContain("factsHash");
    expect(cols).toContain("soulHash");
    expect(cols).toContain("language");
    expect(cols).toContain("personalizedContent");
  });

  it("sectionCopyState has expected columns", () => {
    const cols = Object.keys(sectionCopyState);
    expect(cols).toContain("ownerKey");
    expect(cols).toContain("sectionType");
    expect(cols).toContain("factsHash");
    expect(cols).toContain("soulHash");
    expect(cols).toContain("source");
    expect(cols).toContain("approvedAt");
  });

  it("sectionCopyProposals has expected columns", () => {
    const cols = Object.keys(sectionCopyProposals);
    expect(cols).toContain("ownerKey");
    expect(cols).toContain("proposedContent");
    expect(cols).toContain("issueType");
    expect(cols).toContain("severity");
    expect(cols).toContain("status");
    expect(cols).toContain("baselineStateHash");
  });
});
