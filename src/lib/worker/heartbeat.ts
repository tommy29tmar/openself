import { randomUUID } from "crypto";
import { db, sqlite } from "@/lib/db";
import { heartbeatRuns } from "@/lib/db/schema";
import {
  getHeartbeatConfig,
  computeOwnerDay,
  checkOwnerBudget,
} from "@/lib/services/heartbeat-config-service";
import { checkBudget } from "@/lib/services/usage-service";
import { expireStaleProposals, getActiveSoul } from "@/lib/services/soul-service";
import { logEvent } from "@/lib/services/event-service";
import { analyzeConformity, generateRewrite } from "@/lib/services/conformity-analyzer";
import { getAllActiveCopies } from "@/lib/services/section-copy-state-service";
import { cleanupExpiredCache } from "@/lib/services/section-cache-service";
import { createProposal, markStaleProposals } from "@/lib/services/proposal-service";
import { computeHash } from "@/lib/services/personalization-hashing";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getDraft } from "@/lib/services/page-service";
import { getActiveFacts } from "@/lib/services/kb-service";
import { checkPageCoherence } from "@/lib/services/coherence-check";
import { mergeSessionMeta, getRecentJournalEntries } from "@/lib/services/session-metadata";
import { detectJournalPatterns } from "@/lib/services/journal-patterns";
import { saveMemory } from "@/lib/services/memory-service";

type HeartbeatPayload = {
  ownerKey: string;
};

/**
 * Light heartbeat (daily): KB freshness, page staleness, expire proposals.
 */
export function handleHeartbeatLight(payload: Record<string, unknown>): void {
  const { ownerKey } = payload as HeartbeatPayload;
  if (!ownerKey) throw new Error("heartbeat_light: missing ownerKey");

  const startMs = Date.now();
  const config = getHeartbeatConfig(ownerKey);

  // Global budget check
  const globalBudget = checkBudget();
  if (!globalBudget.allowed) {
    recordHeartbeatRun(ownerKey, "light", "budget_exceeded", 0, config.timezone, startMs);
    return;
  }

  // Per-owner budget check
  const ownerBudget = checkOwnerBudget(ownerKey, "light", config);
  if (!ownerBudget.allowed) {
    recordHeartbeatRun(ownerKey, "light", "budget_exceeded", 0, config.timezone, startMs);
    return;
  }

  // Expire stale soul proposals
  const expired = expireStaleProposals(48);

  const outcome = expired > 0 ? "action_taken" : "ok";
  recordHeartbeatRun(ownerKey, "light", outcome, 0, config.timezone, startMs);

  if (expired > 0) {
    logEvent({
      eventType: "heartbeat_action",
      actor: "worker",
      payload: { ownerKey, action: "expire_proposals", expired },
    });
  }
}

/**
 * Deep heartbeat (weekly): cross-section coherence, soul review, conflict cleanup,
 * conformity analysis, stale proposal cleanup, and cache TTL cleanup.
 */
