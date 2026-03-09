/**
 * Lightweight threshold constants for agent policies.
 * No imports — safe to use from journey.ts and situations.ts without circular deps.
 */

/** Publishable fact count below which a profile is too sparse for quick-update mode. */
export const SPARSE_PROFILE_FACT_THRESHOLD = 10;

/** Minimum active fact count for deep heartbeat to run (LLM-dependent work). */
export const DEEP_HEARTBEAT_MIN_FACTS = 25;
