import { NextResponse } from "next/server";
import { getAllFacts } from "@/lib/services/kb-service";
import { getDraft, computeConfigHash } from "@/lib/services/page-service";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getPreferences } from "@/lib/services/preferences-service";
import { projectCanonicalConfig, publishableFromCanonical } from "@/lib/services/page-projection";

/**
 * GET /api/preview?username=...
 *
 * Returns the current privacy-safe preview of the page.
 * Always composes from facts using shared projection — never serves draft.config raw.
 * Returns ALL sections (including incomplete) for builder display.
 * configHash is computed from the publishable (complete-only) config for hash guard safety.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Resolve owner scope (survives session rotation)
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";
  const readKeys = scope?.knowledgeReadKeys;

  // Load facts
  const facts = getAllFacts(primaryKey, readKeys);
  if (facts.length === 0) {
    return NextResponse.json({
      status: "idle",
      publishStatus: "draft",
      config: null,
    });
  }

  // Load draft for metadata and publish status
  const draft = getDraft(primaryKey);
  const canonicalUsername = draft?.username ?? "draft";

  // Get fact language for canonical composition
  const { factLanguage, language } = getPreferences(primaryKey);
  const factLang = factLanguage ?? language ?? "en";

  const draftMeta = draft
    ? {
        theme: draft.config.theme,
        style: draft.config.style,
        layoutTemplate: draft.config.layoutTemplate,
        sections: draft.config.sections,
      }
    : undefined;

  // Canonical config: all sections for display
  const previewConfig = projectCanonicalConfig(
    facts,
    canonicalUsername,
    factLang,
    draftMeta,
  );

  // Publishable hash: matches publish-pipeline expectation
  const publishableConfig = publishableFromCanonical(previewConfig);
  const configHash = computeConfigHash(publishableConfig);

  return NextResponse.json({
    status: "optimistic_ready",
    publishStatus: draft?.status ?? "draft",
    config: previewConfig,
    configHash,
  });
}
