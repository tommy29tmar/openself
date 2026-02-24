import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

/**
 * GET /api/messages
 *
 * Returns chat history for the current profile/session.
 * Used by ChatPanel to restore messages for returning users.
 */
export async function GET(req: Request) {
  const authCtx = getAuthContext(req);

  if (isMultiUserEnabled() && !authCtx) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const profileId = authCtx?.profileId ?? "__default__";

  const rows = db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.sessionId, profileId))
    .all();

  return NextResponse.json({
    success: true,
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
    })),
  });
}
