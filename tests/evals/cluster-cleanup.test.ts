import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("cluster cleanup integration", () => {
  const purgeSrc = readFileSync(
    resolve(__dirname, "../../src/lib/connectors/connector-purge.ts"),
    "utf-8",
  );
  const heartbeatSrc = readFileSync(
    resolve(__dirname, "../../src/lib/worker/heartbeat.ts"),
    "utf-8",
  );

  it("connector-purge clears single-member cluster_ids", () => {
    expect(purgeSrc).toContain("UPDATE facts SET cluster_id = NULL");
    expect(purgeSrc).toContain("HAVING COUNT(f.id) <= 1");
  });

  it("connector-purge deletes empty clusters", () => {
    expect(purgeSrc).toContain("DELETE FROM fact_clusters");
    expect(purgeSrc).toContain("owner_key = ?");
  });

  it("global housekeeping cleans up empty clusters", () => {
    expect(heartbeatSrc).toContain("cluster_cleanup");
    expect(heartbeatSrc).toContain("DELETE FROM fact_clusters");
  });

  it("global housekeeping dissolves single-member clusters", () => {
    expect(heartbeatSrc).toContain("HAVING COUNT(f.id) <= 1");
  });
});
