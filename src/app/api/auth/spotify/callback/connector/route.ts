import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Spotify } from "arctic";
import { createConnector } from "@/lib/connectors/connector-service";
import { enqueueJob } from "@/lib/worker";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";

function getSpotifyClient(): Spotify | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) return null;

  return new Spotify(
    clientId,
    clientSecret,
    `${baseUrl}/api/auth/spotify/callback/connector`,
  );
}

/**
 * GET /api/auth/spotify/callback/connector
 *
 * Handles the OAuth callback for the Spotify connector flow.
 * Exchanges the authorization code for tokens, stores them encrypted
 * via createConnector(), and enqueues an initial sync job.
 */
export async function GET(req: NextRequest) {
  const scope = resolveAuthenticatedConnectorScope(req);
  if (!scope) {
    return NextResponse.redirect(
      new URL("/builder?error=auth_required", req.url),
    );
  }

  const spotify = getSpotifyClient();
  if (!spotify) {
    return NextResponse.redirect(
      new URL("/builder?error=oauth_not_configured", req.url),
    );
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("sp_connector_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      new URL("/builder?error=invalid_state", req.url),
    );
  }

  try {
    const tokens = await spotify.validateAuthorizationCode(code, null);
    const accessToken = tokens.accessToken();
    const refreshToken = tokens.hasRefreshToken()
      ? tokens.refreshToken()
      : undefined;
    const expiresIn = tokens.accessTokenExpiresInSeconds();

    const ownerKey = scope.cognitiveOwnerKey;

    const connector = createConnector(ownerKey, "spotify", {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
    });

    enqueueJob("connector_sync", {
      ownerKey,
      connectorId: connector.id,
    });

    const response = NextResponse.redirect(
      new URL("/builder?connector=spotify_connected", req.url),
    );
    response.cookies.delete("sp_connector_state");
    return response;
  } catch (error) {
    console.error("[spotify-connector-oauth] Callback error:", error);
    return NextResponse.redirect(
      new URL("/builder?error=spotify_connect_failed", req.url),
    );
  }
}
