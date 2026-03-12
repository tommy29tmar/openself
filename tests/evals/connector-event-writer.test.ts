import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockInsertEvent = vi.fn().mockReturnValue("event-uuid-1");

vi.mock("@/lib/services/episodic-service", () => ({
  insertEvent: (...args: any[]) => mockInsertEvent(...args),
}));

// sqlite mock: prepare() returns { all, run }, exec() for transactions
const mockAll = vi.fn().mockReturnValue([]);
const mockRun = vi.fn();
const mockPrepare = vi.fn().mockReturnValue({ all: mockAll, run: mockRun });
const mockExec = vi.fn();

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: (...args: any[]) => mockPrepare(...args),
    exec: (...args: any[]) => mockExec(...args),
  },
}));

const { batchRecordEvents } = await import("@/lib/connectors/connector-event-writer");

const ctx = {
  ownerKey: "owner-1",
  connectorId: "connector-1",
  connectorType: "github",
  sessionId: "sess-1",
};

const makeEvent = (externalId: string) => ({
  externalId,
  eventAtUnix: 1700000000,
  eventAtHuman: "2023-11-14",
  actionType: "pushed_code",
  narrativeSummary: `Pushed code for ${externalId}`,
  entities: ["repo-foo"],
});

describe("connector-event-writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing records in DB
    mockAll.mockReturnValue([]);
    mockInsertEvent.mockReturnValue("event-uuid-1");
  });

  it("records new events and returns written count", async () => {
    const report = await batchRecordEvents(
      [makeEvent("push-1"), makeEvent("push-2")],
      ctx,
    );

    expect(report.eventsWritten).toBe(2);
    expect(report.eventsSkipped).toBe(0);
    expect(report.errors).toHaveLength(0);
    expect(mockInsertEvent).toHaveBeenCalledTimes(2);
  });

  it("skips events already in connector_items (DB dedup)", async () => {
    // DB already has push-1 recorded
    mockAll.mockReturnValue([{ external_id: "push-1" }]);

    const report = await batchRecordEvents(
      [makeEvent("push-1"), makeEvent("push-2")],
      ctx,
    );

    expect(report.eventsWritten).toBe(1);
    expect(report.eventsSkipped).toBe(1);
    expect(report.errors).toHaveLength(0);
    // Only push-2 should be inserted
    expect(mockInsertEvent).toHaveBeenCalledTimes(1);
    expect(mockInsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ narrativeSummary: "Pushed code for push-2" }),
    );
  });

  it("returns empty report for empty input", async () => {
    const report = await batchRecordEvents([], ctx);

    expect(report.eventsWritten).toBe(0);
    expect(report.eventsSkipped).toBe(0);
    expect(report.errors).toHaveLength(0);
    expect(mockInsertEvent).not.toHaveBeenCalled();
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it("isolates per-event errors — one failure does not crash the batch", async () => {
    // push-1 succeeds, push-2 throws, push-3 succeeds
    mockInsertEvent
      .mockReturnValueOnce("event-uuid-1")
      .mockImplementationOnce(() => { throw new Error("DB locked"); })
      .mockReturnValueOnce("event-uuid-3");

    const report = await batchRecordEvents(
      [makeEvent("push-1"), makeEvent("push-2"), makeEvent("push-3")],
      ctx,
    );

    expect(report.eventsWritten).toBe(2);
    expect(report.eventsSkipped).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].externalId).toBe("push-2");
    expect(report.errors[0].reason).toContain("DB locked");
  });

  it("deduplicates intra-batch — same externalId twice skips the second", async () => {
    const report = await batchRecordEvents(
      [makeEvent("push-dup"), makeEvent("push-dup"), makeEvent("push-new")],
      ctx,
    );

    expect(report.eventsWritten).toBe(2);
    expect(report.eventsSkipped).toBe(1);
    expect(report.errors).toHaveLength(0);
    expect(mockInsertEvent).toHaveBeenCalledTimes(2);
  });

  it("calls BEGIN/COMMIT for each successful event", async () => {
    await batchRecordEvents([makeEvent("push-1")], ctx);

    expect(mockExec).toHaveBeenCalledWith("BEGIN");
    expect(mockExec).toHaveBeenCalledWith("COMMIT");
    expect(mockExec).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("calls ROLLBACK on failure and does not COMMIT", async () => {
    mockInsertEvent.mockImplementationOnce(() => { throw new Error("write failed"); });

    await batchRecordEvents([makeEvent("push-fail")], ctx);

    expect(mockExec).toHaveBeenCalledWith("BEGIN");
    expect(mockExec).toHaveBeenCalledWith("ROLLBACK");
    expect(mockExec).not.toHaveBeenCalledWith("COMMIT");
  });

  it("passes source=connectorType to insertEvent", async () => {
    await batchRecordEvents([makeEvent("push-1")], { ...ctx, connectorType: "linkedin_zip" });

    expect(mockInsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source: "linkedin_zip" }),
    );
  });

  it("forwards externalId to insertEvent", async () => {
    await batchRecordEvents([makeEvent("push-1")], ctx);

    expect(mockInsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "push-1" }),
    );
  });

  it("upserts connector_items with event_id after successful insertEvent", async () => {
    mockInsertEvent.mockReturnValue("event-uuid-42");

    await batchRecordEvents([makeEvent("push-1")], ctx);

    // mockRun should have been called with connector_items upsert args
    expect(mockRun).toHaveBeenCalledWith(
      expect.any(String), // UUID
      ctx.connectorId,
      "push-1",
      "event-uuid-42",
    );
  });
});
