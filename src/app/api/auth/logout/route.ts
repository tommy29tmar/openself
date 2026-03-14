import { NextResponse } from "next/server";
import { COOKIE_NAME, getSessionIdFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/auth/logout
 *
 * Invalidates the server-side session and clears the session cookie.
 */
export async function POST(req: Request) {
  // Delete the session from DB before clearing the cookie
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) {
    try {
      db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    } catch (err) {
      console.error("[logout] Failed to delete session:", err);
      // Continue with cookie clearing even if DB delete fails
    }
  }

  const response = NextResponse.json({ success: true });
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return response;
}
