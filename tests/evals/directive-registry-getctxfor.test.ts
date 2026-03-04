// tests/evals/directive-registry-getctxfor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logEvent so we don't need full app context
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { getCtxFor } from "@/lib/agent/policies/directive-registry";
import type { SituationContext } from "@/lib/agent/policies";

const fullCtx: SituationContext = {
  pendingProposalCount: 2,
  pendingProposalSections: ["skills"],
  thinSections: ["education"],
  staleFacts: ["experience/acme"],
  openConflicts: [],
  archivableFacts: [],
  // has_recent_import is only set when a real importGapReport exists — provide one
  importGapReport: { missingFields: ["skills"], importedAt: "2026-03-01T00:00:00.000Z" } as any,
};

describe("getCtxFor", () => {
  it("returns correct pick for has_thin_sections", () => {
    const ctx = getCtxFor("has_thin_sections", fullCtx);
    expect(ctx).not.toBeNull();
    expect((ctx as any).thinSections).toEqual(["education"]);
  });

  it("returns null in production when required field is missing", () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    const badCtx = { ...fullCtx, thinSections: undefined as any };
    const result = getCtxFor("has_thin_sections", badCtx);
    expect(result).toBeNull();
    (process.env as any).NODE_ENV = originalEnv;
  });

  it("throws in dev/test when required field is missing", () => {
    const badCtx = { ...fullCtx, thinSections: undefined as any };
    expect(() => getCtxFor("has_thin_sections", badCtx)).toThrow();
  });

  it("returns context for has_recent_import even when importGapReport is undefined (no required keys)", () => {
    const ctxNoImport = { ...fullCtx, importGapReport: undefined as any };
    const result = getCtxFor("has_recent_import", ctxNoImport);
    expect(result).not.toBeNull(); // no required keys, always passes
  });
});
