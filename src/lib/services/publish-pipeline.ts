import { sqlite } from "@/lib/db";
import { getAllFacts, setFactVisibility } from "@/lib/services/kb-service";
import {
  getDraft,
  upsertDraft,
  requestPublish,
  confirmPublish,
  computeConfigHash,
} from "@/lib/services/page-service";
import { getPreferences } from "@/lib/services/preferences-service";
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
import {
  filterPublishableFacts,
  projectPublishableConfig,
} from "@/lib/services/page-projection";

export type PublishMode = "register" | "publish";

export type PrepareAndPublishOptions = {
  mode: PublishMode;
  /** If provided and doesn't match the canonical config hash, returns 409 STALE_PREVIEW_HASH. */
  expectedHash?: string;
  /** If set, claim profile.username inside the publish transaction (atomic). */
  claimProfileId?: string;
};

export type PublishResult = {
  success: true;
  username: string;
  url: string;
};

// Re-export for backward compatibility
export { PublishError };

/**
 * Shared publish pipeline used by both /api/register and /api/publish.
 *
 * Flow:
 * A. Validate: check facts, filter publishable
 * B. Canonical config + hash guard (BEFORE any side-effects)
 * C. Translate (async, outside transaction — LLM call can't be in SQLite txn)
 * D. Atomic transaction: promote proposed→public, persist, publish
 */
export async function prepareAndPublish(
  username: string,
  sessionId: string,
  opts: PrepareAndPublishOptions,
): Promise<PublishResult> {
  const { mode, expectedHash } = opts;

  // Step A: Validate — use shared filter
  const facts = getAllFacts(sessionId);
  if (facts.length === 0) {
    throw new PublishError("No facts to publish", "NO_FACTS", 400);
  }

  const publishable = filterPublishableFacts(facts);
  if (publishable.length === 0) {
    throw new PublishError(
      "No publishable facts — all facts are private or sensitive",
      "NO_PUBLISHABLE_FACTS",
      400,
    );
  }

  // Load draft for metadata
  const draft = getDraft(sessionId);

  // Username mismatch guard (publish mode only)
  if (mode === "publish" && draft && draft.username !== username) {
    throw new PublishError(
      `Username mismatch: draft is "${draft.username}" but publish requested "${username}"`,
      "USERNAME_MISMATCH",
      409,
    );
  }

  // Step B: Canonical config + hash guard (BEFORE any side-effects)
  const { language, factLanguage } = getPreferences(sessionId);
  const factLang = factLanguage ?? language ?? "en";
  const targetLang = language ?? "en";

  const draftMeta = draft
    ? {
        theme: draft.config.theme,
        style: draft.config.style,
        layoutTemplate: draft.config.layoutTemplate,
        sections: draft.config.sections,
      }
    : undefined;

  const canonicalConfig = projectPublishableConfig(
    facts,
    username,
    factLang,
    draftMeta,
  );

  if (expectedHash) {
    const canonicalHash = computeConfigHash(canonicalConfig);
    if (canonicalHash !== expectedHash) {
      throw new PublishError(
        "Preview is stale — reload and try again",
        "STALE_PREVIEW_HASH",
        409,
      );
    }
  }

  // Layout validation gate
  const resolvedTemplate = resolveLayoutTemplate(canonicalConfig);

  const allSectionsValidatable = canonicalConfig.sections.every((s) =>
    canFullyValidateSection(s),
  );

  const sectionsForValidation = allSectionsValidatable
    ? canonicalConfig.sections
    : assignSlotsFromFacts(
        resolvedTemplate,
        canonicalConfig.sections,
        undefined,
        { repair: false },
      ).sections;

  const conversionResult = toSlotAssignments(sectionsForValidation);
  const assignments = conversionResult.assignments;
  const skipped = conversionResult.skipped;

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

  // Step C: Translate (async, OUTSIDE transaction — LLM call can't be in SQLite txn)
  const renderedConfig = normalizeConfigForWrite(
    await translatePageContent(canonicalConfig, targetLang, factLang),
  );

  // Step D: Atomic transaction — promote proposed→public, persist, publish
  const txn = sqlite.transaction(() => {
    if (opts.claimProfileId) {
      setProfileUsername(opts.claimProfileId, username);
    }

    // Promote all proposed publishable facts to public
    for (const fact of publishable) {
      if (fact.visibility === "proposed") {
        setFactVisibility(fact.id, "public", "user", sessionId);
      }
    }

    // Persist rendered (translated) config and publish
    upsertDraft(username, renderedConfig, sessionId);
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
  };
}
