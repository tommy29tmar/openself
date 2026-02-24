import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LinkedIn } from "arctic";
import { handleOAuthCallback } from "@/lib/services/oauth-service";
import { createSessionCookie } from "@/lib/auth/session";

function getLinkedInClient(): LinkedIn | null {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new LinkedIn(clientId, clientSecret, `${baseUrl}/api/auth/linkedin/callback`);
}

/**
 * GET /api/auth/linkedin/callback
 *
 * Handles the OAuth callback from LinkedIn.
 */
export async function GET(req: NextRequest) {
  const linkedin = getLinkedInClient();
  if (!linkedin) {
    return NextResponse.redirect(new URL("/login?error=oauth_not_configured", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
  }

  try {
    const tokens = await linkedin.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    // Fetch user info from LinkedIn (OpenID Connect userinfo endpoint)
    const userInfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
    }

    const userInfo = await userInfoRes.json();

    if (!userInfo.email) {
      return NextResponse.redirect(new URL("/login?error=no_email", req.url));
    }

    const { sessionId, username } = await handleOAuthCallback({
      provider: "linkedin",
      providerUserId: userInfo.sub,
      email: userInfo.email,
      displayName: userInfo.name,
    });

    const redirectUrl = username ? `/${username}` : "/builder";
    const response = NextResponse.redirect(new URL(redirectUrl, req.url));
    response.headers.set("Set-Cookie", createSessionCookie(sessionId));

    // Clear OAuth cookies
    response.cookies.delete("oauth_state");

    return response;
  } catch (error) {
    console.error("[linkedin-oauth] Callback error:", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}
