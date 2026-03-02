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

const PENDING_JOB_SQL = `
  SELECT 1 FROM jobs
  WHERE job_type = 'connector_sync'
    AND json_extract(payload, '$.ownerKey') = ?
    AND status IN ('queued', 'running')
  LIMIT 1
`;

/**
 * Returns true if a connector_sync job is already queued or running for this ownerKey.
 */
export function hasPendingJob(ownerKey: string): boolean {
  const row = sqlite.prepare(PENDING_JOB_SQL).get(ownerKey);
  return row !== undefined;
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
