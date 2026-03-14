import { eq, and, inArray } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { sectionCopyState } from "@/lib/db/schema";

export type SectionCopyStateRow = {
  id: number;
  ownerKey: string;
  sectionType: string;
  language: string;
  personalizedContent: string;
  factsHash: string;
  soulHash: string;
  approvedAt: string | null;
  source: string;
};

export type UpsertStateInput = {
  ownerKey: string;
  sectionType: string;
  language: string;
  personalizedContent: string;
  factsHash: string;
  soulHash: string;
  source: "live" | "proposal" | "agent";
};

function rowToState(row: Record<string, unknown>): SectionCopyStateRow {
  return {
    id: row.id as number,
    ownerKey: row.ownerKey as string,
    sectionType: row.sectionType as string,
    language: row.language as string,
    personalizedContent: row.personalizedContent as string,
    factsHash: row.factsHash as string,
    soulHash: row.soulHash as string,
    approvedAt: (row.approvedAt as string) ?? null,
    source: row.source as string,
  };
}

/**
 * Factory for the section copy state service.
 * Accepts an optional Drizzle DB instance for testing with in-memory SQLite.
 */
export function createSectionCopyStateService(db: typeof defaultDb = defaultDb) {
  return {
    /**
     * Get the active personalised copy for a specific owner, section type, and language.
     * Returns null if no active copy exists.
     */
    getActiveCopy(
      ownerKey: string,
      sectionType: string,
      language: string,
    ): SectionCopyStateRow | null {
      const row = db
        .select()
        .from(sectionCopyState)
        .where(
          and(
            eq(sectionCopyState.ownerKey, ownerKey),
            eq(sectionCopyState.sectionType, sectionType),
            eq(sectionCopyState.language, language),
          ),
        )
        .get();

      return row ? rowToState(row) : null;
    },

    /**
     * Get the active copy only if both hashes still match the current state.
     * Returns null if no copy exists or if hashes are stale.
     */
    getActiveCopyWithHashGuard(
      ownerKey: string,
      sectionType: string,
      language: string,
      currentFactsHash: string,
      currentSoulHash: string,
    ): SectionCopyStateRow | null {
      const row = db
        .select()
        .from(sectionCopyState)
        .where(
          and(
            eq(sectionCopyState.ownerKey, ownerKey),
            eq(sectionCopyState.sectionType, sectionType),
            eq(sectionCopyState.language, language),
            eq(sectionCopyState.factsHash, currentFactsHash),
            eq(sectionCopyState.soulHash, currentSoulHash),
          ),
        )
        .get();

      return row ? rowToState(row) : null;
    },

    /**
     * Get all active personalised copies for a given owner and language.
     */
    getAllActiveCopies(
      ownerKey: string,
      language: string,
      readKeys?: string[],
    ): SectionCopyStateRow[] {
      // Build the set of all keys to search (deduplicated)
      const allKeys = readKeys?.length
        ? [...new Set([...readKeys.filter((k) => k !== ownerKey), ownerKey])]
        : [ownerKey];
      // ownerKey is pushed LAST so that when callers build Map(sectionType → copy),
      // the primary owner's copy wins over legacy readKeys copies.

      const rows = db
        .select()
        .from(sectionCopyState)
        .where(
          and(
            allKeys.length === 1
              ? eq(sectionCopyState.ownerKey, ownerKey)
              : inArray(sectionCopyState.ownerKey, allKeys),
            eq(sectionCopyState.language, language),
          ),
        )
        .all();

      // Sort: readKeys copies first, primary ownerKey copies last
      // This ensures Map(sectionType → copy) overwrites with primary
      return rows
        .sort((a, b) => {
          const aPrimary = a.ownerKey === ownerKey ? 1 : 0;
          const bPrimary = b.ownerKey === ownerKey ? 1 : 0;
          return aPrimary - bPrimary;
        })
        .map(rowToState);
    },

    /**
     * Insert or update the active copy for a (ownerKey, sectionType, language) triple.
     * Uses UPSERT on the 3-field unique constraint.
     */
    upsertState(input: UpsertStateInput): void {
      db.insert(sectionCopyState)
        .values({
          ownerKey: input.ownerKey,
          sectionType: input.sectionType,
          language: input.language,
          personalizedContent: input.personalizedContent,
          factsHash: input.factsHash,
          soulHash: input.soulHash,
          source: input.source,
        })
        .onConflictDoUpdate({
          target: [
            sectionCopyState.ownerKey,
            sectionCopyState.sectionType,
            sectionCopyState.language,
          ],
          set: {
            personalizedContent: input.personalizedContent,
            factsHash: input.factsHash,
            soulHash: input.soulHash,
            source: input.source,
          },
        })
        .run();
    },
  };
}

const svc = createSectionCopyStateService();
export const {
  getActiveCopy,
  getActiveCopyWithHashGuard,
  getAllActiveCopies,
  upsertState,
} = svc;
