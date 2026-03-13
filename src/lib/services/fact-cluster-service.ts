/**
 * fact-cluster-service.ts
 *
 * Fact identity matching, slug normalization, and cluster assignment logic.
 */

import { db, sqlite } from "@/lib/db";
import { facts, factClusters } from "@/lib/db/schema";
import { eq, and, isNull, ne, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { PROFILE_ID_CANONICAL } from "@/lib/flags";
import { getActiveFacts } from "@/lib/services/kb-service";
import type { FactRow } from "@/lib/services/kb-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FactValue = Record<string, unknown>;

type ClusterAssignInput = {
  factId: string;
  factKey: string;
  category: string;
  value: Record<string, unknown>;
  source: string;
  ownerKey: string;
  sessionId: string;
};

export type ClusterAssignResult = {
  clusterId: string;
  isNew: boolean;
  matchedFactId: string;
  canonicalKey: string;
} | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  if (typeof v === "string") return v;
  return "";
}

// ---------------------------------------------------------------------------
// slugifyForMatch
// ---------------------------------------------------------------------------

/**
 * Normalize a string for identity matching:
 * lowercase, remove accents, strip special chars, collapse whitespace → hyphens.
 */
export function slugifyForMatch(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")      // remove special chars
    .replace(/\s+/g, "-")              // whitespace → hyphens
    .replace(/-+/g, "-")               // collapse hyphens
    .replace(/^-|-$/g, "");            // trim hyphens
}

// ---------------------------------------------------------------------------
// identityMatch
// ---------------------------------------------------------------------------

/**
 * Category-specific identity matching.
 * Returns true if two fact values refer to the same real-world entity.
 */
