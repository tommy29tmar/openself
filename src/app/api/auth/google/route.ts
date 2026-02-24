import { NextResponse } from "next/server";
import { Google, generateState, generateCodeVerifier } from "arctic";

function getGoogleClient(): Google | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new Google(clientId, clientSecret, `${baseUrl}/api/auth/google/callback`);
}

/**
 * GET /api/auth/google
 *
 * Redirects to Google OAuth consent screen.
 */
export async function GET() {
  const google = getGoogleClient();
  if (!google) {
    return NextResponse.json(
      { error: "Google OAuth not configured" },
      { status: 404 },
    );
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("oauth_code_verifier", codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
