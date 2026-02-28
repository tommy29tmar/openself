/**
 * Shared error class for publish-related operations.
 * Lives in its own module to avoid circular deps between page-service and publish-pipeline.
 */
export class PublishError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

/**
 * Extract a human-readable error message from an unknown error value.
 * Handles Error objects, plain strings, and raw JSON strings (e.g. `{"error":"..."}`)
 * that some API clients return verbatim.
 */
export function extractErrorMessage(error: unknown): string {
  const fallback = "Unable to generate a response right now.";
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch { /* not JSON */ }
  const jsonMatch = raw.match(/\{[^}]*"error"\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) return jsonMatch[1];
  return raw;
}
