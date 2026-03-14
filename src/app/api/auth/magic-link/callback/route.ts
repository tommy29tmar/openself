import { NextResponse } from "next/server";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { createSessionCookie } from "@/lib/auth/session";
import { createAuthSession } from "@/lib/services/auth-service";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/auth/magic-link/callback?token=...
 *
 * Validate magic link token, create session, redirect to builder.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
  }

  const profileId = consumeAuthToken(token, "magic_link");
  if (!profileId) {
    return NextResponse.redirect(new URL("/login?error=expired_link", url.origin));
  }

  // Resolve the user for this profile
  const profile = db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .get();

  if (!profile?.userId) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
  }

  // Mark email as verified (implicit: they accessed the link)
  db.update(users)
    .set({ emailVerified: 1, updatedAt: new Date().toISOString() })
    .where(eq(users.id, profile.userId))
    .run();

  // Create a new session
  const sessionId = createAuthSession(profile.userId, profileId);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? url.origin;
  const response = NextResponse.redirect(new URL("/builder", baseUrl));
  response.headers.set("Set-Cookie", createSessionCookie(sessionId));

  return response;
}
