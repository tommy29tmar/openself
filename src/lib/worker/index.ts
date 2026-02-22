import { eq, and, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { logEvent } from "@/lib/services/event-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { upsertPage } from "@/lib/services/page-service";
import { getAllFacts } from "@/lib/services/kb-service";

const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = [1, 5, 15];

type JobRow = typeof jobs.$inferSelect;

type JobHandler = (payload: Record<string, unknown>) => void;

const handlers: Record<string, JobHandler> = {
  page_synthesis: (payload) => {
    const username = payload.username as string;
    const language = (payload.language as string) ?? "en";
    const facts = getAllFacts();
    const config = composeOptimisticPage(facts, username, language);
    upsertPage(username, config);
  },
};

function computeRunAfter(attempts: number): string {
  const delayMinutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
  const runAfter = new Date(Date.now() + delayMinutes * 60_000);
  return runAfter.toISOString();
}

function executeJob(job: JobRow): void {
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
    handler(job.payload as Record<string, unknown>);

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

export function processJobs(): number {
  const now = new Date().toISOString();

  const dueJobs = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "queued"), lte(jobs.runAfter, now)))
    .all();

  for (const job of dueJobs) {
    // Mark as in-progress to prevent double-processing
    db.update(jobs)
      .set({
        status: "running",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, job.id))
      .run();

    executeJob(job);
  }

  return dueJobs.length;
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
    .run();

  return id;
}
