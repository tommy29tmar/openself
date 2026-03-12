import { eq, and, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, sqlite } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { logEvent } from "@/lib/services/event-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { upsertDraft } from "@/lib/services/page-service";
import { getActiveFacts } from "@/lib/services/kb-service";
import { generateSummary } from "@/lib/services/summary-service";
import { handleHeartbeatLight, handleHeartbeatDeep } from "./heartbeat";
import { expireStaleProposals } from "@/lib/services/soul-service";
import { handleConnectorSync } from "@/lib/connectors/connector-sync-handler";
import { runSessionCompaction, persistCompactionLog, getLastCompactionRowid } from "@/lib/services/session-compaction-service";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { consolidateEpisodesHandler } from "@/lib/worker/handlers/consolidate-episodes";
import { saveMemoryFromWorker } from "@/lib/services/memory-service";
import "@/lib/connectors/register-all";

const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = [1, 5, 15];

type JobRow = typeof jobs.$inferSelect;

type JobHandler = (payload: Record<string, unknown>) => void | Promise<void>;

function getPageJobContext(payload: Record<string, unknown>) {
  const username = payload.username as string;
  const language = (payload.language as string) ?? "en";
  const legacySessionId = (payload.sessionId as string) ?? "__default__";
  const ownerKey = typeof payload.ownerKey === "string" && payload.ownerKey.length > 0
    ? payload.ownerKey
    : legacySessionId;
  const scope = resolveOwnerScopeForWorker(ownerKey);
  const payloadReadKeys = Array.isArray(payload.readKeys)
    ? payload.readKeys.filter((key): key is string => typeof key === "string" && key.length > 0)
    : [];
  const readKeys = payloadReadKeys.length > 0 ? payloadReadKeys : scope.knowledgeReadKeys;
  const draftSessionId = typeof payload.ownerKey === "string" && payload.ownerKey.length > 0
    ? scope.knowledgePrimaryKey
    : legacySessionId;

  return {
    username,
    language,
    readKeys,
    draftSessionId,
    profileId: scope.cognitiveOwnerKey,
  };
}

const handlers: Record<string, JobHandler> = {
  page_synthesis: (payload) => {
    const { username, language, readKeys, draftSessionId, profileId } = getPageJobContext(payload);
    const facts = getActiveFacts(profileId, readKeys);
    const config = composeOptimisticPage(facts, username, language, undefined, undefined, profileId);
    upsertDraft(username, config, draftSessionId, profileId);
  },

  memory_summary: async (payload) => {
    const ownerKey = payload.ownerKey as string;
    const scope = resolveOwnerScopeForWorker(ownerKey);
    const payloadKeys = Array.isArray(payload.messageKeys)
      ? payload.messageKeys.filter((k): k is string => typeof k === "string" && k.length > 0)
      : [];
    const messageKeys = Array.from(new Set([...scope.knowledgeReadKeys, ...payloadKeys]));
    await generateSummary(ownerKey, messageKeys);
  },

  heartbeat_light: (payload) => {
    handleHeartbeatLight(payload);
  },

  heartbeat_deep: (payload) => {
    handleHeartbeatDeep(payload);
  },

  expire_proposals: () => {
    expireStaleProposals(48);
  },

  soul_proposal: () => {
    // Placeholder — soul proposals are created via agent tool, not worker
  },

  connector_sync: handleConnectorSync,

  page_regen: (payload) => {
    const { username, language, readKeys, draftSessionId, profileId } = getPageJobContext(payload);
    const facts = getActiveFacts(profileId, readKeys);
    const config = composeOptimisticPage(facts, username, language, undefined, undefined, profileId);
    upsertDraft(username, config, draftSessionId, profileId);
  },

  taxonomy_review: () => {
    // Placeholder — taxonomy review not yet implemented
  },

  session_compaction: async (payload: Record<string, unknown>) => {
    const ownerKey = payload.ownerKey as string;
    const sessionKey = payload.sessionKey as string;
    if (!ownerKey || !sessionKey) { console.warn("[worker] session_compaction: missing keys", payload); return; }

    const scope = resolveOwnerScopeForWorker(ownerKey);
    const MAX_WINDOWS = 5;
    let lastRowsLength = 0;

    for (let window = 0; window < MAX_WINDOWS; window++) {
      const lastRowid = getLastCompactionRowid(sessionKey);

      const rows = sqlite.prepare(`
        SELECT rowid, role, content FROM messages
        WHERE session_id = ? AND rowid > ?
        ORDER BY rowid ASC LIMIT 40
      `).all(sessionKey, lastRowid) as Array<{ rowid: number; role: string; content: string }>;

      lastRowsLength = rows.length;

      if (rows.length < 4) {
        if (window === 0) console.info(`[worker] session_compaction: skip ${sessionKey} — ${rows.length} new msgs`);
        lastRowsLength = 0; // not a full window, no continuation needed
        break;
      }

      const cursorRowid = rows[rows.length - 1].rowid;
      const result = await runSessionCompaction({ ownerKey, sessionKey, messages: rows, knowledgeReadKeys: scope.knowledgeReadKeys });
      persistCompactionLog(ownerKey, sessionKey, cursorRowid, result);

      if (result.success && result.structuredSummary) {
        for (const pattern of result.structuredSummary.patternsObserved.slice(0, 3)) {
          try {
            const saved = saveMemoryFromWorker(ownerKey, pattern);
            if (saved) {
              console.info(`[worker] meta-memory saved: ${saved.id} (source=worker)`);
            }
          } catch (e) {
            console.warn("[worker] pattern save failed:", e);
          }
        }
        console.info(`[worker] compaction window ${window + 1}: ${sessionKey} — ${result.factsExtracted} extracted`);
        if (rows.length < 40) break; // partial window = backlog drained
      } else if (result.skipped) {
        // Anti-burn skip: cursor advanced via 'skipped' row.
        console.info(`[worker] compaction window ${window + 1} skipped (anti-burn): ${sessionKey}`);
        if (rows.length < 40) break; // partial skipped window = end of current backlog
        // else: continue loop to process next window
      } else {
        // Transient or deterministic failure (not yet at anti-burn limit):
        // Throw so executeJob marks job as failed and schedules retry via attempts + backoff.
        const err = `[worker] compaction failed at window ${window + 1}: ${sessionKey} — ${result.error}`;
        console.warn(err);
        throw new Error(err);
      }
    }

    // If we exhausted MAX_WINDOWS and the last batch was full, more messages may remain.
    // Enqueue a continuation job; dedup index prevents duplicate enqueues.
    if (lastRowsLength === 40) {
      try {
        enqueueJob("session_compaction", { ownerKey, sessionKey });
        console.info(`[worker] session_compaction: re-enqueued for continued backlog drain: ${sessionKey}`);
      } catch (e) {
        if (!String(e).includes("UNIQUE constraint failed")) {
          console.warn("[worker] Failed to re-enqueue session_compaction:", e);
        }
      }
    }
  },
  consolidate_episodes: consolidateEpisodesHandler,
};

