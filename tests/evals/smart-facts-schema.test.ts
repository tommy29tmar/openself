import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { FactRow } from "@/lib/services/kb-service";

describe("Migration 0022 — Smart Facts v2 Schema", () => {
  const sessionId = "__default__";

  beforeEach(() => {
    db.delete(facts).where(eq(facts.sessionId, sessionId)).run();
  });

  it("facts table has parent_fact_id column (nullable, defaults to null)", () => {
    const id = randomUUID();
    db.insert(facts).values({
      id,
      sessionId,
      category: "skill",
      key: "ts-" + id.slice(0, 8),
      value: { name: "TypeScript" },
    }).run();

    const row = db.select().from(facts).where(eq(facts.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.parentFactId).toBeNull();
  });

  it("facts table has archived_at column (nullable, defaults to null)", () => {
    const id = randomUUID();
    db.insert(facts).values({
      id,
      sessionId,
      category: "skill",
      key: "js-" + id.slice(0, 8),
      value: { name: "JavaScript" },
    }).run();

    const row = db.select().from(facts).where(eq(facts.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.archivedAt).toBeNull();
  });

  it("parent_fact_id can be set on insert", () => {
    const parentId = randomUUID();
    const childId = randomUUID();

    db.insert(facts).values({
      id: parentId,
      sessionId,
      category: "experience",
      key: "acme-" + parentId.slice(0, 8),
      value: { role: "Dev", company: "Acme" },
    }).run();

    db.insert(facts).values({
      id: childId,
      sessionId,
      category: "project",
      key: "alpha-" + childId.slice(0, 8),
      value: { name: "Alpha" },
      parentFactId: parentId,
    }).run();

    const child = db.select().from(facts).where(eq(facts.id, childId)).get();
    expect(child!.parentFactId).toBe(parentId);
  });

  it("archived_at can be set to a timestamp", () => {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.insert(facts).values({
      id,
      sessionId,
      category: "skill",
      key: "old-" + id.slice(0, 8),
      value: { name: "Old Skill" },
    }).run();

    db.update(facts)
      .set({ archivedAt: now })
      .where(eq(facts.id, id))
      .run();

    const row = db.select().from(facts).where(eq(facts.id, id)).get();
    expect(row!.archivedAt).toBe(now);
  });

  it("sessions table has metadata column (defaults to '{}')", () => {
    const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row).toBeDefined();
    expect(row!.metadata).toBe("{}");
  });

  it("sessions.metadata can store JSON", () => {
    const testSessionId = "test-meta-" + randomUUID().slice(0, 8);
    db.insert(sessions).values({
      id: testSessionId,
      inviteCode: "test",
    }).run();

    const meta = JSON.stringify({ archetype: "developer" });
    db.update(sessions)
      .set({ metadata: meta })
      .where(eq(sessions.id, testSessionId))
      .run();

    const row = db.select().from(sessions).where(eq(sessions.id, testSessionId)).get();
    expect(JSON.parse(row!.metadata)).toEqual({ archetype: "developer" });

    // cleanup
    db.delete(sessions).where(eq(sessions.id, testSessionId)).run();
  });

  it("sort_order (pre-existing from 0021) still works", () => {
    const id = randomUUID();
    db.insert(facts).values({
      id,
      sessionId,
      category: "skill",
      key: "react-" + id.slice(0, 8),
      value: { name: "React" },
      sortOrder: 5,
    }).run();

    const row = db.select().from(facts).where(eq(facts.id, id)).get();
    expect(row!.sortOrder).toBe(5);
  });

  it("FactRow type includes sortOrder, parentFactId, archivedAt", () => {
    const mockRow: FactRow = {
      id: "test",
      category: "skill",
      key: "ts",
      value: { name: "TypeScript" },
      source: "chat",
      confidence: 1.0,
      visibility: "public",
      sortOrder: 0,
      parentFactId: null,
      archivedAt: null,
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };
    expect(mockRow.sortOrder).toBe(0);
    expect(mockRow.parentFactId).toBeNull();
    expect(mockRow.archivedAt).toBeNull();
  });

  it("idx_facts_parent index exists", () => {
    const row = db.all(sql`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_facts_parent'`);
    expect(row.length).toBe(1);
  });

  it("idx_facts_active index exists", () => {
    const row = db.all(sql`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_facts_active'`);
    expect(row.length).toBe(1);
  });
});
