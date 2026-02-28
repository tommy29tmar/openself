import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural test: verifies that createFact's onConflictDoUpdate block
 * includes visibility with a conditional guard that only upgrades from
 * "private" and never downgrades user-set "public" or "proposed".
 *
 * This is a structural (source-reading) test because Drizzle upsert chains
 * are too complex to mock behaviorally without a real DB.
 */
const kbServicePath = path.resolve(
  __dirname,
  "../../src/lib/services/kb-service.ts",
);
const kbServiceSource = fs.readFileSync(kbServicePath, "utf-8");

describe("createFact onConflictDoUpdate includes visibility", () => {
  // Extract the onConflictDoUpdate block
  const upsertMatch = kbServiceSource.match(
    /\.onConflictDoUpdate\(\{[\s\S]*?\}\s*\)/,
  );

  it("has an onConflictDoUpdate block", () => {
    expect(upsertMatch).not.toBeNull();
  });

  const upsertBlock = upsertMatch?.[0] ?? "";

  it("includes visibility in the set block", () => {
    expect(upsertBlock).toContain("visibility:");
  });

  it("uses a CASE WHEN guard that only upgrades from private", () => {
    // The SQL expression should check the existing row's visibility
    // and only apply the new value when the existing is 'private'
    expect(upsertBlock).toMatch(/CASE\s+WHEN/);
    expect(upsertBlock).toMatch(/['"]private['"]/);
    expect(upsertBlock).toContain("ELSE");
  });

  it("references facts.visibility for the existing row value", () => {
    // The ELSE branch should keep the existing visibility unchanged
    expect(upsertBlock).toContain("facts.visibility");
  });
});
