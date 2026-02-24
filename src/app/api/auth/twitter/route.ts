import { NextResponse } from "next/server";
import { Twitter, generateState, generateCodeVerifier } from "arctic";

function getTwitterClient(): Twitter | null {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new Twitter(clientId, clientSecret, `${baseUrl}/api/auth/twitter/callback`);
}

/**
 * GET /api/auth/twitter
 *
 * Redirects to Twitter/X OAuth consent screen.
 */
export async function GET() {
  const twitter = getTwitterClient();
  if (!twitter) {
    return NextResponse.json(
      { error: "Twitter OAuth not configured" },
      { status: 404 },
    );
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = twitter.createAuthorizationURL(state, codeVerifier, ["tweet.read", "users.read"]);

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
