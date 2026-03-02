import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  writeImportEvent,
  consumeImportEvent,
  type ImportEventFlag,
} from "@/lib/connectors/import-event";
import { getSessionMeta, setSessionMeta } from "@/lib/services/session-metadata";

// Helper: create a real session row in DB (setSessionMeta updates existing rows only)
function createTestSession(id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
  db.insert(sessions).values({ id, inviteCode: "test" }).run();
}

describe("import event flag lifecycle", () => {
  const s1 = "test-import-" + randomUUID().slice(0, 8);
  const s2 = "test-import-" + randomUUID().slice(0, 8);
  const s3 = "test-import-" + randomUUID().slice(0, 8);
  const s4 = "test-import-" + randomUUID().slice(0, 8);
  const s5 = "test-import-" + randomUUID().slice(0, 8);

  beforeEach(() => {
    // Create real session rows so setSessionMeta works
    for (const id of [s1, s2, s3, s4, s5]) createTestSession(id);
  });

  it("writeImportEvent sets flag with pending status", () => {
    writeImportEvent(s1, 15);
    const meta = getSessionMeta(s1);
    const flag = meta.pending_import_event as ImportEventFlag;
    expect(flag).toBeDefined();
    expect(flag.status).toBe("pending");
    expect(flag.factsWritten).toBe(15);
    expect(flag.importId).toBeTruthy();
  });

  it("consumeImportEvent transitions pending → processing → consumed", () => {
    writeImportEvent(s2, 10);

    // First consume: pending → processing (returns the flag)
    const flag = consumeImportEvent(s2);
    expect(flag).not.toBeNull();
    expect(flag!.status).toBe("processing");

    // Verify metadata was updated to processing
    const meta = getSessionMeta(s2);
    expect((meta.pending_import_event as ImportEventFlag).status).toBe("processing");
  });

  it("consumeImportEvent returns null if already processing", () => {
    writeImportEvent(s3, 10);
    consumeImportEvent(s3); // pending → processing

    // Second consume attempt: should return null (CAS guard)
    const secondAttempt = consumeImportEvent(s3);
    expect(secondAttempt).toBeNull();
  });

  it("consumeImportEvent returns null if already consumed", () => {
    writeImportEvent(s4, 10);
    consumeImportEvent(s4);
    // Simulate marking as consumed
    const meta = getSessionMeta(s4);
    (meta.pending_import_event as ImportEventFlag).status = "consumed";
    setSessionMeta(s4, meta);

    const attempt = consumeImportEvent(s4);
    expect(attempt).toBeNull();
  });

  it("consumeImportEvent returns null if flag has expired (TTL)", () => {
    writeImportEvent(s5, 10);
    // Manually backdate the timestamp to 25 hours ago
    const meta = getSessionMeta(s5);
    const flag = meta.pending_import_event as ImportEventFlag;
    flag.timestamp = Date.now() - 25 * 60 * 60 * 1000;
    setSessionMeta(s5, meta);

    const attempt = consumeImportEvent(s5);
    expect(attempt).toBeNull();
    // Flag should be deleted
    const metaAfter = getSessionMeta(s5);
    expect(metaAfter.pending_import_event).toBeUndefined();
  });

  it("consumeImportEvent returns null when no flag exists", () => {
    const attempt = consumeImportEvent("nonexistent-session-id");
    expect(attempt).toBeNull();
  });
});
