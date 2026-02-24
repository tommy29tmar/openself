import { NextResponse } from "next/server";
import { GitHub, generateState } from "arctic";

function getGitHubClient(): GitHub | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  return new GitHub(clientId, clientSecret, null);
}

/**
 * GET /api/auth/github
 *
 * Redirects to GitHub OAuth consent screen.
 */
export async function GET() {
  const github = getGitHubClient();
  if (!github) {
    return NextResponse.json(
      { error: "GitHub OAuth not configured" },
      { status: 404 },
    );
  }

  const state = generateState();
  const url = github.createAuthorizationURL(state, ["user:email"]);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
