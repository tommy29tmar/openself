/** Feature flags for gradual rollout. Controlled via env vars. */

/** Enable email+password signup, login, logout. Opt-OUT with AUTH_V2=false. */
export const AUTH_V2 = process.env.AUTH_V2 !== "false";

/** When true: queries use only profile_id (no fallback to session_id). Enable after verifying all data has profile_id. */
export const PROFILE_ID_CANONICAL = process.env.PROFILE_ID_CANONICAL === "true";
