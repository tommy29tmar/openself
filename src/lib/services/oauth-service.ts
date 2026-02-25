import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, sqlite } from "@/lib/db";
import { authIdentities, users, profiles } from "@/lib/db/schema";
import {
  createAuthSession,
  createProfile,
  hashPassword,
} from "@/lib/services/auth-service";

export type OAuthUserInfo = {
  provider: string;
  providerUserId: string;
  email: string;
  displayName?: string;
};

/**
 * Handle OAuth callback: find-or-create user, link identity, create session.
 * Returns sessionId for cookie.
 *
 * If an anonymous session exists (from onboarding), links the profile to the new user.
 */
export async function handleOAuthCallback(
  info: OAuthUserInfo,
  existingSessionId?: string,
): Promise<{ sessionId: string; username: string | null; isNew: boolean }> {
  // 1. Check if this OAuth identity already exists
  const existing = db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, info.provider),
        eq(authIdentities.providerUserId, info.providerUserId),
      ),
    )
    .get();

  if (existing) {
    // Returning user: find their profile and create a session
    const user = db
      .select()
      .from(users)
      .where(eq(users.id, existing.userId))
      .get();

    if (!user) {
      throw new Error("User not found for OAuth identity");
    }

    const profile = db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .get();

    const sessionId = createAuthSession(user.id, profile?.id ?? user.id);
    return { sessionId, username: profile?.username ?? null, isNew: false };
  }

  // 2. Check if there's already a user with this email
  let userId: string;
  let isNew = true;

  const existingUser = db
    .select()
    .from(users)
    .where(eq(users.email, info.email.toLowerCase().trim()))
    .get();

  if (existingUser) {
    // Link OAuth identity to existing user
    userId = existingUser.id;
    isNew = false;
  } else {
    // Create new user (with random password — login via OAuth only)
    userId = randomUUID();
    const randomPassword = randomUUID();
    const passwordHash = await hashPassword(randomPassword);
    const now = new Date().toISOString();

    db.insert(users)
      .values({
        id: userId,
        email: info.email.toLowerCase().trim(),
        passwordHash,
        displayName: info.displayName ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // 3. Create the OAuth identity link
  db.insert(authIdentities)
    .values({
      id: randomUUID(),
      userId,
      provider: info.provider,
      providerUserId: info.providerUserId,
      providerEmail: info.email,
    })
    .run();

  // 4. Get or create profile
  let profile = db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .get();

  if (!profile) {
    const created = createProfile(userId);
    profile = created as any;
  }

  // 5. Backfill existing session's profileId (if user had an invite session)
  if (existingSessionId) {
    sqlite
      .prepare(
        "UPDATE sessions SET profile_id = ? WHERE id = ? AND profile_id IS NULL",
      )
      .run(profile!.id, existingSessionId);
  }

  // 6. Create session
  const sessionId = createAuthSession(userId, profile!.id);

  return { sessionId, username: profile?.username ?? null, isNew };
}
