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
import { saveMemoryFromWorker } from "@/lib/services/memory-service";
import { getPreferences } from "@/lib/services/preferences-service";
import { DEEP_HEARTBEAT_MIN_FACTS } from "@/lib/agent/thresholds";

type HeartbeatPayload = {
  ownerKey: string;
  /** Owner-local date (YYYY-MM-DD) captured at enqueue time — ensures correct day/week
   *  even when job execution is delayed past midnight. Falls back to computing at handler start. */
  ownerDay?: string;
};

/**
 * Global housekeeping — runs once per scheduler tick, not per-owner.
 * All operations are table-wide, idempotent, zero LLM cost.
 */
export function runGlobalHousekeeping(): void {
  try {
    const expired = expireStaleProposals(48);
    if (expired > 0) {
      logEvent({
        eventType: "housekeeping",
        actor: "worker",
        payload: { action: "expire_proposals", expired },
      });
    }
  } catch (err) {
    console.error("[housekeeping] Expire proposals failed:", err);
  }

  try {
    const cleaned = cleanupExpiredCache(30);
    if (cleaned > 0) {
      logEvent({
        eventType: "housekeeping",
        actor: "worker",
        payload: { action: "cache_cleanup", cleaned },
      });
    }
  } catch (err) {
    console.error("[housekeeping] Cache cleanup failed:", err);
  }
}

/**
 * Light heartbeat (daily): owner-scoped deterministic housekeeping — no LLM, no token cost.
 *
 * Global maintenance (expire proposals, cache cleanup) is handled by `runGlobalHousekeeping()`
 * which runs once per scheduler tick, not per-owner.
 *
 * Owner-scoped work:
 * - Dismiss old conflicts (>7 days)
 * - Mark stale proposals (hash mismatch)
 * - Journal pattern analysis (heuristic, no LLM)
 */
