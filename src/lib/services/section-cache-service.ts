import { eq, and, sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { sectionCopyCache } from "@/lib/db/schema";

/**
 * Factory for the section copy cache service.
 * Accepts an optional Drizzle DB instance for testing with in-memory SQLite.
 */
export function createSectionCacheService(db: typeof defaultDb = defaultDb) {
  return {
    /**
     * Look up a cached personalised copy by all 5 content-address fields.
     * Returns the personalised content string, or null on cache miss.
     */
    getCachedCopy(
      ownerKey: string,
      sectionType: string,
      factsHash: string,
      soulHash: string,
      language: string,
    ): string | null {
      const row = db
        .select({ personalizedContent: sectionCopyCache.personalizedContent })
        .from(sectionCopyCache)
        .where(
          and(
            eq(sectionCopyCache.ownerKey, ownerKey),
            eq(sectionCopyCache.sectionType, sectionType),
            eq(sectionCopyCache.factsHash, factsHash),
            eq(sectionCopyCache.soulHash, soulHash),
            eq(sectionCopyCache.language, language),
          ),
        )
        .get();

      return row?.personalizedContent ?? null;
    },

    /**
     * Insert or update a cached personalised copy.
     * Uses UPSERT on the 5-field unique constraint.
     */
    putCachedCopy(
      ownerKey: string,
      sectionType: string,
      factsHash: string,
      soulHash: string,
      language: string,
      personalizedContent: string,
    ): void {
      db.insert(sectionCopyCache)
        .values({
          ownerKey,
          sectionType,
          factsHash,
          soulHash,
          language,
          personalizedContent,
        })
        .onConflictDoUpdate({
          target: [
            sectionCopyCache.ownerKey,
            sectionCopyCache.sectionType,
            sectionCopyCache.factsHash,
            sectionCopyCache.soulHash,
            sectionCopyCache.language,
          ],
          set: {
            personalizedContent,
            createdAt: sql`(datetime('now'))`,
          },
        })
        .run();
    },

    /**
     * Delete cache entries older than `ttlDays` days.
     * Returns the number of rows deleted.
     */
    cleanupExpiredCache(ttlDays: number): number {
      const result = db
        .delete(sectionCopyCache)
        .where(
          sql`${sectionCopyCache.createdAt} < datetime('now', ${`-${ttlDays} days`})`,
        )
        .run();

      return result.changes;
    },
  };
}

const svc = createSectionCacheService();
export const { getCachedCopy, putCachedCopy, cleanupExpiredCache } = svc;
