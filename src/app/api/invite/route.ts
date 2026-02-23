import { NextResponse } from "next/server";
import {
  isMultiUserEnabled,
  isValidInviteCode,
  createSession,
} from "@/lib/services/session-service";
import { createSessionCookie } from "@/lib/auth/session";

export async function POST(req: Request) {
  if (!isMultiUserEnabled()) {
    return NextResponse.json(
      { success: false, error: "Invite codes not enabled" },
      { status: 404 },
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

  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": createSessionCookie(sessionId),
      },
    },
  );
}
