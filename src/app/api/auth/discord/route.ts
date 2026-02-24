import { NextResponse } from "next/server";
import { Discord, generateState, generateCodeVerifier } from "arctic";

function getDiscordClient(): Discord | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new Discord(clientId, clientSecret, `${baseUrl}/api/auth/discord/callback`);
}

/**
 * GET /api/auth/discord
 *
 * Redirects to Discord OAuth consent screen.
 */
export async function GET() {
  const discord = getDiscordClient();
  if (!discord) {
    return NextResponse.json(
      { error: "Discord OAuth not configured" },
      { status: 404 },
    );
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = discord.createAuthorizationURL(state, codeVerifier, ["identify", "email"]);

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
