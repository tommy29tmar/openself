import {
  DEFAULT_SESSION_ID,
  isMultiUserEnabled,
  getSession,
} from "@/lib/services/session-service";
import { sqlite } from "@/lib/db";

const COOKIE_NAME = "os_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export { COOKIE_NAME, COOKIE_MAX_AGE };

/**
 * OwnerScope: per-request identity envelope for all cognitive + knowledge operations.
 *
 * - cognitiveOwnerKey: indexes NEW tables (memory, soul, summaries, heartbeat, trust_ledger)
 * - knowledgeReadKeys: reads from EXISTING tables (facts, page, messages, agent_config)
 * - knowledgePrimaryKey: writes to EXISTING tables (facts, page) — stable anchor session
 * - currentSessionId: current request's session (message writes, quota tracking)
 */
export type OwnerScope = {
  cognitiveOwnerKey: string;
  knowledgeReadKeys: string[];
  knowledgePrimaryKey: string;
  currentSessionId: string;
};

/**
 * Extract session ID from request.
 * - Multi-user: reads `os_session` cookie.
 * - Single-user: returns "__default__".
 */
export function getSessionIdFromRequest(req: Request): string {
  if (!isMultiUserEnabled()) {
    return DEFAULT_SESSION_ID;
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  return match?.[1] ?? "";
}

/**
 * Build a Set-Cookie header value for the session cookie.
 */
export function createSessionCookie(sessionId: string): string {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

/**
 * Auth context derived from session. Used by API routes to get profileId and userId.
 */
export type AuthContext = {
  sessionId: string;
  profileId: string;
  userId: string | null;
  username: string | null;
};

/**
 * Get auth context from request. Returns profileId (falling back to sessionId for pre-migration data).
 */
export function getAuthContext(req: Request): AuthContext | null {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return null;

  if (!isMultiUserEnabled()) {
    return {
      sessionId: DEFAULT_SESSION_ID,
      profileId: DEFAULT_SESSION_ID,
      userId: null,
      username: null,
    };
  }

  const session = getSession(sessionId);
  if (!session) return null;

  // Resolve username: session.username (legacy) ?? profiles.username (auth v2)
  let username: string | null = session.username ?? null;
  if (!username && session.profileId) {
    const profileRow = sqlite
      .prepare("SELECT username FROM profiles WHERE id = ?")
      .get(session.profileId) as { username: string | null } | undefined;
    username = profileRow?.username ?? null;
  }

  return {
    sessionId,
    profileId: session.profileId ?? sessionId,
    userId: session.userId ?? null,
    username,
  };
}

/**
 * Get the oldest session linked to a profile (the anchor).
 * The anchor is the stable key for writes to existing tables (facts, page, agent_config).
 * Fallback to currentSessionId if no sessions have profileId.
 */
export function anchorSessionId(profileId: string, currentSessionId: string): string {
  const row = sqlite
    .prepare(
      "SELECT id FROM sessions WHERE profile_id = ? ORDER BY created_at ASC LIMIT 1",
    )
    .get(profileId) as { id: string } | undefined;
  return row?.id ?? currentSessionId;
}

/**
 * Get all session IDs linked to a profile.
 */
export function allSessionIdsForProfile(profileId: string): string[] {
  const rows = sqlite
    .prepare("SELECT id FROM sessions WHERE profile_id = ?")
    .all(profileId) as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Resolve the OwnerScope for a request.
 *
 * - Authenticated: cognitiveOwnerKey=profileId, knowledgeReadKeys=all sessions for profile ∪ currentSessionId
 * - Anonymous (multi-user): all keys = sessionId
 * - Single-user: all keys = "__default__"
 */
export function resolveOwnerScope(req: Request): OwnerScope | null {
  if (!isMultiUserEnabled()) {
    return {
      cognitiveOwnerKey: DEFAULT_SESSION_ID,
      knowledgeReadKeys: [DEFAULT_SESSION_ID],
      knowledgePrimaryKey: DEFAULT_SESSION_ID,
      currentSessionId: DEFAULT_SESSION_ID,
    };
  }

  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return null;

  const session = getSession(sessionId);
  if (!session) return null;

  const profileId = session.profileId;

  if (profileId) {
    // Authenticated: profile-scoped
    const sessionIds = allSessionIdsForProfile(profileId);
    const readKeys = new Set(sessionIds);
    readKeys.add(sessionId); // safety net: always include current
    const anchor = anchorSessionId(profileId, sessionId);

    return {
      cognitiveOwnerKey: profileId,
      knowledgeReadKeys: Array.from(readKeys),
      knowledgePrimaryKey: anchor,
      currentSessionId: sessionId,
    };
  }

  // Anonymous: session-scoped
  return {
    cognitiveOwnerKey: sessionId,
    knowledgeReadKeys: [sessionId],
    knowledgePrimaryKey: sessionId,
    currentSessionId: sessionId,
  };
}

/**
 * Resolve OwnerScope from ownerKey alone (for worker context where no HTTP request exists).
 * ownerKey is profileId for authenticated users, sessionId for anonymous.
 */
export function resolveOwnerScopeForWorker(ownerKey: string): OwnerScope {
  const sessionIds = allSessionIdsForProfile(ownerKey);
  if (sessionIds.length > 0) {
    const anchor = anchorSessionId(ownerKey, sessionIds[0]);
    return {
      cognitiveOwnerKey: ownerKey,
      knowledgeReadKeys: sessionIds,
      knowledgePrimaryKey: anchor,
      currentSessionId: sessionIds[0],
    };
  }
  // Anonymous: ownerKey is the sessionId itself
  return {
    cognitiveOwnerKey: ownerKey,
    knowledgeReadKeys: [ownerKey],
    knowledgePrimaryKey: ownerKey,
    currentSessionId: ownerKey,
  };
}
