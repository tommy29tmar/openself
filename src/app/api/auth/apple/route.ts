import { NextResponse } from "next/server";
import { Apple, generateState } from "arctic";

function getAppleClient(): Apple | null {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!clientId || !teamId || !keyId || !privateKey) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  // Apple private key is stored as base64-encoded PKCS#8
  const keyBuffer = new Uint8Array(Buffer.from(privateKey, "base64"));
  return new Apple(clientId, teamId, keyId, keyBuffer, `${baseUrl}/api/auth/apple/callback`);
}

/**
 * GET /api/auth/apple
 *
 * Redirects to Apple OAuth consent screen.
 */
export async function GET() {
  const apple = getAppleClient();
  if (!apple) {
    return NextResponse.json(
      { error: "Apple OAuth not configured" },
      { status: 404 },
    );
  }

  const state = generateState();
  const url = apple.createAuthorizationURL(state, ["openid", "email", "name"]);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
