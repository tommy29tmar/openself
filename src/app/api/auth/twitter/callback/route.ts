import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Twitter } from "arctic";
import { handleOAuthCallback } from "@/lib/services/oauth-service";
import { createSessionCookie } from "@/lib/auth/session";

function getTwitterClient(): Twitter | null {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new Twitter(clientId, clientSecret, `${baseUrl}/api/auth/twitter/callback`);
}

/**
 * GET /api/auth/twitter/callback
 *
 * Handles the OAuth callback from Twitter/X.
 *
 * Note: Twitter does not always provide email. If no email is available,
 * we use a placeholder email derived from the Twitter user ID.
 */
export async function GET(req: NextRequest) {
  const twitter = getTwitterClient();
  if (!twitter) {
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
    const tokens = await twitter.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    // Fetch user info from Twitter v2 API
    const userRes = await fetch("https://api.twitter.com/2/users/me?user.fields=name,username", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
    }

    const { data: user } = await userRes.json();

    // Twitter doesn't reliably provide email — use a provider-scoped placeholder
    // Users can update their email later via account settings
    const email = `${user.id}@twitter.oauth.openself.dev`;

    const preLoginSession = req.cookies.get("os_session")?.value;
    const { sessionId, username } = await handleOAuthCallback({
      provider: "twitter",
      providerUserId: String(user.id),
      email,
      displayName: user.name ?? user.username,
    }, preLoginSession);

    const redirectUrl = username ? `/${username}` : "/builder";
    const response = NextResponse.redirect(new URL(redirectUrl, req.url));
    response.headers.set("Set-Cookie", createSessionCookie(sessionId));

    // Clear OAuth cookies
    response.cookies.delete("oauth_state");
    response.cookies.delete("oauth_code_verifier");

    return response;
  } catch (error) {
    console.error("[twitter-oauth] Callback error:", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}
