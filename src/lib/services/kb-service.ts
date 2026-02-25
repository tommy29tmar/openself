import { eq, and, like, or, sql, inArray } from "drizzle-orm";
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
import { PROFILE_ID_CANONICAL } from "@/lib/flags";

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

export async function createFact(
  input: CreateFactInput,
  sessionId: string = "__default__",
  profileId?: string,
): Promise<FactRow> {
  const normalized = await normalizeCategory(input.category, taxonomyStore);
  const confidence = input.confidence ?? 1.0;

  const visibility = initialVisibility({
    mode: "onboarding",
    category: normalized.canonical,
    confidence,
  });

  const id = randomUUID();
  const now = new Date().toISOString();
  const effectiveProfileId = profileId ?? sessionId;

  db.insert(facts)
    .values({
      id,
      sessionId,
      profileId: effectiveProfileId,
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
        profileId: effectiveProfileId,
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

/**
 * Update a fact. Accepts knowledgePrimaryKey (anchor session) to enable cross-session updates.
 * The fact lookup is scoped to knowledgeReadKeys (all sessions for the profile).
 */
export function updateFact(
  input: UpdateFactInput,
  sessionId: string = "__default__",
  readKeys?: string[],
): FactRow | null {
  // If readKeys provided, find the fact across all sessions for this profile
  let existing;
  if (readKeys && readKeys.length > 0) {
    existing = db
      .select()
      .from(facts)
      .where(and(eq(facts.id, input.factId), inArray(facts.sessionId, readKeys)))
      .get();
  } else {
    existing = db
      .select()
      .from(facts)
      .where(and(eq(facts.id, input.factId), eq(facts.sessionId, sessionId)))
      .get();
  }

  if (!existing) return null;

  const now = new Date().toISOString();
  db.update(facts)
    .set({ value: input.value, updatedAt: now })
    .where(eq(facts.id, input.factId))
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

/**
 * Delete a fact. Accepts knowledgeReadKeys to enable cross-session deletes.
 */
export function deleteFact(
  factId: string,
  sessionId: string = "__default__",
  readKeys?: string[],
): boolean {
  let existing;
  if (readKeys && readKeys.length > 0) {
    existing = db
      .select()
      .from(facts)
      .where(and(eq(facts.id, factId), inArray(facts.sessionId, readKeys)))
      .get();
  } else {
    existing = db
      .select()
      .from(facts)
      .where(and(eq(facts.id, factId), eq(facts.sessionId, sessionId)))
      .get();
  }

  if (!existing) return false;

  db.delete(facts).where(eq(facts.id, factId)).run();

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

/**
 * Get all facts for a session. Supports multi-key read via sessionIds array.
 */
export function getAllFacts(sessionId: string = "__default__", sessionIds?: string[]): FactRow[] {
  if (PROFILE_ID_CANONICAL) {
    return db.select().from(facts).where(eq(facts.profileId, sessionId)).all() as FactRow[];
  }
  if (sessionIds && sessionIds.length > 0) {
    return db.select().from(facts).where(inArray(facts.sessionId, sessionIds)).all() as FactRow[];
  }
  return db.select().from(facts).where(eq(facts.sessionId, sessionId)).all() as FactRow[];
}

export function getFactsByCategory(category: string, sessionId: string = "__default__"): FactRow[] {
  return db
    .select()
    .from(facts)
    .where(and(eq(facts.sessionId, sessionId), eq(facts.category, category)))
    .all() as FactRow[];
}

/**
 * Count facts across multiple session keys. Used by mode detection.
 */
export function countFacts(sessionIds: string[]): number {
  if (sessionIds.length === 0) return 0;
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(facts)
    .where(inArray(facts.sessionId, sessionIds))
    .get();
  return row?.count ?? 0;
}
