import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { toggleSectionVisibility } from "@/lib/services/section-visibility-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/draft/toggle-section
 *
 * Toggle visibility of a section on the draft page.
 * Body: { sectionType: string, hidden: boolean }
 * hidden=true  -> hide the section (add to hidden list)
 * hidden=false -> show the section (remove from hidden list)
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
    const { sectionType, hidden } = body;

    if (typeof sectionType !== "string" || !sectionType) {
      return NextResponse.json(
        { success: false, error: "sectionType is required" },
        { status: 400 },
      );
    }

    if (typeof hidden !== "boolean") {
      return NextResponse.json(
        { success: false, error: "hidden must be a boolean" },
        { status: 400 },
      );
    }

    // visible = !hidden (toggleSectionVisibility uses visible=true to show)
    const hiddenSections = toggleSectionVisibility(primaryKey, sectionType, !hidden);

    return NextResponse.json({ success: true, hiddenSections });
  } catch (error) {
    console.error("[toggle-section] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
