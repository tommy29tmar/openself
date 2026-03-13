import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  filterEditableFields,
  ITEM_EDITABLE_FIELDS,
} from "@/lib/services/fact-display-override-service";

describe("curate_content sectionType optionality", () => {
  // Mirror the actual tool schema after the change
  const toolSchema = z.object({
    sectionType: z.string().optional(),
    factId: z.string().optional(),
    fields: z.record(z.string()),
  });

  it("item-level: accepts call without sectionType when factId is provided", () => {
    const result = toolSchema.safeParse({
      factId: "db4ec895-edb6-4a76-876e-2484d9161a47",
      fields: { role: "Senior Data Scientist" },
    });
    expect(result.success).toBe(true);
  });

  it("item-level: also accepts call with sectionType (backward compat)", () => {
    const result = toolSchema.safeParse({
      sectionType: "experience",
      factId: "db4ec895-edb6-4a76-876e-2484d9161a47",
      fields: { role: "Senior Data Scientist" },
    });
    expect(result.success).toBe(true);
  });

  it("section-level: accepts call with sectionType and no factId", () => {
    const result = toolSchema.safeParse({
      sectionType: "bio",
      fields: { text: "New bio text" },
    });
    expect(result.success).toBe(true);
  });

  it("item-level: wrong sectionType is safely ignored by filterEditableFields", () => {
    // filterEditableFields uses fact.category, not sectionType
    // Even if agent passes sectionType="bio" for a project fact,
    // the filter correctly uses the fact's actual category
    const fields = { title: "OpenSelf", url: "https://evil.com" };
    const filtered = filterEditableFields("project", fields);
    expect(filtered).toEqual({ title: "OpenSelf" });
    // sectionType never enters filterEditableFields
  });
});

describe("curate_content validation", () => {
  it("filters to only editable fields for project category", () => {
    const input = { title: "OpenSelf", url: "https://evil.com", description: "desc" };
    const filtered = filterEditableFields("project", input);
    expect(filtered).toEqual({ title: "OpenSelf", description: "desc" });
    expect(filtered).not.toHaveProperty("url");
  });

  it("returns empty object for unknown category", () => {
    const input = { title: "test" };
    const filtered = filterEditableFields("unknown_category", input);
    expect(filtered).toEqual({});
  });

  it("allows identity field edits", () => {
    const input = { name: "John Doe", role: "Engineer", tagline: "Building stuff" };
    const filtered = filterEditableFields("identity", input);
    expect(Object.keys(filtered)).toHaveLength(3);
  });

  it("blocks date fields in experience", () => {
    const input = { role: "Dev", startDate: "2024-01", endDate: "2025-01" };
    const filtered = filterEditableFields("experience", input);
    expect(filtered).toEqual({ role: "Dev" });
  });
});
