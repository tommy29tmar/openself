/**
 * Idempotency guards for connector sync and import operations.
 *
 * - hasPendingJob: checks the jobs table for queued/running connector_sync jobs
 * - isSyncRateLimited: prevents re-sync within 60s of lastSync
 * - acquireImportLock / releaseImportLock / hasPendingImport: in-memory mutex for LinkedIn import
 *
 * The in-memory Set approach is safe because SQLite single-writer implies single-process.
 */

import { sqlite } from "@/lib/db";

// ---------------------------------------------------------------------------
// Job-level idempotency (DB-backed)
// ---------------------------------------------------------------------------

const STALE_JOB_TIMEOUT_MINUTES = 10;

const PENDING_JOB_SQL = `
  SELECT 1 FROM jobs
  WHERE job_type = 'connector_sync'
    AND json_extract(payload, '$.ownerKey') = ?
    AND (
      status = 'queued'
      OR (status = 'running' AND datetime(COALESCE(heartbeat_at, updated_at)) > datetime('now', '-${STALE_JOB_TIMEOUT_MINUTES} minutes'))
    )
  LIMIT 1
`;

/**
 * Returns true if a connector_sync job is already queued or running (and not stale) for this ownerKey.
 */
export function hasPendingJob(ownerKey: string): boolean {
  const row = sqlite.prepare(PENDING_JOB_SQL).get(ownerKey);
  return row !== undefined;
}

/**
 * Marks stale connector_sync jobs as failed.
 * A job is stale if it has been running for over 10 minutes without a heartbeat update.
 */
export function recoverStaleConnectorJobs(ownerKey: string): void {
  sqlite.prepare(`
    UPDATE jobs SET status = 'failed', last_error = 'heartbeat timeout', updated_at = ?
    WHERE job_type = 'connector_sync'
      AND json_extract(payload, '$.ownerKey') = ?
      AND status = 'running'
      AND datetime(COALESCE(heartbeat_at, updated_at)) < datetime('now', '-${STALE_JOB_TIMEOUT_MINUTES} minutes')
  `).run(new Date().toISOString(), ownerKey);
}

// ---------------------------------------------------------------------------
// Rate limiting (time-based)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 60_000; // 60 seconds

/**
 * Returns true if lastSync was less than 60 seconds ago.
 */
export function isSyncRateLimited(lastSync: string | null): boolean {
  if (!lastSync) return false;
  const ts = new Date(lastSync).getTime();
  if (Number.isNaN(ts)) return false;
  const elapsed = Date.now() - ts;
  return elapsed < RATE_LIMIT_MS;
}

// ---------------------------------------------------------------------------
// Import lock (in-memory)
// ---------------------------------------------------------------------------

const activeImports = new Set<string>();

/**
 * Tries to acquire an import lock for the given ownerKey.
 * Returns true if the lock was acquired, false if already held.
 */
export function acquireImportLock(ownerKey: string): boolean {
  if (activeImports.has(ownerKey)) return false;
  activeImports.add(ownerKey);
  return true;
}

/**
 * Releases the import lock for the given ownerKey.
 */
export function releaseImportLock(ownerKey: string): void {
  activeImports.delete(ownerKey);
}

/**
 * Returns true if an import is currently in progress for this ownerKey.
 */
export function hasPendingImport(ownerKey: string): boolean {
  return activeImports.has(ownerKey);
}
