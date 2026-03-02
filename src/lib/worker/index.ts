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

const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = [1, 5, 15];

type JobRow = typeof jobs.$inferSelect;

type JobHandler = (payload: Record<string, unknown>) => void | Promise<void>;

const handlers: Record<string, JobHandler> = {
  page_synthesis: (payload) => {
    const username = payload.username as string;
    const language = (payload.language as string) ?? "en";
    const sessionId = (payload.sessionId as string) ?? "__default__";
    const facts = getActiveFacts(sessionId);
    const config = composeOptimisticPage(facts, username, language);
    upsertDraft(username, config, sessionId);
  },

  memory_summary: async (payload) => {
    const ownerKey = payload.ownerKey as string;
    const messageKeys = (payload.messageKeys as string[]) ?? [ownerKey];
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
    const username = payload.username as string;
    const language = (payload.language as string) ?? "en";
    const sessionId = (payload.sessionId as string) ?? "__default__";
    const facts = getActiveFacts(sessionId);
    const config = composeOptimisticPage(facts, username, language);
    upsertDraft(username, config, sessionId);
  },

  taxonomy_review: () => {
    // Placeholder — taxonomy review not yet implemented
  },
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
  }
}

/**
 * Atomic claim: mark job as running only if still queued.
 */
function claimJob(jobId: string): boolean {
  const result = sqlite
    .prepare(
      "UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'",
    )
    .run(new Date().toISOString(), jobId);
  return result.changes === 1;
}

export async function processJobs(): Promise<number> {
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
): string {
  const id = randomUUID();

  db.insert(jobs)
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

  return id;
}