export function handleHeartbeatLight(payload: Record<string, unknown>): void {
  const { ownerKey, ownerDay: payloadOwnerDay } = payload as HeartbeatPayload;
  if (!ownerKey) throw new Error("heartbeat_light: missing ownerKey");

  const startMs = Date.now();
  const config = getHeartbeatConfig(ownerKey);
  // Use ownerDay from payload (set at enqueue time) — ensures correct day even if
  // job execution is delayed. Falls back to computing at handler start.
  const ownerDay = payloadOwnerDay ?? computeOwnerDay(config.timezone);

  // Global budget check (light is cheap but we still respect global gate)
  const globalBudget = checkBudget();
  if (!globalBudget.allowed) {
    recordHeartbeatRun(ownerKey, "light", "budget_exceeded", 0, ownerDay, startMs);
    return;
  }

  // Per-owner budget check
  const ownerBudget = checkOwnerBudget(ownerKey, "light", config);
  if (!ownerBudget.allowed) {
    recordHeartbeatRun(ownerKey, "light", "budget_exceeded", 0, ownerDay, startMs);
    return;
  }

  // --- Owner-scoped deterministic housekeeping ---

  // Dismiss conflicts older than 7 days
  const dismissed = dismissOldConflicts(ownerKey, 7);

  // Mark stale proposals (hash mismatch)
  try {
    markStaleProposals(ownerKey);
  } catch (err) {
    console.error("[heartbeat-light] Stale proposal cleanup failed:", err);
  }

  // Journal pattern analysis (heuristic — no LLM)
  let journalPatternCount = 0;
  try {
    const recentJournals = getRecentJournalEntries(ownerKey, 5);
    const patterns = detectJournalPatterns(recentJournals);
    for (const pattern of patterns) {
      const saved = saveMemoryFromWorker(
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
    console.error("[heartbeat-light] Journal pattern analysis failed:", err);
  }

  const outcome = dismissed > 0 || journalPatternCount > 0 ? "action_taken" : "ok";
  recordHeartbeatRun(ownerKey, "light", outcome, 0, ownerDay, startMs);

  if (dismissed > 0) {
    logEvent({
      eventType: "heartbeat_action",
      actor: "worker",
      payload: { ownerKey, action: "dismiss_conflicts", dismissed },
    });
  }
}

/**
 * Deep heartbeat (weekly): LLM-dependent analysis only.
 *
 * Only runs for owners with sufficient facts (gated in scheduler).
 * - Conformity analysis + LLM rewrites (reasoning tier)
 * - Page coherence check (fast tier)
 */
export async function handleHeartbeatDeep(payload: Record<string, unknown>): Promise<void> {
  const { ownerKey, ownerDay: payloadOwnerDay } = payload as HeartbeatPayload;
  if (!ownerKey) throw new Error("heartbeat_deep: missing ownerKey");

  const startMs = Date.now();
  const config = getHeartbeatConfig(ownerKey);
  // Use ownerDay from payload (set at enqueue time) — ensures correct day/week even if
  // job execution is delayed past midnight. Falls back to computing at handler start.
  const ownerDay = payloadOwnerDay ?? computeOwnerDay(config.timezone);
  const scope = resolveOwnerScopeForWorker(ownerKey);

  // Execution-time recheck: owner may have dropped below threshold since scheduling.
  // Use cognitiveOwnerKey (= profileId in canonical mode) — same as getActiveFacts uses internally.
  const activeFacts = getActiveFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);
  if (activeFacts.length < DEEP_HEARTBEAT_MIN_FACTS) {
    // Do NOT record a heartbeat_runs row — allow retry later this week if facts recover
    return;
  }

  // Budget checks — do NOT record a run on budget_exceeded so the weekly
  // scheduling window remains open for retry when budget recovers.
  const globalBudget = checkBudget();
  if (!globalBudget.allowed) return;

  const ownerBudget = checkOwnerBudget(ownerKey, "deep", config);
  if (!ownerBudget.allowed) return;

  // Track whether at least one LLM substep completed successfully.
  // If all substeps fail, we don't record a run — allowing retry.
  let conformityCompleted = false;
  let coherenceCompleted = false;

  // Conformity check (LLM: reasoning tier)
  let conformityActions = 0;
  try {
    const preferences = getPreferences(scope.knowledgePrimaryKey);
    const personalizationLanguage = preferences.language ?? preferences.factLanguage ?? "en";
    const activeCopies = getAllActiveCopies(ownerKey, personalizationLanguage);
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
              language: personalizationLanguage,
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
    // Mark completed only after ALL conformity work (analysis + rewrites + proposals) succeeds
    conformityCompleted = true;
  } catch (err) {
    console.error("[heartbeat-deep] Conformity check failed:", err);
  }

  // Coherence check (LLM: fast tier)
  let coherenceWarningCount = 0;
  try {
    const draft = getDraft(scope.knowledgePrimaryKey);
    if (draft?.config) {
      const parsed = typeof draft.config === "string" ? JSON.parse(draft.config) : draft.config;
      const coherenceFacts = getActiveFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);
      const soulCompiled = getActiveSoul(ownerKey)?.compiled;
      const coherenceIssues = await checkPageCoherence(parsed.sections ?? [], coherenceFacts, soulCompiled);

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
    // Mark completed only after ALL coherence work (analysis + metadata storage) succeeds
    coherenceCompleted = true;
  } catch (err) {
    console.error("[heartbeat-deep] Coherence check failed:", err);
  }

  // Only record a successful run if both substeps completed (or were trivially skipped).
  // If either failed, don't record — allows retry within the weekly window.
  if (conformityCompleted && coherenceCompleted) {
    const outcome = conformityActions > 0 || coherenceWarningCount > 0 ? "action_taken" : "ok";
    recordHeartbeatRun(ownerKey, "deep", outcome, 0, ownerDay, startMs);
  }
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
  ownerDay: string,
  startMs: number,
): void {
  const durationMs = Date.now() - startMs;

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
