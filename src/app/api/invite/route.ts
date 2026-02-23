import { NextResponse } from "next/server";
import {
  isMultiUserEnabled,
  isValidInviteCode,
  createSession,
} from "@/lib/services/session-service";
import { checkInviteRateLimit } from "@/lib/middleware/rate-limit";

export async function POST(req: Request) {
  if (!isMultiUserEnabled()) {
    return NextResponse.json(
      { success: false, error: "Invite codes not enabled" },
      { status: 404 },
    );
  }

  // Rate limit: max 5 attempts per minute per IP
  const rateResult = checkInviteRateLimit(req);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: rateResult.reason },
      {
        status: 429,
        headers: { "Retry-After": String(rateResult.retryAfter ?? 1) },
      },
    );
  }

  const body = await req.json();
  const code = body?.code;

  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { success: false, error: "Invite code is required" },
      { status: 400 },
    );
  }

  if (!isValidInviteCode(code.trim())) {
    return NextResponse.json(
      { success: false, error: "Invalid invite code" },
      { status: 403 },
    );
  }

  const sessionId = createSession(code.trim());

  const response = NextResponse.json({ success: true });
  response.cookies.set("os_session", sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
