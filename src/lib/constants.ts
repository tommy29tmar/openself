// src/lib/constants.ts
// Shared constants — zero dependencies to avoid circular imports.

/** Per-profile message quota for authenticated users. */
export const AUTH_MESSAGE_LIMIT = parseInt(process.env.AUTH_MESSAGE_LIMIT ?? "200", 10);
