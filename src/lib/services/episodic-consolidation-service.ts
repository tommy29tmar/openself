// src/lib/services/episodic-consolidation-service.ts
import { sqlite } from "@/lib/db";
import { insertEpisodicProposal, isActionTypeOnCooldown } from "@/lib/services/episodic-service";
import { generateText } from "ai";
import { getModelForTier, getModelIdForTier, getProviderForTier } from "@/lib/ai/provider";
import { checkBudget, recordUsage } from "@/lib/services/usage-service";

const MIN_EVENTS = 3;
const WINDOW_DAYS = 60;
const RECENCY_DAYS = 30;
const DAY_SECONDS = 86400;

export type CandidatePattern = { actionType: string; eventCount: number; lastEventAtUnix: number };

/**
 * Pure deterministic check — no LLM, no side effects.
 * Blocks action_types with status IN ('pending','accepted').
 * Accepted = habit already in user's profile, no re-proposal needed.
 */
export function checkPatternThresholds(ownerKey: string): CandidatePattern[] {
  const now = Math.floor(Date.now() / 1000);
  const windowFrom = now - WINDOW_DAYS * DAY_SECONDS;
  const recencyFrom = now - RECENCY_DAYS * DAY_SECONDS;

  const rows = sqlite.prepare(`
    SELECT action_type, COUNT(*) as cnt, MAX(event_at_unix) as latest
    FROM episodic_events
    WHERE owner_key = ? AND event_at_unix >= ?
      AND superseded_by IS NULL AND archived = 0
      AND source = 'chat'
    GROUP BY action_type HAVING cnt >= ?
  `).all(ownerKey, windowFrom, MIN_EVENTS) as Array<{ action_type: string; cnt: number; latest: number }>;

  const blockedRows = sqlite.prepare(`
    SELECT DISTINCT action_type FROM episodic_pattern_proposals
    WHERE owner_key = ? AND (
        (status = 'accepted') OR
        (status = 'pending' AND julianday(expires_at) >= julianday('now'))
      )
  `).all(ownerKey) as Array<{ action_type: string }>;
  const blockedTypes = new Set(blockedRows.map(r => r.action_type));

  const candidates: CandidatePattern[] = [];
  for (const row of rows) {
    if (row.latest < recencyFrom) continue;
    if (isActionTypeOnCooldown(ownerKey, row.action_type)) continue;
    if (blockedTypes.has(row.action_type)) continue;
    candidates.push({ actionType: row.action_type, eventCount: row.cnt, lastEventAtUnix: row.latest });
  }
  return candidates;
}

export async function consolidateEpisodesForOwner(ownerKey: string): Promise<number> {
  // R7-2: Auto-expire stale pending proposals before candidate detection + INSERT.
  sqlite.prepare(`
    UPDATE episodic_pattern_proposals
    SET status = 'expired', resolved_at = datetime('now')
    WHERE owner_key = ? AND status = 'pending'
      AND julianday(expires_at) < julianday('now')
  `).run(ownerKey);

  const candidates = checkPatternThresholds(ownerKey);
  if (candidates.length === 0) return 0;
  let created = 0;
  for (const candidate of candidates) {
    const result = await evaluatePatternWithLLM(candidate);
    if (!result.worthy) continue;
    try {
      insertEpisodicProposal({
        ownerKey, actionType: candidate.actionType,
        patternSummary: result.summary,
        eventCount: candidate.eventCount, lastEventAtUnix: candidate.lastEventAtUnix,
      });
      created++;
    } catch (err) {
      const isUnique = err instanceof Error && err.message.includes("UNIQUE constraint failed");
      if (!isUnique) throw err;
    }
  }
  return created;
}

async function evaluatePatternWithLLM(candidate: CandidatePattern): Promise<{ worthy: boolean; summary: string }> {
  try {
    const budget = checkBudget();
    if (!budget.allowed) return { worthy: false, summary: "" };
    const model = getModelForTier("fast");
    const modelId = getModelIdForTier("fast");
    const provider = getProviderForTier("fast");
    const { text, usage } = await generateText({
      model,
      prompt: `Is "${candidate.actionType}" (${candidate.eventCount} times in 60 days) worth adding to a personal profile?
Answer JSON only: { "worthy": true/false, "summary": "one sentence if worthy, empty if not" }
worthy=true: voluntary, recurring, meaningful. NOT: commuting, groceries, TV. Max 100 chars.`,
      maxTokens: 80,
    });
    if (usage) recordUsage(provider, modelId, usage.promptTokens ?? 0, usage.completionTokens ?? 0);
    const parsed = JSON.parse(text.trim());
    if (typeof parsed.worthy !== "boolean") return { worthy: false, summary: "" };
    return { worthy: parsed.worthy, summary: String(parsed.summary ?? "").slice(0, 100) };
  } catch {
    return { worthy: false, summary: "" };
  }
}
