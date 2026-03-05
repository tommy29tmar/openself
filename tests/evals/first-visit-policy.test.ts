import { describe, it, expect } from "vitest";
import { firstVisitPolicy } from "@/lib/agent/policies/first-visit";
import { SPARSE_PROFILE_FACT_THRESHOLD } from "@/lib/agent/thresholds";

describe("firstVisitPolicy", () => {
  it("keeps the Phase C gate aligned with the sparse-profile threshold", () => {
    const policy = firstVisitPolicy("en");
    expect(policy).toContain(`${SPARSE_PROFILE_FACT_THRESHOLD} distinct publishable facts`);
    expect(policy).not.toContain("at least 6 distinct facts");
  });
});
