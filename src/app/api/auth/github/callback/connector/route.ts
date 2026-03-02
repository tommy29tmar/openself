import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GitHub } from "arctic";
import { resolveOwnerScope } from "@/lib/auth/session";
import { createConnector } from "@/lib/connectors/connector-service";
import { enqueueJob } from "@/lib/worker";

function getConnectorGitHubClient(): GitHub | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) return null;

  return new GitHub(clientId, clientSecret, `${baseUrl}/api/auth/github/callback/connector`);
}

/**
 * GET /api/auth/github/callback/connector
 *
 * Handles the OAuth callback for the GitHub connector flow (separate from login).
 * Exchanges the authorization code for an access token, stores it encrypted
 * via createConnector(), and enqueues an initial sync job.
 */
export async function GET(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    return NextResponse.redirect(new URL("/builder?error=auth_required", req.url));
  }

  const github = getConnectorGitHubClient();
  if (!github) {
    return NextResponse.redirect(new URL("/builder?error=oauth_not_configured", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("gh_connector_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/builder?error=invalid_state", req.url));
  }

  try {
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    const ownerKey = scope.cognitiveOwnerKey;

    createConnector(ownerKey, "github", { access_token: accessToken }, {});

    enqueueJob("connector_sync", { ownerKey });

    const response = NextResponse.redirect(new URL("/builder?connector=github_connected", req.url));
    response.cookies.delete("gh_connector_state");
    return response;
  } catch (error) {
    console.error("[github-connector-oauth] Callback error:", error);
    return NextResponse.redirect(new URL("/builder?error=github_connect_failed", req.url));
  }
}
