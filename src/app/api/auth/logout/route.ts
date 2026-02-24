import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/session";

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return response;
}
