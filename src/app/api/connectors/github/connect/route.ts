import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GitHub, generateState } from "arctic";
import { resolveOwnerScope } from "@/lib/auth/session";

function getConnectorGitHubClient(): GitHub | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    console.error("[github-connector] NEXT_PUBLIC_BASE_URL is not set");
    return null;
  }

  return new GitHub(clientId, clientSecret, `${baseUrl}/api/auth/github/callback/connector`);
}

/**
 * GET /api/connectors/github/connect
 *
 * Initiates GitHub OAuth for the connector flow (separate from login).
 * Scope: read:user (not user:email like login).
 * Requires authentication.
 */
export async function GET(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const github = getConnectorGitHubClient();
  if (!github) {
    return NextResponse.json(
      { success: false, code: "NOT_CONFIGURED", error: "GitHub OAuth not configured." },
      { status: 404 },
    );
  }

  const state = generateState();
  const url = github.createAuthorizationURL(state, ["read:user"]);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("gh_connector_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
