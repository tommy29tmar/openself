import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Spotify, generateState } from "arctic";
import { connectorError } from "@/lib/connectors/api-errors";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";

function getSpotifyClient(): Spotify | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    console.error("[spotify-connector] NEXT_PUBLIC_BASE_URL is not set");
    return null;
  }

  return new Spotify(
    clientId,
    clientSecret,
    `${baseUrl}/api/auth/spotify/callback/connector`,
  );
}

/**
 * GET /api/connectors/spotify/connect
 *
 * Initiates Spotify OAuth for the connector flow.
 * Scopes: user-top-read user-read-recently-played
 * Requires authentication.
 */
export async function GET(req: NextRequest) {
  const scope = resolveAuthenticatedConnectorScope(req);
  if (!scope) {
    return connectorError(
      "AUTH_REQUIRED",
      "Authentication required.",
      403,
      false,
    );
  }

  const spotify = getSpotifyClient();
  if (!spotify) {
    return connectorError(
      "NOT_CONFIGURED",
      "Spotify OAuth not configured.",
      404,
      false,
    );
  }

  const state = generateState();
  const scopes = ["user-top-read", "user-read-recently-played"];
  const url = spotify.createAuthorizationURL(state, null, scopes);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("sp_connector_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
