import { NextResponse } from "next/server";
import { and, inArray, asc, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getSessionTtlMinutes } from "@/lib/services/session-activity";

/**
 * GET /api/messages
 *
 * Returns chat history for the current active session window.
 * Messages older than SESSION_TTL are excluded (concierge model: clean chat on return).
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

  // Compute temporal cutoff in SQLite-compatible format (YYYY-MM-DD HH:MM:SS, UTC)
  // IMPORTANT: SQLite CURRENT_TIMESTAMP stores "YYYY-MM-DD HH:MM:SS" (no T, no Z).
  // toISOString() produces "YYYY-MM-DDTHH:MM:SS.000Z" — string comparison would fail.
  const ttlMinutes = getSessionTtlMinutes();
  const cutoffDate = new Date(Date.now() - ttlMinutes * 60 * 1000);
  const cutoffSql = cutoffDate.toISOString().replace("T", " ").split(".")[0];

  const rows = db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        inArray(messages.sessionId, readKeys),
        gt(messages.createdAt, cutoffSql),
      ),
    )
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();

  // Dedup by id (safety net)
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
