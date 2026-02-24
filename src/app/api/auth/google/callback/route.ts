import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Google } from "arctic";
import { handleOAuthCallback } from "@/lib/services/oauth-service";
import { createSessionCookie } from "@/lib/auth/session";

function getGoogleClient(): Google | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new Google(clientId, clientSecret, `${baseUrl}/api/auth/google/callback`);
}

/**
 * GET /api/auth/google/callback
 *
 * Handles the OAuth callback from Google.
 */
export async function GET(req: NextRequest) {
  const google = getGoogleClient();
  if (!google) {
    return NextResponse.redirect(new URL("/login?error=oauth_not_configured", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("oauth_state")?.value;
  const codeVerifier = req.cookies.get("oauth_code_verifier")?.value;

  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
  }

  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    // Fetch user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
    }

    const userInfo = await userInfoRes.json();

    const { sessionId, username } = await handleOAuthCallback({
      provider: "google",
      providerUserId: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name,
    });

    const redirectUrl = username ? `/${username}` : "/builder";
    const response = NextResponse.redirect(new URL(redirectUrl, req.url));
    response.headers.set("Set-Cookie", createSessionCookie(sessionId));

    // Clear OAuth cookies
    response.cookies.delete("oauth_state");
    response.cookies.delete("oauth_code_verifier");

    return response;
  } catch (error) {
    console.error("[google-oauth] Callback error:", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}
