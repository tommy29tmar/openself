import { eq, and, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  facts,
  categoryRegistry,
  categoryAliases,
} from "@/lib/db/schema";
import { randomUUID } from "crypto";
import {
  normalizeCategory,
  type TaxonomyStore,
} from "@/lib/taxonomy/normalizeCategory";
import { initialVisibility } from "@/lib/visibility/policy";
import { logEvent } from "@/lib/services/event-service";

// -- Taxonomy store backed by DB

const taxonomyStore: TaxonomyStore = {
  async findCanonical(category: string) {
    const row = db
      .select()
      .from(categoryRegistry)
      .where(eq(categoryRegistry.category, category))
      .get();
    return row ? row.category : null;
  },

  async findAlias(alias: string) {
    const row = db
      .select()
      .from(categoryAliases)
      .where(eq(categoryAliases.alias, alias))
      .get();
    return row ? row.category : null;
  },

  async createPendingCategory(category: string) {
    db.insert(categoryRegistry)
      .values({ category, status: "pending", createdBy: "agent" })
      .onConflictDoNothing()
      .run();
  },
};

// -- Types

export type CreateFactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
  source?: string;
  confidence?: number;
};

export type UpdateFactInput = {
  factId: string;
  value: Record<string, unknown>;
};

export type FactRow = {
  id: string;
  category: string;
  key: string;
  value: unknown;
  source: string | null;
  confidence: number | null;
  visibility: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// -- CRUD Operations

export async function createFact(input: CreateFactInput, sessionId: string = "__default__"): Promise<FactRow> {
  const normalized = await normalizeCategory(input.category, taxonomyStore);
  const confidence = input.confidence ?? 1.0;

  const visibility = initialVisibility({
    mode: "onboarding",
    category: normalized.canonical,
    confidence,
  });

  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(facts)
    .values({
      id,
      sessionId,
      category: normalized.canonical,
      key: input.key,
      value: input.value,
      source: input.source ?? "chat",
      confidence,
      visibility,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [facts.sessionId, facts.category, facts.key],
      set: {
        value: input.value,
        source: input.source ?? "chat",
        confidence,
        updatedAt: now,
      },
    })
    .run();

  logEvent({
    eventType: "fact_created",
    actor: "assistant",
    payload: {
      category: normalized.canonical,
      key: input.key,
      normalization: normalized.action,
      rawCategory: input.category,
    },
    entityType: "fact",
    entityId: id,
  });

  // Return the persisted row (may be upserted)
  const row = db
    .select()
    .from(facts)
    .where(
      sql`${facts.sessionId} = ${sessionId} AND ${facts.category} = ${normalized.canonical} AND ${facts.key} = ${input.key}`,
    )
    .get();

  return row as FactRow;
}

export function updateFact(input: UpdateFactInput, sessionId: string = "__default__"): FactRow | null {
  const existing = db
    .select()
    .from(facts)
    .where(and(eq(facts.id, input.factId), eq(facts.sessionId, sessionId)))
    .get();

  if (!existing) return null;

  const now = new Date().toISOString();
  db.update(facts)
    .set({ value: input.value, updatedAt: now })
    .where(and(eq(facts.id, input.factId), eq(facts.sessionId, sessionId)))
    .run();

  logEvent({
    eventType: "fact_updated",
    actor: "assistant",
    payload: { factId: input.factId, newValue: input.value },
    entityType: "fact",
    entityId: input.factId,
  });

  return { ...existing, value: input.value, updatedAt: now } as FactRow;
}

export function deleteFact(factId: string, sessionId: string = "__default__"): boolean {
  const existing = db
    .select()
    .from(facts)
    .where(and(eq(facts.id, factId), eq(facts.sessionId, sessionId)))
    .get();

  if (!existing) return false;

  db.delete(facts).where(and(eq(facts.id, factId), eq(facts.sessionId, sessionId))).run();

  logEvent({
    eventType: "fact_deleted",
    actor: "assistant",
    payload: {
      factId,
      category: existing.category,
      key: existing.key,
    },
    entityType: "fact",
    entityId: factId,
  });

  return true;
}

export function searchFacts(query: string, sessionId: string = "__default__"): FactRow[] {
  const pattern = `%${query}%`;
  const rows = db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.sessionId, sessionId),
        or(
          like(facts.category, pattern),
          like(facts.key, pattern),
          sql`json_extract(${facts.value}, '$') LIKE ${pattern}`,
        ),
      ),
    )
    .all();

  return rows as FactRow[];
}

export function getAllFacts(sessionId: string = "__default__"): FactRow[] {
  return db.select().from(facts).where(eq(facts.sessionId, sessionId)).all() as FactRow[];
}

export function getFactsByCategory(category: string, sessionId: string = "__default__"): FactRow[] {
  return db
    .select()
    .from(facts)
    .where(and(eq(facts.sessionId, sessionId), eq(facts.category, category)))
    .all() as FactRow[];
}
