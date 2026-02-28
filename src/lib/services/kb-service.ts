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
import { initialVisibility, isSensitiveCategory, type Visibility } from "@/lib/visibility/policy";
import { logEvent } from "@/lib/services/event-service";
import { PROFILE_ID_CANONICAL } from "@/lib/flags";
import { validateFactValue } from "@/lib/services/fact-validation";

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
  // Validate fact value before persisting
  validateFactValue(input.category, input.key, input.value);

  const normalized = await normalizeCategory(input.category, taxonomyStore);
  const confidence = input.confidence ?? 1.0;

  // Experience key collision guardrail: prevent accidental data loss
  if (normalized.canonical === "experience") {
    const existing = getFactByKey(sessionId, normalized.canonical, input.key);
    if (existing) {
      let existingVal: Record<string, unknown> | null = null;
      let newVal: Record<string, unknown> | null = null;
      try {
        existingVal = typeof existing.value === "string" ? JSON.parse(existing.value) : (existing.value as Record<string, unknown>);
      } catch { /* corrupt stored value */ }
      try {
        newVal = typeof input.value === "string" ? JSON.parse(input.value as string) : (input.value as Record<string, unknown>);
      } catch { /* invalid input */ }

      if (!existingVal || !newVal) {
        throw new Error(
          `Fact experience/${input.key} already exists but value could not be compared. ` +
          `Use update_fact to modify the existing entry, or use a different key.`
        );
      }
      const existingCompany = String(existingVal.company ?? "").toLowerCase();
      const newCompany = String(newVal.company ?? "").toLowerCase();
      if (existingCompany && newCompany && existingCompany !== newCompany) {
        throw new Error(
          `Fact experience/${input.key} already exists for company '${existingVal.company}'. ` +
          `Use a different key or use update_fact to modify the existing entry.`
        );
      }
    }
  }

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
        visibility: sql`CASE WHEN ${facts.visibility} = 'private' THEN ${visibility} ELSE ${facts.visibility} END`,
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
  // Find existing fact to get category/key for validation
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

  // Validate new value before persisting
  validateFactValue(existing.category, existing.key, input.value);

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

export function searchFacts(query: string, sessionId: string = "__default__", sessionIds?: string[]): FactRow[] {
  const pattern = `%${query}%`;
  const matchCondition = or(
    like(facts.category, pattern),
    like(facts.key, pattern),
    sql`json_extract(${facts.value}, '$') LIKE ${pattern}`,
  );

  if (PROFILE_ID_CANONICAL) {
    return db.select().from(facts)
      .where(and(eq(facts.profileId, sessionId), matchCondition))
      .all() as FactRow[];
  }
  if (sessionIds && sessionIds.length > 0) {
    return db.select().from(facts)
      .where(and(inArray(facts.sessionId, sessionIds), matchCondition))
      .all() as FactRow[];
  }
  return db.select().from(facts)
    .where(and(eq(facts.sessionId, sessionId), matchCondition))
    .all() as FactRow[];
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

/** Exact lookup by session + category + key triple. */
export function getFactByKey(sessionId: string, category: string, key: string): FactRow | undefined {
  return db
    .select()
    .from(facts)
    .where(and(eq(facts.sessionId, sessionId), eq(facts.category, category), eq(facts.key, key)))
    .get() as FactRow | undefined;
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

// ---------------------------------------------------------------------------
// Visibility management
// ---------------------------------------------------------------------------

export type VisibilityActor = "assistant" | "user";

export class VisibilityTransitionError extends Error {
  public readonly code = "VISIBILITY_TRANSITION_BLOCKED" as const;
  constructor(message: string) {
    super(message);
    this.name = "VisibilityTransitionError";
  }
}

/**
 * Set fact visibility with enforced transition matrix.
 *
 * | Actor     | Category    | Allowed targets                          |
 * |-----------|-------------|------------------------------------------|
 * | assistant | any         | proposed, private                        |
 * | assistant | any         | public → BLOCKED                         |
 * | user      | non-sensitive | private, proposed, public              |
 * | user      | sensitive   | private only                             |
 * | any       | sensitive   | public, proposed → BLOCKED               |
 */
export function setFactVisibility(
  factId: string,
  targetVisibility: Visibility,
  actor: VisibilityActor,
  sessionId: string,
  readKeys?: string[],
): FactRow {
  // Find fact
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

  if (!existing) {
    throw new VisibilityTransitionError(`Fact ${factId} not found`);
  }

  const sensitive = isSensitiveCategory(existing.category);
  const from = (existing.visibility ?? "private") as Visibility;

  // Enforce transition matrix
  if (actor === "assistant" && targetVisibility === "public") {
    throw new VisibilityTransitionError(
      "Assistant cannot set visibility to public",
    );
  }

  if (sensitive && (targetVisibility === "public" || targetVisibility === "proposed")) {
    throw new VisibilityTransitionError(
      `Sensitive category "${existing.category}" cannot be set to ${targetVisibility}`,
    );
  }

  if (actor === "user" && sensitive && targetVisibility !== "private") {
    throw new VisibilityTransitionError(
      `User can only set sensitive category "${existing.category}" to private`,
    );
  }

  // Apply
  const now = new Date().toISOString();
  db.update(facts)
    .set({ visibility: targetVisibility, updatedAt: now })
    .where(eq(facts.id, factId))
    .run();

  logEvent({
    eventType: "fact_visibility_changed",
    actor,
    payload: { factId, from, to: targetVisibility, category: existing.category },
    entityType: "fact",
    entityId: factId,
  });

  return { ...existing, visibility: targetVisibility, updatedAt: now } as FactRow;
}

/**
 * Get a single fact by ID (scoped to readKeys).
 */
export function getFactById(
  factId: string,
  sessionId: string,
  readKeys?: string[],
): FactRow | null {
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
  return existing ? (existing as FactRow) : null;
}
