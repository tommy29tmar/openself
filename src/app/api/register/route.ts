import { NextResponse } from "next/server";
import {
  getSessionIdFromRequest,
  getAuthContext,
  createSessionCookie,
  resolveOwnerScope,
} from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  getSession,
  isUsernameTaken,
  registerUsername,
} from "@/lib/services/session-service";
import { prepareAndPublish, PublishError } from "@/lib/services/publish-pipeline";
import { logEvent } from "@/lib/services/event-service";
import { AUTH_V2 } from "@/lib/flags";
import {
  getUserByEmail,
  verifyPassword,
  hashPassword,
  linkProfileToUser,
  getProfileById,
  createAuthSession,
  ProfileAlreadyLinkedError,
} from "@/lib/services/auth-service";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { db, sqlite } from "@/lib/db";
import { users, profiles } from "@/lib/db/schema";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;
const RESERVED = new Set(["draft", "api", "builder", "admin", "invite", "_next", "login", "signup"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  // Rate limit: 3 attempts / 60s per IP for registration
  const rateResult = checkRateLimit(req, { maxRequests: 3, windowMs: 60_000, skipPace: true });
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rateResult.retryAfter ?? 60) } },
    );
  }

  const sessionId = getSessionIdFromRequest(req);
  const scope = isMultiUserEnabled() ? resolveOwnerScope(req) : null;

  if (isMultiUserEnabled()) {
    if (!sessionId || !getSession(sessionId)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
  }

  try {
    const body = await req.json();
    const username = body?.username;

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { success: false, error: "username is required", code: "USERNAME_INVALID" },
        { status: 400 },
      );
    }

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { success: false, error: "Invalid username. Use lowercase letters, numbers, and hyphens (1-39 chars).", code: "USERNAME_INVALID" },
        { status: 400 },
      );
    }

    if (RESERVED.has(username)) {
      return NextResponse.json(
        { success: false, error: `"${username}" is reserved`, code: "USERNAME_RESERVED" },
        { status: 400 },
      );
    }

    if (isUsernameTaken(username)) {
      return NextResponse.json(
        { success: false, error: "Username already taken", code: "USERNAME_TAKEN" },
        { status: 409 },
      );
    }

    const authCtx = getAuthContext(req);
    const profileId = authCtx?.profileId ?? sessionId;
    const publishPrimaryKey = scope?.knowledgePrimaryKey ?? sessionId;
    const publishOwnerKey = scope?.cognitiveOwnerKey ?? profileId;
    const publishReadKeys = scope?.knowledgeReadKeys;

    if (AUTH_V2) {
      // -- AUTH_V2: require email + password --
      const email = body?.email;
      const password = body?.password;

      if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
        return NextResponse.json(
          { success: false, error: "Valid email is required", code: "EMAIL_INVALID" },
          { status: 400 },
        );
      }

      if (!password || typeof password !== "string" || password.length < 8) {
        return NextResponse.json(
          { success: false, error: "Password must be at least 8 characters", code: "PASSWORD_TOO_SHORT" },
          { status: 400 },
        );
      }

      // Step 2: Retry detection (ownership-first, no password oracle)
      let user: { id: string; email: string };
      const existingUser = getUserByEmail(email);

      if (existingUser) {
        // Check ownership first: only allow retry if this session's profile belongs to same user
        const profile = getProfileById(profileId);
        if (profile?.userId === existingUser.id) {
          // Same owner confirmed — now check password
          const passwordOk = await verifyPassword(existingUser.passwordHash, password);
          if (!passwordOk) {
            return NextResponse.json(
              { success: false, error: "Incorrect password for retry", code: "PASSWORD_MISMATCH" },
              { status: 400 },
            );
          }
          // Retry: reuse existing user
          user = existingUser;
          // Ensure existing user is verified (may have registered via /api/auth/signup without verifying)
          if (existingUser.emailVerified !== 1) {
            sqlite.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(existingUser.id);
          }
        } else {
          // Different owner or unlinked profile — opaque rejection (no password oracle)
          return NextResponse.json(
            { success: false, error: "Email already registered", code: "EMAIL_TAKEN" },
            { status: 409 },
          );
        }
      } else {
        // Step 3: Create user + profile atomically
        const passwordHash = await hashPassword(password);
        const now = new Date().toISOString();
        const userId = crypto.randomUUID();

        try {
          user = sqlite.transaction(() => {
            db.insert(users)
              .values({
                id: userId,
                email: email.toLowerCase().trim(),
                passwordHash,
                emailVerified: 1,
                createdAt: now,
                updatedAt: now,
              })
              .run();

            // Ensure profile row exists
            if (!getProfileById(profileId)) {
              db.insert(profiles)
                .values({
                  id: profileId,
                  userId,
                  createdAt: now,
                  updatedAt: now,
                })
                .run();
            }

            linkProfileToUser(profileId, userId);

            return {
              id: userId,
              email: email.toLowerCase().trim(),
            };
          })();
        } catch (err: unknown) {
          // SQLITE_CONSTRAINT on email unique → race condition, treat as EMAIL_TAKEN
          if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
            return NextResponse.json(
              { success: false, error: "Email already registered", code: "EMAIL_TAKEN" },
              { status: 409 },
            );
          }
          if (err instanceof ProfileAlreadyLinkedError) {
            return NextResponse.json(
              { success: false, error: "Email already registered", code: "EMAIL_TAKEN" },
              { status: 409 },
            );
          }
          throw err;
        }
      }

      // Step 4: Publish (username claim happens inside pipeline via claimProfileId)
      const result = await prepareAndPublish(username, publishPrimaryKey, {
        mode: "register",
        claimProfileId: profileId,
        ownerKey: publishOwnerKey,
        readKeys: publishReadKeys,
      });

      // Step 5: Register username on session only AFTER publish succeeds
      registerUsername(sessionId, username);

      // Backfill old session's profileId so it appears in allSessionIdsForProfile()
      sqlite
        .prepare(
          "UPDATE sessions SET profile_id = ? WHERE id = ? AND profile_id IS NULL",
        )
        .run(profileId, sessionId);

      // Step 6: Session rotation + WAL checkpoint
      const newSessionId = createAuthSession(user.id, profileId);

      sqlite.pragma("wal_checkpoint(PASSIVE)");

      logEvent({
        eventType: "user_registered",
        actor: "user",
        payload: { username, sessionId, email: email.toLowerCase() },
      });

      const response = NextResponse.json({
        success: true,
        username,
        url: result.url,
      });

      response.headers.set("Set-Cookie", createSessionCookie(newSessionId));

      return response;
    } else {
      // -- Legacy mode: username only --
      console.warn("[register] AUTH_V2 disabled — no user/profile records");

      // Publish first — registerUsername only on success
      const result = await prepareAndPublish(username, publishPrimaryKey, {
        mode: "register",
        ownerKey: publishOwnerKey,
        readKeys: publishReadKeys,
      });

      registerUsername(sessionId, username);

      // Flush WAL to disk — registration writes must survive process kill.
      sqlite.pragma("wal_checkpoint(PASSIVE)");

      logEvent({
        eventType: "user_registered",
        actor: "user",
        payload: { username, sessionId },
      });

      return NextResponse.json({
        success: true,
        username,
        url: result.url,
      });
    }
  } catch (error) {
    if (error instanceof PublishError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message, code: "INTERNAL" },
      { status: 400 },
    );
  }
}
