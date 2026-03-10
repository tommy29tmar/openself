import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Discord } from "arctic";
import { handleOAuthCallback } from "@/lib/services/oauth-service";
import { createSessionCookie } from "@/lib/auth/session";

function getDiscordClient(): Discord | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new Discord(clientId, clientSecret, `${baseUrl}/api/auth/discord/callback`);
}

/**
 * GET /api/auth/discord/callback
 *
 * Handles the OAuth callback from Discord.
 */
export async function GET(req: NextRequest) {
  const discord = getDiscordClient();
  if (!discord) {
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
    const tokens = await discord.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    // Fetch user info from Discord
    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
    }

    const user = await userRes.json();

    if (!user.email) {
      return NextResponse.redirect(new URL("/login?error=no_email", req.url));
    }

    const preLoginSession = req.cookies.get("os_session")?.value;
    const { sessionId, username } = await handleOAuthCallback({
      provider: "discord",
      providerUserId: String(user.id),
      email: user.email,
      displayName: user.global_name ?? user.username,
    }, preLoginSession);

    const redirectUrl = username ? `/${username}` : "/builder";
    const response = NextResponse.redirect(new URL(redirectUrl, req.url));
    response.headers.set("Set-Cookie", createSessionCookie(sessionId));

    // Clear OAuth cookies
    response.cookies.delete("oauth_state");
    response.cookies.delete("oauth_code_verifier");

    return response;
  } catch (error) {
    console.error("[discord-oauth] Callback error:", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}