export async function handleHeartbeatDeep(payload: Record<string, unknown>): Promise<void> {
  const { ownerKey } = payload as HeartbeatPayload;
  if (!ownerKey) throw new Error("heartbeat_deep: missing ownerKey");

  const startMs = Date.now();
  const config = getHeartbeatConfig(ownerKey);

  // Global budget check
  const globalBudget = checkBudget();
  if (!globalBudget.allowed) {
    recordHeartbeatRun(ownerKey, "deep", "budget_exceeded", 0, config.timezone, startMs);
    return;
  }

  // Per-owner budget check
  const ownerBudget = checkOwnerBudget(ownerKey, "deep", config);
  if (!ownerBudget.allowed) {
    recordHeartbeatRun(ownerKey, "deep", "budget_exceeded", 0, config.timezone, startMs);
    return;
  }

  // Expire stale soul proposals
  const expired = expireStaleProposals(48);

  // Dismiss conflicts older than 7 days
  const dismissed = dismissOldConflicts(ownerKey, 7);

  // Phase 1c: Conformity check
  let conformityActions = 0;
  try {
    const activeCopies = getAllActiveCopies(ownerKey, "en"); // TODO: get language from preferences
    const soul = getActiveSoul(ownerKey);
    if (activeCopies.length > 0 && soul?.compiled) {
      const issues = await analyzeConformity(activeCopies, soul.compiled, ownerKey);
      if (issues.length > 0) {
        for (const issue of issues) {
          const copy = activeCopies.find(c => c.sectionType === issue.sectionType);
          if (!copy) continue;
          const rewrite = await generateRewrite(
            issue.sectionType,
            copy.personalizedContent,
            issue,
            soul.compiled,
          );
          if (rewrite) {
            createProposal({
              ownerKey,
              sectionType: issue.sectionType,
              language: "en",
              currentContent: copy.personalizedContent,
              proposedContent: JSON.stringify(rewrite),
              issueType: issue.issueType,
              reason: issue.reason,
              severity: issue.severity,
              factsHash: copy.factsHash,
              soulHash: copy.soulHash,
              baselineStateHash: computeHash(copy.personalizedContent),
            });
            conformityActions++;
          }
        }
        logEvent({
          eventType: "conformity_check",
          actor: "worker",
          payload: { ownerKey, issues: issues.length, proposals: conformityActions },
        });
      }
    }
  } catch (err) {
    console.error("[heartbeat] Conformity check failed:", err);
  }

  // Phase 1c: Mark stale proposals
  try {
    markStaleProposals(ownerKey);
  } catch (err) {
    console.error("[heartbeat] Stale proposal cleanup failed:", err);
  }

  // Phase 1c: Cache TTL cleanup
  try {
    cleanupExpiredCache(30);
  } catch (err) {
    console.error("[heartbeat] Cache cleanup failed:", err);
  }

  // Circuit D2: coherence check → session metadata + event log
  let coherenceWarningCount = 0;
  try {
    const scope = resolveOwnerScopeForWorker(ownerKey);
    const draft = getDraft(scope.knowledgePrimaryKey);
    if (draft?.config) {
      const parsed = typeof draft.config === "string" ? JSON.parse(draft.config) : draft.config;
      const activeFacts = getActiveFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);
      const soulCompiled = getActiveSoul(ownerKey)?.compiled;
      const coherenceIssues = await checkPageCoherence(parsed.sections ?? [], activeFacts, soulCompiled);
      const warnings = coherenceIssues.filter(i => i.severity === "warning");
      const infos = coherenceIssues.filter(i => i.severity === "info");

      // Store in session metadata; null when empty to clear stale data
      const anchorSession = scope.knowledgePrimaryKey;
      mergeSessionMeta(anchorSession, {
        coherenceWarnings: warnings.length > 0 ? warnings : null,
        coherenceInfos: infos.length > 0 ? infos : null,
      });

      coherenceWarningCount = warnings.length + infos.length;
      if (coherenceWarningCount > 0) {
        logEvent({
          eventType: "heartbeat_coherence",
          actor: "worker",
          payload: { ownerKey, warningsFound: warnings.length, infosFound: infos.length },
        });
      }
    }
  } catch (err) {
    console.error("[heartbeat] Coherence check failed:", err);
  }

  // Circuit F2: journal patterns → meta-memories
  let journalPatternCount = 0;
  try {
    const recentJournals = getRecentJournalEntries(ownerKey, 5);
    const patterns = detectJournalPatterns(recentJournals);
    for (const pattern of patterns) {
      const saved = saveMemory(
        ownerKey,
        `${pattern.description}. ${pattern.suggestion}`,
        "pattern",
        "journal_analysis",
      );
      if (saved) journalPatternCount++;
    }
    if (journalPatternCount > 0) {
      logEvent({
        eventType: "heartbeat_journal_patterns",
        actor: "worker",
        payload: { ownerKey, patternsFound: journalPatternCount },
      });
    }
  } catch (err) {
    console.error("[heartbeat] Journal pattern analysis failed:", err);
  }

  const outcome = expired > 0 || dismissed > 0 || conformityActions > 0 || coherenceWarningCount > 0 || journalPatternCount > 0 ? "action_taken" : "ok";
  recordHeartbeatRun(ownerKey, "deep", outcome, 0, config.timezone, startMs);
}

function dismissOldConflicts(ownerKey: string, days: number): number {
  const result = sqlite
    .prepare(
      `UPDATE fact_conflicts SET status = 'dismissed', resolved_at = datetime('now')
       WHERE owner_key = ? AND status = 'open' AND created_at < datetime('now', '-${days} days')`,
    )
    .run(ownerKey);
  return result.changes;
}

function recordHeartbeatRun(
  ownerKey: string,
  runType: "light" | "deep",
  outcome: string,
  estimatedCostUsd: number,
  timezone: string,
  startMs: number,
): void {
  const durationMs = Date.now() - startMs;
  const ownerDay = computeOwnerDay(timezone);

  db.insert(heartbeatRuns)
    .values({
      id: randomUUID(),
      ownerKey,
      runType,
      ownerDay,
      outcome,
      estimatedCostUsd,
      durationMs,
    })
    .run();
}
