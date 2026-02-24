import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "os_session";

// Routes that don't require authentication
const PUBLIC_PREFIXES = ["/invite", "/api/invite", "/api/auth", "/_next", "/favicon", "/login", "/signup"];

function isPublicRoute(pathname: string): boolean {
  // Homepage
  if (pathname === "/") return true;
  // Static/public prefixes
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Public user pages: /username (no slash after except for nested)
  // But not /builder, /api/*, etc.
  return false;
}

export function middleware(request: NextRequest) {
  // If INVITE_CODES is not set, pass everything through (single-user mode)
  if (!process.env.INVITE_CODES) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Protected routes: check for session cookie
  const sessionId = request.cookies.get(COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.redirect(new URL("/invite", request.url));
  }

  // Cookie exists — let the route handler validate in DB
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/builder/:path*",
    "/api/chat",
    "/api/preview",
    "/api/publish",
    "/api/draft/:path*",
    "/api/preferences",
    "/api/register",
    "/api/messages",
  ],
};
