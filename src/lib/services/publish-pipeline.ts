import { sqlite } from "@/lib/db";
import { getAllFacts } from "@/lib/services/kb-service";
import {
  getDraft,
  upsertDraft,
  requestPublish,
  confirmPublish,
  computeConfigHash,
} from "@/lib/services/page-service";
import { getPreferences } from "@/lib/services/preferences-service";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { translatePageContent } from "@/lib/ai/translate";
import type { PageConfig } from "@/lib/page-config/schema";
import { normalizeConfigForWrite } from "@/lib/page-config/normalize";
import { PublishError } from "@/lib/services/errors";
import { setProfileUsername } from "@/lib/services/auth-service";
import { resolveLayoutTemplate } from "@/lib/layout/registry";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { validateLayoutComposition } from "@/lib/layout/quality";
import { buildWidgetMap } from "@/lib/layout/widgets";
import {
  toSlotAssignments,
  canFullyValidateSection,
} from "@/lib/layout/validate-adapter";

export type PublishMode = "register" | "publish";

export type PrepareAndPublishOptions = {
  mode: PublishMode;
  /** If provided and doesn't match the current draft configHash, returns 409 STALE_PREVIEW_HASH. */
  expectedHash?: string;
  /** If set, claim profile.username inside the publish transaction (atomic). */
  claimProfileId?: string;
};

export type PublishResult = {
  success: true;
  username: string;
  url: string;
  regenerated: boolean;
};

// Re-export for backward compatibility
export { PublishError };

/**
 * Shared publish pipeline used by both /api/register and /api/publish.
 *
 * 1. Load all facts
 * 2. Freshness check: compare latest fact timestamp with draft timestamp
 * 3. If regeneration needed: compose + translate (async, outside transaction)
 * 4. Atomic transaction: upsertDraft (if regenerated) + requestPublish + confirmPublish
 */
export async function prepareAndPublish(
  username: string,
  sessionId: string,
  opts: PrepareAndPublishOptions,
): Promise<PublishResult> {
  const { mode, expectedHash } = opts;

  // Step 1: load all facts
  const facts = getAllFacts(sessionId);
  if (facts.length === 0) {
    throw new PublishError("No facts to publish", "NO_FACTS", 400);
  }

  // Step 2: load current draft
  const draft = getDraft(sessionId);

  // Step 2b: expectedHash guard (concurrency check)
  if (expectedHash && draft && draft.configHash !== expectedHash) {
    throw new PublishError(
      "Preview is stale — reload and try again",
      "STALE_PREVIEW_HASH",
      409,
    );
  }

  // Step 3: freshness check
  let needsRegeneration = false;
  let finalConfig: PageConfig | null = null;

  if (!draft) {
    // No draft at all — must regenerate
    needsRegeneration = true;
  } else {
    // Compare latest fact updated_at with draft updatedAt
    const latestFactTime = Math.max(
      ...facts.map((f) => new Date(f.updatedAt ?? 0).getTime()),
    );
    const draftTime = new Date(draft.updatedAt ?? 0).getTime();

    if (latestFactTime > draftTime) {
      // Facts are newer than draft
      if (mode === "register") {
        // Onboarding: auto-regenerate (user hasn't customized yet)
        needsRegeneration = true;
      } else {
        // Explicit publish: refuse — user may have customized
        throw new PublishError(
          "Draft is not up to date — regenerate the page before publishing",
          "STALE_DRAFT",
          409,
        );
      }
    }
  }

  // Step 4: regenerate if needed (async, OUTSIDE transaction)
  if (needsRegeneration) {
    const { language, factLanguage } = getPreferences(sessionId);
    const factLang = factLanguage ?? language ?? "en";
    const targetLang = language ?? "en";

    const composed = composeOptimisticPage(facts, username, factLang);

    // Preserve theme/style from existing draft if any
    const styled: PageConfig = draft
      ? { ...composed, theme: draft.config.theme, style: draft.config.style }
      : composed;

    finalConfig = normalizeConfigForWrite(
      await translatePageContent(styled, targetLang, factLang),
    );
  }

  // Step 4b: Layout validation gate
  const configToPublish = finalConfig ?? draft!.config;
  const resolvedTemplate = resolveLayoutTemplate(configToPublish);

  // Check if all sections can be fully validated
  const allSectionsValidatable = configToPublish.sections.every((s) =>
    canFullyValidateSection(s),
  );

  const sectionsForValidation = allSectionsValidatable
    ? configToPublish.sections
    : assignSlotsFromFacts(
        resolvedTemplate,
        configToPublish.sections,
        undefined,
        { repair: false },
      ).sections;

  const conversionResult = toSlotAssignments(sectionsForValidation);
  const assignments = conversionResult.assignments;
  const skipped = conversionResult.skipped;

  // INVARIANT: every section must have an explicit outcome
  if (skipped.length > 0) {
    const isPostAssignment = !allSectionsValidatable;
    const statusCode = isPostAssignment ? 500 : 400;
    const errorCode = isPostAssignment
      ? "LAYOUT_VALIDATION_INCOMPLETE"
      : "LAYOUT_CONFIG_INVALID";
    throw new PublishError(
      `Layout validation: ${skipped.length} section(s) not validatable: ${skipped.map((s) => `${s.sectionId} (${s.reason})`).join("; ")}`,
      errorCode,
      statusCode,
    );
  }

  const widgetMap = buildWidgetMap();
  const layoutResult = validateLayoutComposition(
    resolvedTemplate,
    assignments,
    widgetMap,
  );
  const layoutErrors = layoutResult.all.filter((i) => i.severity === "error");
  if (layoutErrors.length > 0) {
    throw new PublishError(
      `Layout invalid: ${layoutErrors.map((e) => e.message).join("; ")}`,
      "LAYOUT_INVALID",
      400,
    );
  }
  // Warnings → log but don't block (layout validation passes)

  // Step 5: atomic DB writes
  const txn = sqlite.transaction(() => {
    if (opts.claimProfileId) {
      setProfileUsername(opts.claimProfileId, username);
    }
    if (finalConfig) {
      upsertDraft(username, finalConfig, sessionId);
    }
    requestPublish(username, sessionId);
    confirmPublish(username, sessionId);
  });

  try {
    txn();
  } catch (err: unknown) {
    if (
      opts.claimProfileId &&
      err instanceof Error &&
      "code" in err &&
      String((err as Record<string, unknown>).code).startsWith("SQLITE_CONSTRAINT")
    ) {
      throw new PublishError("Username already taken", "USERNAME_TAKEN", 409);
    }
    throw err;
  }

  return {
    success: true,
    username,
    url: `/${username}`,
    regenerated: needsRegeneration,
  };
}
