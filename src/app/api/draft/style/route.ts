import { NextResponse } from "next/server";
import { getDraft, upsertDraft } from "@/lib/services/page-service";
import { AVAILABLE_THEMES } from "@/lib/page-config/schema";
import { isAvailableFont } from "@/lib/page-config/fonts";
import type { PageConfig } from "@/lib/page-config/schema";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { LAYOUT_TEMPLATES, type LayoutTemplateId } from "@/lib/layout/contracts";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { extractLocks } from "@/lib/layout/lock-policy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Resolve owner scope (survives session rotation)
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";

  try {
    const body = await req.json();
    const draft = getDraft(primaryKey);

    if (!draft) {
      return NextResponse.json(
        { success: false, error: "No draft exists" },
        { status: 404 },
      );
    }

    const config = { ...draft.config };

    // Merge theme if provided
    if (
      typeof body.theme === "string" &&
      (AVAILABLE_THEMES as readonly string[]).includes(body.theme)
    ) {
      config.theme = body.theme;
    }

    // Merge style fields if provided
    if (body.style && typeof body.style === "object") {
      const style = { ...config.style };

      if (body.style.colorScheme === "light" || body.style.colorScheme === "dark") {
        style.colorScheme = body.style.colorScheme;
      }

      if (isAvailableFont(body.style.fontFamily)) {
        style.fontFamily = body.style.fontFamily;
      }

      if (
        body.style.layout === "centered" ||
        body.style.layout === "split" ||
        body.style.layout === "stack"
      ) {
        style.layout = body.style.layout;
      }

      config.style = style;
    }

    // Merge layoutTemplate if provided
    if (
      typeof body.layoutTemplate === "string" &&
      (LAYOUT_TEMPLATES as readonly string[]).includes(body.layoutTemplate)
    ) {
      config.layoutTemplate = body.layoutTemplate as LayoutTemplateId;

      // Re-assign slots for the new template
      const template = getLayoutTemplate(config.layoutTemplate);
      const locks = extractLocks(config.sections);
      const { sections, issues } = assignSlotsFromFacts(
        template,
        config.sections,
        locks,
      );

      const errors = issues.filter((i) => i.severity === "error");
      if (errors.length > 0) {
        return NextResponse.json(
          { success: false, error: "Layout incompatible", issues: errors },
          { status: 400 },
        );
      }
      config.sections = sections;

      // Canonicalize style.layout when layoutTemplate is present
      config.style = { ...config.style, layout: "centered" };
    }

    upsertDraft(draft.username, config as PageConfig, primaryKey);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
