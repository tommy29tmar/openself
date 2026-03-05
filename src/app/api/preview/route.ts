import { NextResponse } from "next/server";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getDraft, computeConfigHash } from "@/lib/services/page-service";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { getPreferences } from "@/lib/services/preferences-service";
import { projectCanonicalConfig, publishableFromCanonical } from "@/lib/services/page-projection";
import { mergeActiveSectionCopy } from "@/lib/services/personalization-projection";

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
  const facts = getActiveFacts(primaryKey, readKeys);
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
        surface: draft.config.surface,
        voice: draft.config.voice,
        light: draft.config.light,
        style: draft.config.style,
        layoutTemplate: draft.config.layoutTemplate,
        sections: draft.config.sections,
      }
    : undefined;

  // Resolve profileId for avatar lookup
  const profileId = scope?.cognitiveOwnerKey ?? "__default__";

  // Canonical config: all sections for display
  const previewConfig = projectCanonicalConfig(
    facts,
    canonicalUsername,
    factLang,
    draftMeta,
    profileId,
  );

  // Merge personalized copy (hash-guarded, stale → deterministic fallback)
  const ownerKey = scope?.cognitiveOwnerKey ?? primaryKey;
  const personalizedConfig = mergeActiveSectionCopy(
    previewConfig,
    ownerKey,
    factLang,
    readKeys,
  );

  // Publishable hash: matches publish-pipeline expectation
  // Use ORIGINAL previewConfig for hash computation (publish path does its own merge)
  const publishableConfig = publishableFromCanonical(previewConfig);
  const configHash = computeConfigHash(publishableConfig);

  return NextResponse.json({
    status: "optimistic_ready",
    publishStatus: draft?.status ?? "draft",
    config: personalizedConfig,
    configHash,
  });
}
