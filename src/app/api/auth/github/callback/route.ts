import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GitHub } from "arctic";
import { handleOAuthCallback } from "@/lib/services/oauth-service";
import { createSessionCookie } from "@/lib/auth/session";

function getGitHubClient(): GitHub | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  return new GitHub(clientId, clientSecret, null);
}

/**
 * GET /api/auth/github/callback
 *
 * Handles the OAuth callback from GitHub.
 */
export async function GET(req: NextRequest) {
  const github = getGitHubClient();
  if (!github) {
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
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    // Fetch user info from GitHub
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
    }

    const user = await userRes.json();

    // Fetch email (may be private)
    let email = user.email;
    if (!email) {
      const emailRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (emailRes.ok) {
        const emails = await emailRes.json();
        const primary = emails.find((e: any) => e.primary && e.verified);
        email = primary?.email ?? emails[0]?.email;
      }
    }

    if (!email) {
      return NextResponse.redirect(new URL("/login?error=no_email", req.url));
    }

    const preLoginSession = req.cookies.get("os_session")?.value;
    const { sessionId, username } = await handleOAuthCallback({
      provider: "github",
      providerUserId: String(user.id),
      email,
      displayName: user.name ?? user.login,
    }, preLoginSession);

    const redirectUrl = username ? `/${username}` : "/builder";
    const response = NextResponse.redirect(new URL(redirectUrl, req.url));
    response.headers.set("Set-Cookie", createSessionCookie(sessionId));

    // Clear OAuth cookies
    response.cookies.delete("oauth_state");

    return response;
  } catch (error) {
    console.error("[github-oauth] Callback error:", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}
