import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { writeImportEvent, consumeImportEvent, markImportEventConsumed, revertImportEvent } from "@/lib/connectors/import-event";
import { analyzeImportGaps } from "@/lib/connectors/import-gap-analyzer";
import { detectSituations } from "@/lib/agent/journey";
import { getSituationDirectives } from "@/lib/agent/policies";

function createTestSession(id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
  db.insert(sessions).values({ id, inviteCode: "test" }).run();
}

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "experience",
    key: `k-${Math.random().toString(36).slice(2, 8)}`,
    value: {},
    source: "connector",
    confidence: 1,
    visibility: "public",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("import reaction pipeline (unit-level)", () => {
  const s1 = "test-pipeline-" + randomUUID().slice(0, 8);
  const s2 = "test-pipeline-" + randomUUID().slice(0, 8);

  beforeEach(() => {
    createTestSession(s1);
    createTestSession(s2);
  });

  it("full pipeline: write flag → detect situation → consume → analyze → directive", () => {
    // 1. Write flag (simulates import route)
    writeImportEvent(s1, 15);

    // 2. Create in-memory facts (simulates imported data)
    // Note: must have >= SPARSE_PROFILE_FACT_THRESHOLD (10) publishable facts so that
    // has_sparse_profile is NOT triggered and has_recent_import directive can surface.
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Marco" } }),
      makeFact({ category: "experience", key: "exp-1", value: { role: "CTO", company: "Startup", status: "current" } }),
      makeFact({ category: "experience", key: "exp-2", value: { role: "Engineer", company: "Prev Co", status: "past" } }),
      makeFact({ category: "experience", key: "exp-3", value: { role: "Intern", company: "Old Co", status: "past" } }),
      makeFact({ category: "education", key: "edu-1", value: { institution: "MIT" } }),
      makeFact({ category: "education", key: "edu-2", value: { institution: "Harvard" } }),
      makeFact({ category: "skill", key: "sk-1", value: { name: "TypeScript" } }),
      makeFact({ category: "skill", key: "sk-2", value: { name: "React" } }),
      makeFact({ category: "skill", key: "sk-3", value: { name: "Node.js" } }),
      makeFact({ category: "skill", key: "sk-4", value: { name: "PostgreSQL" } }),
      makeFact({ category: "interest", key: "int-1", value: { name: "Open Source" } }),
    ];

    // 3. Detect situations (in-memory, no DB dependency for this check)
    const situations = detectSituations(facts as any, "owner1", {
      pendingProposalCount: 0,
      openConflicts: [],
    });
    expect(situations).toContain("has_recent_import");

    // 4. Consume flag (DB-backed)
    const flag = consumeImportEvent(s1);
    expect(flag).not.toBeNull();
    expect(flag!.status).toBe("processing");

    // 5. Analyze gaps (pure function, no DB)
    const report = analyzeImportGaps(facts as any);
    expect(report.gaps.length).toBeGreaterThan(0);
    expect(report.summary.currentRole).toContain("CTO");

    // 6. Generate directive (pure function)
    const directive = getSituationDirectives(situations, "active_stale", {
      pendingProposalCount: 0,
      pendingProposalSections: [],
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      archivableFacts: [],
      importGapReport: report,
    });
    expect(directive).toContain("POST-IMPORT");
    expect(directive).toContain("CTO");

    // 7. Mark consumed (DB-backed)
    markImportEventConsumed(s1);

    // 8. Second consume should fail (idempotency)
    const second = consumeImportEvent(s1);
    expect(second).toBeNull();
  });

  it("error recovery: revert on failure, re-consume on retry", () => {
    writeImportEvent(s2, 10);

    // First consume
    const flag1 = consumeImportEvent(s2);
    expect(flag1).not.toBeNull();

    // Simulate LLM failure → revert
    revertImportEvent(s2);

    // Re-consume should work
    const flag2 = consumeImportEvent(s2);
    expect(flag2).not.toBeNull();
    expect(flag2!.importId).toBe(flag1!.importId);
  });
});
