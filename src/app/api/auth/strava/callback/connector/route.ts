import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createConnector } from "@/lib/connectors/connector-service";
import { enqueueJob } from "@/lib/worker";
import { resolveAuthenticatedConnectorScope } from "@/lib/connectors/route-auth";

/**
 * GET /api/auth/strava/callback/connector
 *
 * Handles the OAuth callback for the Strava connector flow.
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

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/builder?error=oauth_not_configured", req.url),
    );
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("strava_connector_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      new URL("/builder?error=invalid_state", req.url),
    );
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error(
        "[strava-connector-oauth] Token exchange failed:",
        tokenRes.status,
      );
      return NextResponse.redirect(
        new URL("/builder?error=strava_connect_failed", req.url),
      );
    }

    const tokens = await tokenRes.json();
    const ownerKey = scope.cognitiveOwnerKey;

    const connector = createConnector(
      ownerKey,
      "strava",
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        athlete_id: tokens.athlete?.id,
      },
      {},
    );

    enqueueJob("connector_sync", {
      ownerKey,
      connectorId: connector.id,
    });

    const response = NextResponse.redirect(
      new URL("/builder?connector=strava_connected", req.url),
    );
    response.cookies.delete("strava_connector_state");
    return response;
  } catch (error) {
    console.error("[strava-connector-oauth] Callback error:", error);
    return NextResponse.redirect(
      new URL("/builder?error=strava_connect_failed", req.url),
    );
  }
}
