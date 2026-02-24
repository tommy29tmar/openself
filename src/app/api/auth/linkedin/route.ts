import { NextResponse } from "next/server";
import { LinkedIn, generateState } from "arctic";

function getLinkedInClient(): LinkedIn | null {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new LinkedIn(clientId, clientSecret, `${baseUrl}/api/auth/linkedin/callback`);
}

/**
 * GET /api/auth/linkedin
 *
 * Redirects to LinkedIn OAuth consent screen.
 */
export async function GET() {
  const linkedin = getLinkedInClient();
  if (!linkedin) {
    return NextResponse.json(
      { error: "LinkedIn OAuth not configured" },
      { status: 404 },
    );
  }

  const state = generateState();
  const url = linkedin.createAuthorizationURL(state, ["openid", "profile", "email"]);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
