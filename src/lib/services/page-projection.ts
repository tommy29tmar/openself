/**
 * Shared publishable projection — single source of truth for "what goes on the page".
 *
 * Used by: preview route, preview/stream route, publish pipeline.
 * Same inputs → same output → consistent hash.
 */
import type { FactRow } from "@/lib/services/kb-service";
import type { PageConfig, Section } from "@/lib/page-config/schema";
import type { LayoutTemplateId } from "@/lib/layout/contracts";
import { SENSITIVE_CATEGORIES } from "@/lib/visibility/policy";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { filterCompleteSections } from "@/lib/page-config/section-completeness";

/**
 * Single filter used by BOTH projection AND promote loop.
 * A fact is publishable if:
 * 1. Visibility is public or proposed
 * 2. Category is NOT sensitive
 */
export function filterPublishableFacts(facts: FactRow[]): FactRow[] {
  return facts.filter(
    (f) =>
      (f.visibility === "public" || f.visibility === "proposed") &&
      !SENSITIVE_CATEGORIES.has(f.category),
  );
}

export type DraftMeta = {
  theme: string;
  style: PageConfig["style"];
  layoutTemplate?: LayoutTemplateId;
  sections: Section[];
};

/**
 * Project a canonical publishable config from facts.
 *
 * This is the ONLY way to get a page config for preview or publish.
 * Returns a config composed in factLanguage (no translation — canonical).
 *
 * @param facts - All facts for the profile
 * @param username - Canonical username (from draft.username or "draft")
 * @param factLanguage - Language to compose in (canonical, no translation)
 * @param draftMeta - Optional metadata from existing draft (theme, style, layout)
 */
export function projectPublishableConfig(
  facts: FactRow[],
  username: string,
  factLanguage: string,
  draftMeta?: DraftMeta,
): PageConfig {
  // 1. Filter to publishable facts only
  const publishable = filterPublishableFacts(facts);

  // 2. Compose in factLanguage (canonical, no translation)
  const composed = composeOptimisticPage(
    publishable,
    username,
    factLanguage,
    draftMeta?.layoutTemplate,
  );

  // 3. Preserve metadata from draft (theme, style, layout)
  let config = draftMeta
    ? {
        ...composed,
        theme: draftMeta.theme,
        style: draftMeta.style,
        layoutTemplate: draftMeta.layoutTemplate ?? composed.layoutTemplate,
      }
    : composed;

  // 4. Preserve section order + locks from draft (metadata only, not content)
  if (draftMeta && draftMeta.sections.length > 0) {
    const draftOrder = draftMeta.sections.map((s) => s.id);
    const composedMap = new Map(config.sections.map((s) => [s.id, s]));

    // Sort composed sections by draft order
    const ordered: Section[] = [];
    for (const draftId of draftOrder) {
      const section = composedMap.get(draftId);
      if (section) {
        // Merge locks from draft (metadata only)
        const draftSection = draftMeta.sections.find((s) => s.id === draftId);
        if (draftSection?.lock) {
          section.lock = draftSection.lock;
        }
        ordered.push(section);
        composedMap.delete(draftId);
      }
    }
    // Append new sections not in draft order
    for (const [, section] of composedMap) {
      ordered.push(section);
    }
    config = { ...config, sections: ordered };
  }

  // 5. Completeness filter
  config = { ...config, sections: filterCompleteSections(config.sections) };

  return config;
}
