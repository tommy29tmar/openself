import { NextResponse } from "next/server";
import { getDraft, upsertDraft } from "@/lib/services/page-service";
import type { PageConfig, SectionLock } from "@/lib/page-config/schema";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/draft/lock — Apply a user lock to a section.
 * Only via authenticated UI — creates lock with lockedBy: "user".
 */
export async function POST(req: Request) {
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";

  try {
    const body = await req.json();
    const { sectionId, position, widget, content, reason } = body;

    if (!sectionId || typeof sectionId !== "string") {
      return NextResponse.json(
        { success: false, error: "sectionId is required" },
        { status: 400 },
      );
    }

    const draft = getDraft(primaryKey);
    if (!draft) {
      return NextResponse.json(
        { success: false, error: "No draft exists" },
        { status: 404 },
      );
    }

    const config = { ...draft.config };
    const sectionIndex = config.sections.findIndex((s) => s.id === sectionId);
    if (sectionIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Section not found" },
        { status: 404 },
      );
    }

    // Apply lock with lockedBy: "user"
    const lock: SectionLock = {
      position: position ?? true,
      widget: widget ?? true,
      content: content ?? false,
      lockedBy: "user",
      lockedAt: new Date().toISOString(),
      reason: typeof reason === "string" ? reason : undefined,
    };

    config.sections = config.sections.map((s, i) => {
      if (i === sectionIndex) {
        const { lockProposal: _, ...rest } = s;
        return { ...rest, lock };
      }
      return s;
    });

    upsertDraft(draft.username, config as PageConfig, primaryKey);

    return NextResponse.json({ success: true, sectionId, lock });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}

/**
 * DELETE /api/draft/lock — Remove a lock from a section.
 */
export async function DELETE(req: Request) {
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";

  try {
    const body = await req.json();
    const { sectionId } = body;

    if (!sectionId || typeof sectionId !== "string") {
      return NextResponse.json(
        { success: false, error: "sectionId is required" },
        { status: 400 },
      );
    }

    const draft = getDraft(primaryKey);
    if (!draft) {
      return NextResponse.json(
        { success: false, error: "No draft exists" },
        { status: 404 },
      );
    }

    const config = { ...draft.config };
    config.sections = config.sections.map((s) => {
      if (s.id === sectionId) {
        const { lock: _, lockProposal: __, ...rest } = s;
        return rest;
      }
      return s;
    });

    upsertDraft(draft.username, config as PageConfig, primaryKey);

    return NextResponse.json({ success: true, sectionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
