import { NextResponse } from "next/server";
import { deactivateMemory } from "@/lib/services/memory-service";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { sqlite } from "@/lib/db";

/**
 * DELETE /api/memory/[id]
 * Deactivates a memory by id (soft delete), scoped to the current owner.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = resolveOwnerScope(request);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  const mem = sqlite
    .prepare("SELECT owner_key FROM agent_memory WHERE id = ?")
    .get(id) as { owner_key: string } | undefined;

  if (!mem || mem.owner_key !== ownerKey) {
    return NextResponse.json(
      { success: false, error: "Memory not found" },
      { status: 404 },
    );
  }

  const result = deactivateMemory(id, ownerKey);
  return NextResponse.json({ success: result });
}
