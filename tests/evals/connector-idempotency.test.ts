import { describe, it, expect, beforeEach } from "vitest";
import {
  isSyncRateLimited,
  acquireImportLock,
  releaseImportLock,
  hasPendingImport,
  hasPendingJob,
} from "@/lib/connectors/idempotency";

// ---------------------------------------------------------------------------
// hasPendingJob — DB-backed check
// ---------------------------------------------------------------------------

describe("hasPendingJob", () => {
  it("returns false for a non-existent owner key", () => {
    // No jobs inserted for this random key — should be false
    expect(hasPendingJob("owner-key-that-does-not-exist-" + Date.now())).toBe(false);
  });

  it("does not throw on a real DB (schema alignment)", () => {
    // Validates the SQL compiles against the real jobs table schema
    expect(() => hasPendingJob("any-owner")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isSyncRateLimited — time-based guard
// ---------------------------------------------------------------------------

describe("isSyncRateLimited", () => {
  it("returns true when lastSync was 30s ago", () => {
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    expect(isSyncRateLimited(thirtySecondsAgo)).toBe(true);
  });

  it("returns false when lastSync was 2 minutes ago", () => {
    const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
    expect(isSyncRateLimited(twoMinutesAgo)).toBe(false);
  });

  it("returns false when lastSync is null", () => {
    expect(isSyncRateLimited(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Import lock (in-memory Set)
// ---------------------------------------------------------------------------

describe("import lock", () => {
  const OWNER = "test-owner-lock";

  beforeEach(() => {
    // Ensure clean state — release any leftover lock
    releaseImportLock(OWNER);
    releaseImportLock("other-owner");
  });

  it("acquireImportLock returns true first, false second", () => {
    expect(acquireImportLock(OWNER)).toBe(true);
    expect(acquireImportLock(OWNER)).toBe(false);
    expect(hasPendingImport(OWNER)).toBe(true);
  });

  it("releaseImportLock allows re-acquire", () => {
    expect(acquireImportLock(OWNER)).toBe(true);
    releaseImportLock(OWNER);
    expect(hasPendingImport(OWNER)).toBe(false);
    expect(acquireImportLock(OWNER)).toBe(true);
  });

  it("locks are independent per ownerKey", () => {
    expect(acquireImportLock(OWNER)).toBe(true);
    expect(acquireImportLock("other-owner")).toBe(true);
    expect(hasPendingImport(OWNER)).toBe(true);
    expect(hasPendingImport("other-owner")).toBe(true);

    releaseImportLock(OWNER);
    expect(hasPendingImport(OWNER)).toBe(false);
    expect(hasPendingImport("other-owner")).toBe(true);
  });
});