export function identityMatch(
  category: string,
  a: FactValue,
  b: FactValue
): boolean {
  switch (category) {
    case "education": {
      const instA = slugifyForMatch(str(a.institution));
      const instB = slugifyForMatch(str(b.institution));
      const degA = slugifyForMatch(str(a.degree));
      const degB = slugifyForMatch(str(b.degree));
      return instA !== "" && degA !== "" && instA === instB && degA === degB;
    }

    case "experience":
    case "position": {
      const coA = slugifyForMatch(str(a.company));
      const coB = slugifyForMatch(str(b.company));
      const roleA = slugifyForMatch(str(a.role));
      const roleB = slugifyForMatch(str(b.role));
      return coA !== "" && roleA !== "" && coA === coB && roleA === roleB;
    }

    case "skill": {
      const nA = slugifyForMatch(str(a.name));
      const nB = slugifyForMatch(str(b.name));
      return nA !== "" && nA === nB;
    }

    case "language": {
      const langA = slugifyForMatch(str(a.language) || str(a.name));
      const langB = slugifyForMatch(str(b.language) || str(b.name));
      return langA !== "" && langA === langB;
    }

    case "social": {
      const platA = slugifyForMatch(str(a.platform));
      const platB = slugifyForMatch(str(b.platform));
      return platA !== "" && platA === platB;
    }

    case "music": {
      const titleA = slugifyForMatch(str(a.title));
      const titleB = slugifyForMatch(str(b.title));
      const artistA = slugifyForMatch(str(a.artist));
      const artistB = slugifyForMatch(str(b.artist));
      // Both title and artist must be non-empty to avoid false positives
      return (
        titleA !== "" &&
        artistA !== "" &&
        titleA === titleB &&
        artistA === artistB
      );
    }

    case "activity": {
      const nA = slugifyForMatch(str(a.name));
      const nB = slugifyForMatch(str(b.name));
      return nA !== "" && nA === nB;
    }

    case "project": {
      const nameA = slugifyForMatch(str(a.name));
      const nameB = slugifyForMatch(str(b.name));
      const urlA = str(a.url);
      const urlB = str(b.url);
      const nameMatch = nameA !== "" && nameA === nameB;
      const urlMatch = urlA !== "" && urlB !== "" && urlA === urlB;
      return nameMatch || urlMatch;
    }

    case "contact": {
      return (
        str(a.type) === str(b.type) &&
        str(a.type) !== "" &&
        str(a.value) === str(b.value) &&
        str(a.value) !== ""
      );
    }

    case "achievement": {
      const titleA = slugifyForMatch(str(a.title));
      const titleB = slugifyForMatch(str(b.title));
      return titleA !== "" && titleA === titleB;
    }

    case "reading": {
      const titleA = slugifyForMatch(str(a.title));
      const titleB = slugifyForMatch(str(b.title));
      const authorA = slugifyForMatch(str(a.author));
      const authorB = slugifyForMatch(str(b.author));
      return (
        titleA !== "" &&
        authorA !== "" &&
        titleA === titleB &&
        authorA === authorB
      );
    }

    case "stat": {
      const labelA = slugifyForMatch(str(a.label));
      const labelB = slugifyForMatch(str(b.label));
      return labelA !== "" && labelA === labelB;
    }

    case "identity": {
      // Always false — identity facts are intentionally not deduplicated
      return false;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Connector key prefix detection
// ---------------------------------------------------------------------------

const CONNECTOR_KEY_PREFIX_RE = /^(li-|gh-|sp-|strava-|rss-)/;

/**
 * Pick the canonical key for a cluster, preferring non-connector-prefixed keys.
 * If both or neither are connector-prefixed, prefer the existing fact's key.
 */
export function pickCanonicalKey(
  newSource: string,
  newFactKey: string,
  existingFact: FactRow
): string {
  const newKey = newFactKey;
  const existingKey = existingFact.key;

  const newIsConnector = CONNECTOR_KEY_PREFIX_RE.test(newKey);
  const existingIsConnector = CONNECTOR_KEY_PREFIX_RE.test(existingKey);

  // Prefer non-connector key
  if (!newIsConnector && existingIsConnector) return newKey;
  if (newIsConnector && !existingIsConnector) return existingKey;

  // Both same type: prefer existing
  return existingKey;
}

/**
 * Update the canonical key of a cluster if a better key is now available.
 */
export function updateCanonicalKey(
  clusterId: string,
  newSource: string,
  newFactKey: string,
  existingFact: FactRow
): void {
  const preferred = pickCanonicalKey(newSource, newFactKey, existingFact);

  // Get the current canonical key from the cluster
  const cluster = db
    .select()
    .from(factClusters)
    .where(eq(factClusters.id, clusterId))
    .get() as { canonicalKey: string | null } | undefined;

  if (!cluster) return;

  if (cluster.canonicalKey !== preferred) {
    db.update(factClusters)
      .set({ canonicalKey: preferred, updatedAt: new Date().toISOString() })
      .where(eq(factClusters.id, clusterId))
      .run();
  }
}

// ---------------------------------------------------------------------------
// tryAssignCluster
// ---------------------------------------------------------------------------

/**
 * Attempt to assign a newly-created fact to an existing cluster.
 * Synchronous — uses better-sqlite3 via Drizzle.
 *
 * Returns null if:
 *  - category is "identity"
 *  - no identity match found among existing active facts
 */
export function tryAssignCluster(
  input: ClusterAssignInput
): ClusterAssignResult {
  const { factId, factKey, category, value, source, ownerKey, sessionId } = input;

  // Identity facts are never clustered
  if (category === "identity") return null;

  // Build the where clause depending on flag
  const ownerFilter = PROFILE_ID_CANONICAL
    ? eq(facts.profileId, ownerKey)
    : eq(facts.sessionId, sessionId);

  // Query active facts in same category, excluding self
  const candidates = db
    .select()
    .from(facts)
    .where(
      and(
        ownerFilter,
        eq(facts.category, category),
        ne(facts.id, factId),
        isNull(facts.archivedAt)
      )
    )
    .all() as FactRow[];

  // Find first matching fact
  for (const candidate of candidates) {
    const candidateValue =
      typeof candidate.value === "string"
        ? (JSON.parse(candidate.value) as Record<string, unknown>)
        : (candidate.value as Record<string, unknown>);

    if (!identityMatch(category, value, candidateValue)) continue;

    if (candidate.clusterId) {
      // Assign new fact to existing cluster (atomic)
      const clusterId = candidate.clusterId;

      return sqlite.transaction(() => {
        db.update(facts)
          .set({ clusterId })
          .where(eq(facts.id, factId))
          .run();

        updateCanonicalKey(clusterId, source, factKey, candidate);

        // Read back canonical key
        const cluster = db
          .select()
          .from(factClusters)
          .where(eq(factClusters.id, clusterId))
          .get() as { canonicalKey: string | null } | undefined;

        return {
          clusterId,
          isNew: false,
          matchedFactId: candidate.id,
          canonicalKey: cluster?.canonicalKey ?? candidate.key,
        };
      })();
    } else {
      // Neither fact has a cluster — create one (atomic)
      const clusterId = randomUUID();
      const canonicalKey = pickCanonicalKey(source, factKey, candidate);

      return sqlite.transaction(() => {
        db.insert(factClusters)
          .values({
            id: clusterId,
            ownerKey,
            category,
            canonicalKey,
          })
          .run();

        // Assign both facts to the new cluster
        db.update(facts)
          .set({ clusterId })
          .where(eq(facts.id, candidate.id))
          .run();

        db.update(facts)
          .set({ clusterId })
          .where(eq(facts.id, factId))
          .run();

        return {
          clusterId,
          isNew: true,
          matchedFactId: candidate.id,
          canonicalKey,
        };
      })();
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// projectClusteredFacts
// ---------------------------------------------------------------------------

/** Source priority for projection (lower = higher priority) */
const SOURCE_PRIORITY: Record<string, number> = {
  user: 0,
  chat: 1,
  worker: 2,
  connector: 3,
};

function getSourcePriority(source: string | null): number {
  return SOURCE_PRIORITY[source ?? "chat"] ?? 2;
}

export type ProjectedFact = FactRow & {
  sources: string[];
  clusterSize: number;
  clusterId: string | null;
  memberIds: string[];  // ALL fact IDs in this cluster (or [self] if unclustered)
};

type ClusterRow = {
  id: string;
  ownerKey: string;
  category: string;
  canonicalKey: string | null;
};

/**
 * Project clustered facts into virtual enriched facts.
 * Each cluster becomes a single ProjectedFact with merged fields.
 * Unclustered facts pass through as-is.
 */
export function projectClusteredFacts(
  allFacts: (FactRow & { clusterId: string | null })[],
  clusters: ClusterRow[],
): ProjectedFact[] {
  const clusterMap = new Map<string, typeof allFacts>();
  const unclustered: typeof allFacts = [];

  for (const fact of allFacts) {
    if (fact.clusterId) {
      const list = clusterMap.get(fact.clusterId) ?? [];
      list.push(fact);
      clusterMap.set(fact.clusterId, list);
    } else {
      unclustered.push(fact);
    }
  }

  const projected: ProjectedFact[] = [];

  // Unclustered → pass through
  for (const fact of unclustered) {
    projected.push({
      ...fact,
      sources: [fact.source ?? "chat"],
      clusterSize: 1,
      clusterId: null,
      memberIds: [fact.id],
    });
  }

  // Clustered → project
  for (const [clusterId, clusterFacts] of clusterMap) {
    const cluster = clusters.find((c) => c.id === clusterId);

    // Sort by source priority (highest priority first)
    const sorted = [...clusterFacts].sort(
      (a, b) => getSourcePriority(a.source) - getSourcePriority(b.source),
    );
    const primary = sorted[0];

    // Per-field resolution: highest-priority source with non-empty value wins
    const mergedValue: Record<string, unknown> = {};
    for (const fact of sorted) {
      const val =
        typeof fact.value === "object" && fact.value !== null
          ? (fact.value as Record<string, unknown>)
          : {};
      for (const [field, value] of Object.entries(val)) {
        if (
          mergedValue[field] === undefined ||
          mergedValue[field] === null ||
          mergedValue[field] === ""
        ) {
          mergedValue[field] = value;
        }
      }
    }

    // Visibility resolution: private wins, then public, then proposed
    const visibility = resolveClusterVisibility(clusterFacts);

    projected.push({
      ...primary,
      key: cluster?.canonicalKey ?? primary.key,
      value: mergedValue,
      visibility,
      sources: [...new Set(clusterFacts.map((f) => f.source ?? "chat"))],
      clusterSize: clusterFacts.length,
      clusterId,
      memberIds: clusterFacts.map((f) => f.id),
    });
  }

  return projected.sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

// ---------------------------------------------------------------------------
// getProjectedFacts
// ---------------------------------------------------------------------------

/**
 * Load active facts for an owner and return the projected (cluster-resolved) view.
 * Drop-in replacement for getActiveFacts() in read paths.
 */
export function getProjectedFacts(
  sessionId: string,
  sessionIds?: string[],
): ProjectedFact[] {
  const rawFacts = getActiveFacts(sessionId, sessionIds);

  // Load clusters for all clustered facts
  const clusterIds = [...new Set(
    rawFacts
      .map((f: any) => f.clusterId)
      .filter((id: string | null): id is string => id !== null),
  )];

  if (clusterIds.length === 0) {
    // No clusters — all facts pass through
    return rawFacts.map((f: FactRow) => ({
      ...f,
      sources: [f.source ?? "chat"],
      clusterSize: 1,
      clusterId: (f as any).clusterId ?? null,
      memberIds: [f.id],
    }));
  }

  const clusters = db
    .select()
    .from(factClusters)
    .where(inArray(factClusters.id, clusterIds))
    .all() as ClusterRow[];

  return projectClusteredFacts(rawFacts as any, clusters);
}

function resolveClusterVisibility(
  clusterFacts: Array<{ visibility: string | null }>,
): string {
  const visibilities = clusterFacts.map((f) => f.visibility ?? "proposed");
  if (visibilities.includes("private")) return "private";
  if (visibilities.includes("public")) return "public";
  return "proposed";
}
