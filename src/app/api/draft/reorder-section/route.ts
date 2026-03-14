import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getDraft, upsertDraft } from "@/lib/services/page-service";
import type { PageConfig } from "@/lib/page-config/schema";

export const dynamic = "force-dynamic";

/**
 * POST /api/draft/reorder-section
 *
 * Move a section up or down in the draft page section order.
 * Body: { sectionType: string, direction: "up" | "down" }
 */
export async function POST(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";

  try {
    const body = await req.json();
    const { sectionType, direction } = body;

    if (typeof sectionType !== "string" || !sectionType) {
      return NextResponse.json(
        { success: false, error: "sectionType is required" },
        { status: 400 },
      );
    }

    if (direction !== "up" && direction !== "down") {
      return NextResponse.json(
        { success: false, error: "direction must be 'up' or 'down'" },
        { status: 400 },
      );
    }

    const draft = getDraft(primaryKey);
    if (!draft) {
      return NextResponse.json(
        { success: false, code: "NO_DRAFT", error: "No draft found." },
        { status: 404 },
      );
    }

    const sections = [...draft.config.sections];
    const idx = sections.findIndex((s) => s.type === sectionType);

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: `Section '${sectionType}' not found in draft` },
        { status: 400 },
      );
    }

    // Cannot move hero (always first) or footer (always last)
    if (sectionType === "hero" || sectionType === "footer") {
      return NextResponse.json(
        { success: false, error: `Cannot move '${sectionType}' — it is a fixed structural section` },
        { status: 400 },
      );
    }

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;

    // Bounds check (also protect hero at 0 and footer at end)
    if (targetIdx < 0 || targetIdx >= sections.length) {
      return NextResponse.json({ success: true, hint: "Already at boundary" });
    }

    // Don't swap with hero (index 0) or footer (last)
    const targetSection = sections[targetIdx];
    if (targetSection.type === "hero" || targetSection.type === "footer") {
      return NextResponse.json({ success: true, hint: "Cannot swap with fixed section" });
    }

    // Swap
    [sections[idx], sections[targetIdx]] = [sections[targetIdx], sections[idx]];

    const updated: PageConfig = { ...draft.config, sections: sections as PageConfig["sections"] };
    upsertDraft(draft.username, updated, primaryKey);

    return NextResponse.json({
      success: true,
      newOrder: sections.map((s) => s.type),
    });
  } catch (error) {
    console.error("[reorder-section] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
