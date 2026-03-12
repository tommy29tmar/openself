import { describe, it, expect } from "vitest";
import {
  filterEditableFields,
  ITEM_EDITABLE_FIELDS,
} from "@/lib/services/fact-display-override-service";

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
