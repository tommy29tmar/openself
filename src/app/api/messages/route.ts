import { NextResponse } from "next/server";
import { inArray, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

/**
 * GET /api/messages
 *
 * Returns chat history for the current profile/session.
 * Uses knowledgeReadKeys to span all sessions linked to the profile.
 * Messages are always session-keyed — read via knowledgeReadKeys, dedup by id.
 */
export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const readKeys = scope?.knowledgeReadKeys ?? ["__default__"];

  const rows = db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.sessionId, readKeys))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();

  // Dedup by id (safety net — should not be needed with proper scoping)
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return NextResponse.json({
    success: true,
    messages: deduped.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
    })),
  });
}
