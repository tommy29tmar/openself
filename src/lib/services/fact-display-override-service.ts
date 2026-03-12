import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { factDisplayOverrides } from "@/lib/db/schema";
import { computeHash } from "@/lib/services/personalization-hashing";

export type UpsertOverrideInput = {
  ownerKey: string;
  factId: string;
  displayFields: Record<string, unknown>;
  factValueHash: string;
  source: "agent" | "worker" | "live";
};

export type FactHashEntry = { id: string; valueHash: string };

/**
 * Editable fields per fact category.
 * Only these fields can be overridden in a fact's display.
 * Non-listed fields (dates, URLs, status flags, tags) are immutable.
 */
export const ITEM_EDITABLE_FIELDS: Record<string, string[]> = {
  identity: ["full", "name", "full_name", "role", "title", "tagline", "company", "organization"],
  experience: ["role", "title", "company", "organization", "description"],
  education: ["institution", "school", "degree", "field", "description"],
  project: ["title", "name", "description"],
  achievement: ["title", "name", "description"],
  interest: ["name", "detail", "description"],
  reading: ["title", "name", "author", "note", "description"],
  music: ["title", "name", "artist", "note", "description"],
  activity: ["name", "description"],
  skill: ["name"],
  social: ["label"],
};

/** Compute SHA256 hash of a fact's value for staleness detection */
export function computeFactValueHash(value: unknown): string {
  return computeHash(JSON.stringify(value));
}

/** Filter displayFields to only allowed editable fields for the category */
export function filterEditableFields(
  category: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = ITEM_EDITABLE_FIELDS[category];
  if (!allowed) return {};
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (allowed.includes(key)) filtered[key] = fields[key];
  }
  return filtered;
}

export function createFactDisplayOverrideService(db: typeof defaultDb = defaultDb) {
  function upsertOverride(input: UpsertOverrideInput) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const displayFieldsJson = JSON.stringify(input.displayFields);

    db.insert(factDisplayOverrides)
      .values({
        id,
        ownerKey: input.ownerKey,
        factId: input.factId,
        displayFields: displayFieldsJson,
        factValueHash: input.factValueHash,
        source: input.source,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: factDisplayOverrides.factId,
        set: {
          displayFields: displayFieldsJson,
          factValueHash: input.factValueHash,
          source: input.source,
          updatedAt: now,
        },
      })
      .run();

    return { id, factId: input.factId };
  }

  function getOverridesForOwner(ownerKey: string) {
    return db
      .select()
      .from(factDisplayOverrides)
      .where(eq(factDisplayOverrides.ownerKey, ownerKey))
      .all();
  }

  function getValidOverrides(
    ownerKey: string,
    factHashes: FactHashEntry[],
  ): Map<string, Record<string, unknown>> {
    const overrides = getOverridesForOwner(ownerKey);
    const hashMap = new Map(factHashes.map((f) => [f.id, f.valueHash]));
    const valid = new Map<string, Record<string, unknown>>();

    for (const row of overrides) {
      const currentHash = hashMap.get(row.factId);
      if (currentHash && currentHash === row.factValueHash) {
        try {
          valid.set(row.factId, JSON.parse(row.displayFields));
        } catch {
          // skip malformed JSON
        }
      }
    }
    return valid;
  }

  function deleteOverride(factId: string) {
    db.delete(factDisplayOverrides)
      .where(eq(factDisplayOverrides.factId, factId))
      .run();
  }

  function cleanupOrphans(ownerKey: string, activeFactIds: string[]): number {
    const overrides = getOverridesForOwner(ownerKey);
    const activeSet = new Set(activeFactIds);
    let cleaned = 0;
    for (const row of overrides) {
      if (!activeSet.has(row.factId)) {
        deleteOverride(row.factId);
        cleaned++;
      }
    }
    return cleaned;
  }

  function getOverrideForFact(factId: string) {
    return db
      .select()
      .from(factDisplayOverrides)
      .where(eq(factDisplayOverrides.factId, factId))
      .get();
  }

  return {
    upsertOverride,
    getOverridesForOwner,
    getValidOverrides,
    deleteOverride,
    cleanupOrphans,
    getOverrideForFact,
  };
}

// Singleton
let _service: ReturnType<typeof createFactDisplayOverrideService> | null = null;
export function getFactDisplayOverrideService() {
  if (!_service) {
    _service = createFactDisplayOverrideService(defaultDb);
  }
  return _service;
}
