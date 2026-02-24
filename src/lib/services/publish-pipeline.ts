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

export type PublishMode = "register" | "publish";

export type PrepareAndPublishOptions = {
  mode: PublishMode;
  /** If provided and doesn't match the current draft configHash, returns 409 STALE_PREVIEW_HASH. */
  expectedHash?: string;
};

export type PublishResult = {
  success: true;
  username: string;
  url: string;
  regenerated: boolean;
};

export class PublishError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

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

    finalConfig = await translatePageContent(styled, targetLang, factLang);
  }

  // Step 5: atomic DB writes
  const txn = sqlite.transaction(() => {
    if (finalConfig) {
      upsertDraft(username, finalConfig, sessionId);
    }
    requestPublish(username, sessionId);
    confirmPublish(username, sessionId);
  });

  txn();

  return {
    success: true,
    username,
    url: `/${username}`,
    regenerated: needsRegeneration,
  };
}
