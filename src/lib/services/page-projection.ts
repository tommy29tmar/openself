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
 * Project a canonical config from facts — ALL sections, no completeness filter.
 * Used by preview (builder) to show all sections including incomplete ones.
 */
export function projectCanonicalConfig(
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

  return config;
}

/**
 * Apply completeness filter to a canonical config.
 * Thin wrapper — avoids double composition.
 */
export function publishableFromCanonical(canonical: PageConfig): PageConfig {
  return { ...canonical, sections: filterCompleteSections(canonical.sections) };
}

/**
 * Project a publishable config from facts (complete sections only).
 * Used by publish pipeline. Unchanged behavior — canonical + completeness filter.
 */
export function projectPublishableConfig(
  facts: FactRow[],
  username: string,
  factLanguage: string,
  draftMeta?: DraftMeta,
): PageConfig {
  return publishableFromCanonical(
    projectCanonicalConfig(facts, username, factLanguage, draftMeta),
  );
}