export function getHandlerCount(): number {
  return Object.keys(handlers).length;
}

function computeRunAfter(attempts: number): string {
  const delayMinutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
  const runAfter = new Date(Date.now() + delayMinutes * 60_000);
  return runAfter.toISOString();
}

async function executeJob(job: JobRow): Promise<void> {
  const handler = handlers[job.jobType];
  if (!handler) {
    db.update(jobs)
      .set({
        status: "failed",
        lastError: `Unknown job type: ${job.jobType}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, job.id))
      .run();

    logEvent({
      eventType: "job_failed",
      actor: "worker",
      payload: {
        jobId: job.id,
        jobType: job.jobType,
        error: `Unknown job type: ${job.jobType}`,
      },
    });
    return;
  }

  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  if (job.jobType === "connector_sync") {
    heartbeatInterval = setInterval(() => {
      sqlite.prepare("UPDATE jobs SET heartbeat_at = ? WHERE id = ?")
        .run(new Date().toISOString(), job.id);
    }, 30_000);
  }

  try {
    await handler(job.payload as Record<string, unknown>);

    db.update(jobs)
      .set({
        status: "completed",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, job.id))
      .run();

    logEvent({
      eventType: "job_completed",
      actor: "worker",
      payload: {
        jobId: job.id,
        jobType: job.jobType,
      },
    });
  } catch (error) {
    const attempts = (job.attempts ?? 0) + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (attempts >= MAX_ATTEMPTS) {
      db.update(jobs)
        .set({
          status: "failed",
          attempts,
          lastError: errorMessage,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, job.id))
        .run();

      logEvent({
        eventType: "job_failed",
        actor: "worker",
        payload: {
          jobId: job.id,
          jobType: job.jobType,
          attempts,
          error: errorMessage,
        },
      });
    } else {
      db.update(jobs)
        .set({
          status: "queued",
          attempts,
          lastError: errorMessage,
          runAfter: computeRunAfter(attempts),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, job.id))
        .run();
    }
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  }
}

/**
 * Atomic claim: mark job as running only if still queued.
 */
function claimJob(jobId: string): boolean {
  const now = new Date().toISOString();
  const result = sqlite
    .prepare(
      "UPDATE jobs SET status = 'running', updated_at = ?, heartbeat_at = ? WHERE id = ? AND status = 'queued'",
    )
    .run(now, now, jobId);
  return result.changes === 1;
}

export async function processJobs(): Promise<number> {
  // Recover stale connector_sync jobs that stopped sending heartbeats (crashed worker, OOM, etc.)
  sqlite.prepare(`
    UPDATE jobs SET status = 'failed', last_error = 'heartbeat timeout', updated_at = ?
    WHERE status = 'running'
      AND job_type = 'connector_sync'
      AND datetime(COALESCE(heartbeat_at, updated_at)) < datetime('now', '-10 minutes')
  `).run(new Date().toISOString());

  const now = new Date().toISOString();

  const dueJobs = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "queued"), lte(jobs.runAfter, now)))
    .all();

  let processed = 0;
  for (const job of dueJobs) {
    // Atomic claim to prevent double-processing
    if (!claimJob(job.id)) continue;
    await executeJob(job);
    processed++;
  }

  return processed;
}

export function enqueueJob(
  jobType: string,
  payload: Record<string, unknown>,
  runAfter?: Date,
): string | null {
  const id = randomUUID();

  const result = db.insert(jobs)
    .values({
      id,
      jobType,
      payload,
      status: "queued",
      runAfter: (runAfter ?? new Date()).toISOString(),
      attempts: 0,
    })
    .onConflictDoNothing() // dedup via unique index on (job_type, ownerKey) WHERE queued/running
    .run();

  return result.changes === 1 ? id : null;
}
