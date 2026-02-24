import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, profiles } from "@/lib/db/schema";

/**
 * Check if the given session owns the page for `username`.
 * session → profile → profile.username === params.username
 */
export function checkPageOwnership(sessionId: string, username: string): boolean {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  if (!session) return false;

  // Direct check: session has the username registered
  if (session.username === username) return true;

  // Profile-based check: session's profile owns the username
  const profileId = session.profileId;
  if (!profileId) return false;

  const profile = db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .get();

  return profile?.username === username;
}
