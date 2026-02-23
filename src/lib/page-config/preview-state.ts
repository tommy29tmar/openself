export type PreviewStatus = "idle" | "optimistic_ready";

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
