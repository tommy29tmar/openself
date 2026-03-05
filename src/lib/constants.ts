// src/lib/constants.ts
// Shared constants — zero dependencies to avoid circular imports.

export function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Per-profile message quota for authenticated users. */
export const AUTH_MESSAGE_LIMIT = parsePositiveIntEnv(process.env.AUTH_MESSAGE_LIMIT, 200);
