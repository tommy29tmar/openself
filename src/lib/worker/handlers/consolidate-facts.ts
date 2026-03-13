import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getActiveFacts } from "@/lib/services/kb-service";
import { tryAssignCluster } from "@/lib/services/fact-cluster-service";
import { logEvent } from "@/lib/services/event-service";

/**
 * Worker handler: consolidate unclustered facts using deterministic matching.
 * Phase 1: deterministic slug-based clustering for facts tryAssignCluster missed.
 * Phase 2 (future): LLM-based near-duplicate detection for ambiguous cases.
 */
export async function handleConsolidateFacts(
  payload: Record<string, unknown>,
): Promise<void> {
  const ownerKey = payload.ownerKey as string;
  if (!ownerKey) throw new Error("consolidate_facts: missing ownerKey");

  const scope = resolveOwnerScopeForWorker(ownerKey);
  const allFacts = getActiveFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);

  // Find unclustered facts
  const unclustered = allFacts.filter((f: any) => !f.clusterId);
  if (unclustered.length === 0) {
    logEvent({
      eventType: "consolidate_facts_skip",
      actor: "worker",
      payload: { ownerKey, reason: "no_unclustered_facts" },
    });
    return;
  }

  // Group unclustered facts by category
  const byCategory = new Map<string, typeof unclustered>();
  for (const fact of unclustered) {
    const list = byCategory.get(fact.category) ?? [];
    list.push(fact);
    byCategory.set(fact.category, list);
  }

  let clustersCreated = 0;
  let factsAssigned = 0;

  // Deterministic pass: try to cluster unclustered facts against ALL facts (including clustered ones)
  for (const [category, categoryFacts] of byCategory) {
    if (category === "identity") continue;
    if (categoryFacts.length < 1) continue;

    for (const fact of categoryFacts) {
      // Skip if already assigned by a previous iteration
      if ((fact as any)._assigned) continue;

      const result = tryAssignCluster({
        factId: fact.id,
        factKey: fact.key,
        category,
        value: typeof fact.value === "object" && fact.value !== null
          ? (fact.value as Record<string, unknown>)
          : {},
        source: fact.source ?? "chat",
        ownerKey: scope.cognitiveOwnerKey,
        sessionId: scope.knowledgePrimaryKey,
      });

      if (result) {
        factsAssigned++;
        if (result.isNew) clustersCreated++;
        (fact as any)._assigned = true;
      }
    }
  }

  // TODO Phase 2: LLM pass for remaining unclustered facts (confidence-based)
  // Gated by: checkBudget() + at least 2 unclustered facts in same category after deterministic pass

  logEvent({
    eventType: "consolidate_facts_complete",
    actor: "worker",
    payload: {
      ownerKey,
      totalFacts: allFacts.length,
      unclusteredBefore: unclustered.length,
      clustersCreated,
      factsAssigned,
    },
  });
}
