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
import {
  getFactDisplayOverrideService,
  computeFactValueHash,
} from "@/lib/services/fact-display-override-service";

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
  surface: string;
  voice: string;
  light: string;
  style: PageConfig["style"];
  layoutTemplate?: LayoutTemplateId;
  sections: Section[];
};

/**
 * Apply fact display overrides to facts in memory (pre-composition).
 * Returns a new array with overridden fact values — original array is not mutated.
 * Only fields present in the override are replaced; all other fact value fields preserved.
 */
export function applyFactDisplayOverrides(
  facts: FactRow[],
  overrides: Map<string, Record<string, unknown>>,
): FactRow[] {
  if (overrides.size === 0) return facts;

  return facts.map((fact) => {
    // Check all member IDs for clusters (ProjectedFact has memberIds)
    const memberIds: string[] = (fact as any).memberIds ?? [fact.id];
    let override: Record<string, unknown> | undefined;
    for (const mid of memberIds) {
      override = overrides.get(mid);
      if (override) break;  // first match wins (primary ID checked first)
    }
    if (!override) return fact;

    const currentValue =
      typeof fact.value === "object" && fact.value !== null
        ? (fact.value as Record<string, unknown>)
        : {};

    return {
      ...fact,
      value: { ...currentValue, ...override },
    };
  });
}

/**
 * Project a canonical config from facts — ALL sections, no completeness filter.
 * Used by preview (builder) to show all sections including incomplete ones.
 */
export function projectCanonicalConfig(
  facts: FactRow[],
  username: string,
  factLanguage: string,
  draftMeta?: DraftMeta,
  profileId?: string,
): PageConfig {
  // 1. Filter to publishable facts only
  const publishable = filterPublishableFacts(facts);

  // 2. Apply fact display overrides pre-composition
  let displayFacts = publishable;
  if (profileId) {
    const overrideService = getFactDisplayOverrideService();
    const factHashes = publishable.map((f) => ({
      id: f.id,
      valueHash: computeFactValueHash(f.value),
    }));
    const validOverrides = overrideService.getValidOverrides(
      profileId,
      factHashes,
    );
    displayFacts = applyFactDisplayOverrides(publishable, validOverrides);
  }

  // 3. Build draftSlots map for slot carry-over (soft-pin).
  //    When a draft exists, we preserve each section's current slot assignment
  //    so that recomposition doesn't shuffle layout positions. The map is passed
  //    to assignSlotsFromFacts() which uses it as a preference hint — sections
  //    keep their slot if still valid for the template, otherwise normal
  //    assignment rules apply. This prevents layout jumps on fact mutations.
  const draftSlots = new Map<string, string>();
  if (draftMeta) {
    for (const ds of draftMeta.sections) {
      if (ds.slot) draftSlots.set(ds.id, ds.slot);
    }
  }

  // 4. Compose in factLanguage (canonical, no translation)
  const composed = composeOptimisticPage(
    displayFacts,
    username,
    factLanguage,
    draftMeta?.layoutTemplate,
    draftSlots.size > 0 ? draftSlots : undefined,
    profileId,
  );

  // 5. Preserve metadata from draft (surface, voice, light, style, layout)
  let config = draftMeta
    ? {
        ...composed,
        surface: draftMeta.surface,
        voice: draftMeta.voice,
        light: draftMeta.light,
        style: draftMeta.style,
        layoutTemplate: draftMeta.layoutTemplate ?? composed.layoutTemplate,
      }
    : composed;

  // 6. Preserve section order + locks from draft (metadata only, not content)
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
  profileId?: string,
): PageConfig {
  return publishableFromCanonical(
    projectCanonicalConfig(facts, username, factLanguage, draftMeta, profileId),
  );
}
