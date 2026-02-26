import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import {
  setFactVisibility,
  getFactById,
  VisibilityTransitionError,
} from "@/lib/services/kb-service";
import type { Visibility } from "@/lib/visibility/policy";

/**
 * POST /api/facts/[id]/visibility
 *
 * Set fact visibility. User can set any valid transition for non-sensitive categories
 * (private↔proposed↔public) and only →private for sensitive categories.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: factId } = await params;

  // Auth
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";
  const readKeys = scope?.knowledgeReadKeys ?? [primaryKey];

  // Parse body
  let body: { visibility?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targetVisibility = body.visibility as Visibility | undefined;
  if (!targetVisibility || !["private", "proposed", "public"].includes(targetVisibility)) {
    return NextResponse.json(
      { error: "visibility must be 'private', 'proposed', or 'public'" },
      { status: 400 },
    );
  }

  // Ownership check: fact must belong to this user's sessions
  const fact = getFactById(factId, primaryKey, readKeys);
  if (!fact) {
    return NextResponse.json({ error: "Fact not found" }, { status: 404 });
  }

  try {
    const updated = setFactVisibility(
      factId,
      targetVisibility,
      "user",
      primaryKey,
      readKeys,
    );
    return NextResponse.json({
      success: true,
      factId: updated.id,
      visibility: updated.visibility,
    });
  } catch (error) {
    if (error instanceof VisibilityTransitionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
