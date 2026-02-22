export type PreviewStatus =
  | "idle"
  | "optimistic_ready"
  | "synthesizing"
  | "synthesis_ready"
  | "synthesis_failed";

export type PreviewState = {
  status: PreviewStatus;
  config: import("./schema").PageConfig | null;
  turnCount: number;
  lastUpdated: string | null;
  error?: string;
};

export const INITIAL_PREVIEW_STATE: PreviewState = {
  status: "idle",
  config: null,
  turnCount: 0,
  lastUpdated: null,
};

/**
 * Synthesis triggers every SYNTHESIS_INTERVAL turns.
 * Between synthesis rounds, the preview uses optimistic config.
 */
export const SYNTHESIS_INTERVAL = 2;
