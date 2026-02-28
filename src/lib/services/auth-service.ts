import { hash, verify } from "@node-rs/argon2";
import { eq, or, isNull, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, sqlite } from "@/lib/db";
import { users, profiles, sessions } from "@/lib/db/schema";

export class ProfileAlreadyLinkedError extends Error {
  constructor() {
    super("Profile already linked to a different user");
  }
}

// -- Password hashing (Argon2id) --

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  return verify(storedHash, password);
}

// -- Types --

export type User = {
  id: string;
  email: string;
  emailVerified: number;
  displayName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Profile = {
  id: string;
  userId: string | null;
  username: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// -- User CRUD --

export async function createUser(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  db.insert(users)
    .values({
      id,
      email: email.toLowerCase().trim(),
      passwordHash,
      displayName: displayName ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    email: email.toLowerCase().trim(),
    emailVerified: 0,
    displayName: displayName ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function getUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const row = db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .get();
  if (!row) return null;
  return row as User & { passwordHash: string };
}

export function getUserById(userId: string): User | null {
  const row = db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) return null;
  return row as User;
}

// -- Profile CRUD --

export function createProfile(userId?: string): Profile {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(profiles)
    .values({
      id,
      userId: userId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    userId: userId ?? null,
    username: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Link a profile to a user. Succeeds if:
 * - profile is unlinked (userId IS NULL), OR
 * - profile is already linked to the same user.
 * Throws ProfileAlreadyLinkedError if linked to a different user.
 */
export function linkProfileToUser(profileId: string, userId: string): void {
  const result = db
    .update(profiles)
    .set({ userId, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(profiles.id, profileId),
        or(isNull(profiles.userId), eq(profiles.userId, userId)),
      ),
    )
    .run();
  if (result.changes === 0) {
    throw new ProfileAlreadyLinkedError();
  }
}

export function getProfileForUser(userId: string): Profile | null {
  const row = db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .get();
  if (!row) return null;
  return row as Profile;
}

export function getProfileById(profileId: string): Profile | null {
  const row = db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .get();
  if (!row) return null;
  return row as Profile;
}

export function getProfileFromSession(sessionId: string): { profile: Profile; user: User | null } | null {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!session) return null;

  const profileId = session.profileId;
  if (!profileId) return null;

  const profile = getProfileById(profileId);
  if (!profile) return null;

  const user = session.userId ? getUserById(session.userId) : null;

  return { profile, user };
}

/**
 * Create a new auth session for login. Does NOT reuse createSession from invite flow.
 */
export function createAuthSession(userId: string, profileId: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(sessions)
    .values({
      id,
      inviteCode: "__auth__",
      userId,
      profileId,
      status: "registered",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return id;
}

/**
 * Update profile username.
 */
export function setProfileUsername(profileId: string, username: string): void {
  db.update(profiles)
    .set({ username, updatedAt: new Date().toISOString() })
    .where(eq(profiles.id, profileId))
    .run();
}

/**
 * Check if an email is already registered.
 */
export function isEmailTaken(email: string): boolean {
  return getUserByEmail(email) !== null;
}
