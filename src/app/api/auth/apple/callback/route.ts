import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Apple, decodeIdToken } from "arctic";
import { handleOAuthCallback } from "@/lib/services/oauth-service";
import { createSessionCookie } from "@/lib/auth/session";

function getAppleClient(): Apple | null {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!clientId || !teamId || !keyId || !privateKey) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const keyBuffer = new Uint8Array(Buffer.from(privateKey, "base64"));
  return new Apple(clientId, teamId, keyId, keyBuffer, `${baseUrl}/api/auth/apple/callback`);
}

/**
 * POST /api/auth/apple/callback
 *
 * Handles the OAuth callback from Apple.
 * Apple sends callback as POST with form-encoded body.
 */
export async function POST(req: NextRequest) {
  const apple = getAppleClient();
  if (!apple) {
    return NextResponse.redirect(new URL("/login?error=oauth_not_configured", req.url));
  }

  const formData = await req.formData();
  const code = formData.get("code") as string | null;
  const state = formData.get("state") as string | null;
  const storedState = req.cookies.get("oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
  }

  try {
    const tokens = await apple.validateAuthorizationCode(code);
    const idToken = tokens.idToken();

    // Apple provides user info via the ID token (JWT)
    const claims = decodeIdToken(idToken) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
    };

    // Apple may also send user info in the POST body (first authorization only)
    const userStr = formData.get("user") as string | null;
    let displayName: string | undefined;
    if (userStr) {
      try {
        const userData = JSON.parse(userStr);
        const firstName = userData.name?.firstName ?? "";
        const lastName = userData.name?.lastName ?? "";
        displayName = `${firstName} ${lastName}`.trim() || undefined;
      } catch {
        // Ignore parse errors
      }
    }

    if (!claims.email) {
      return NextResponse.redirect(new URL("/login?error=no_email", req.url));
    }

    const preLoginSession = req.cookies.get("os_session")?.value;
    const { sessionId, username } = await handleOAuthCallback({
      provider: "apple",
      providerUserId: claims.sub,
      email: claims.email,
      displayName,
    }, preLoginSession);

    const redirectUrl = username ? `/${username}` : "/builder";
    const response = NextResponse.redirect(new URL(redirectUrl, req.url));
    response.headers.set("Set-Cookie", createSessionCookie(sessionId));

    // Clear OAuth cookies
    response.cookies.delete("oauth_state");

    return response;
  } catch (error) {
    console.error("[apple-oauth] Callback error:", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}
