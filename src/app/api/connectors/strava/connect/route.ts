import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generateState } from "arctic";
import { connectorError } from "@/lib/connectors/api-errors";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";

/**
 * GET /api/connectors/strava/connect
 *
 * Initiates Strava OAuth for the connector flow.
 * Scopes: read,activity:read_all
 * Requires authentication.
 */
export async function GET(req: NextRequest) {
  const scope = resolveAuthenticatedConnectorScope(req);
  if (!scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return connectorError("NOT_CONFIGURED", "Strava OAuth not configured.", 404, false);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    return connectorError("NOT_CONFIGURED", "NEXT_PUBLIC_BASE_URL is not set.", 500, false);
  }

  const state = generateState();
  const redirectUri = `${baseUrl}/api/auth/strava/callback/connector`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read,activity:read_all",
    state,
  });

  const authorizeUrl = `https://www.strava.com/oauth/authorize?${params}`;

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("strava_connector_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
