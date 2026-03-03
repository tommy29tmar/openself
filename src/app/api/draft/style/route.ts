import { NextResponse } from "next/server";
import { getDraft, upsertDraft, getPublishedPage, getPublishedUsername } from "@/lib/services/page-service";
import { isValidSurface, isValidVoice, isValidLight } from "@/lib/presence";
import type { PageConfig } from "@/lib/page-config/schema";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { LAYOUT_TEMPLATES, type LayoutTemplateId, resolveLayoutAlias } from "@/lib/layout/contracts";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { extractLocks } from "@/lib/layout/lock-policy";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getPreferences } from "@/lib/services/preferences-service";
import { projectCanonicalConfig } from "@/lib/services/page-projection";

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
    let draft = getDraft(primaryKey);

    if (!draft) {
      // Auto-compose from facts (ensureDraft pattern — handles OwnerScope shift after registration)
      const readKeys = scope?.knowledgeReadKeys ?? [primaryKey];
      const facts = getActiveFacts(primaryKey, readKeys);
      if (facts.length === 0) {
        return NextResponse.json(
          { success: false, error: "No draft exists" },
          { status: 404 },
        );
      }
      const authCtx = getAuthContext(req);
      const draftUsername = authCtx?.username ?? "draft";
      const { factLanguage, language } = getPreferences(primaryKey);
      const factLang = factLanguage ?? language ?? "en";
      const authProfileId = scope?.cognitiveOwnerKey ?? authCtx?.profileId ?? primaryKey;
      // Carry forward surface/voice/light from published page if it exists
      const pubUsername = getPublishedUsername(readKeys);
      const published = pubUsername ? getPublishedPage(pubUsername) : null;
      const draftMeta = published ? {
        surface: published.surface,
        voice: published.voice,
        light: published.light,
        style: published.style,
        layoutTemplate: published.layoutTemplate,
        sections: published.sections,
      } : undefined;
      const composed = projectCanonicalConfig(facts, draftUsername, factLang, draftMeta, authProfileId);
      upsertDraft(draftUsername, composed, primaryKey);
      draft = getDraft(primaryKey);
      if (!draft) {
        return NextResponse.json(
          { success: false, error: "No draft exists" },
          { status: 404 },
        );
      }
    }

    const config = { ...draft.config };

    // Merge surface if provided
    if (body.surface !== undefined) {
      if (!isValidSurface(body.surface)) {
        return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
      }
      config.surface = body.surface;
    }

    // Merge voice if provided
    if (body.voice !== undefined) {
      if (!isValidVoice(body.voice)) {
        return NextResponse.json({ error: "Invalid voice" }, { status: 400 });
      }
      config.voice = body.voice;
    }

    // Merge light if provided
    if (body.light !== undefined) {
      if (!isValidLight(body.light)) {
        return NextResponse.json({ error: "Invalid light" }, { status: 400 });
      }
      config.light = body.light;
    }

    // Merge style fields if provided (layout only — colorScheme/fontFamily removed)
    if (body.style && typeof body.style === "object") {
      const style = { ...config.style };

      if (
        body.style.layout === "centered" ||
        body.style.layout === "split" ||
        body.style.layout === "stack"
      ) {
        style.layout = body.style.layout;
      }

      config.style = style;
    }

    // Merge layoutTemplate if provided (resolve aliases like "bento" → "architect")
    const resolvedLayout = typeof body.layoutTemplate === "string" ? resolveLayoutAlias(body.layoutTemplate) : undefined;
    if (
      resolvedLayout &&
      (LAYOUT_TEMPLATES as readonly string[]).includes(resolvedLayout)
    ) {
      config.layoutTemplate = resolvedLayout as LayoutTemplateId;

      // Re-assign slots for the new template (carry over existing slot assignments)
      const template = getLayoutTemplate(config.layoutTemplate);
      const locks = extractLocks(config.sections);
      const draftSlots = new Map<string, string>();
      for (const s of config.sections) {
        if (s.slot) draftSlots.set(s.id, s.slot);
      }
      const { sections, issues } = assignSlotsFromFacts(
        template,
        config.sections,
        locks,
        undefined,
        draftSlots.size > 0 ? draftSlots : undefined,
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
