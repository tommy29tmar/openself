import { NextResponse } from "next/server";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { getProjectedFacts } from "@/lib/services/fact-cluster-service";
import { getDraft, hasAnyPage, upsertDraft, getPublishedUsername, getPublishedConfigHash } from "@/lib/services/page-service";
import { logEvent } from "@/lib/services/event-service";
import {
  getPreferences,
  setPreferredLanguage,
  getFactLanguage,
  setFactLanguageIfUnset,
} from "@/lib/services/preferences-service";
import { isLanguageCode } from "@/lib/i18n/languages";
import { translatePageContent } from "@/lib/ai/translate";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { AUTH_V2 } from "@/lib/flags";
import { getUserById } from "@/lib/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";

  const prefs = getPreferences(primaryKey);
  const authCtx = isMultiUserEnabled() ? getAuthContext(req) : null;
  const readKeys = scope?.knowledgeReadKeys ?? [];
  const publishedUsername = getPublishedUsername(readKeys);

  // Resolve email verification status
  let emailVerified = false;
  if (authCtx?.userId) {
    const user = getUserById(authCtx.userId);
    emailVerified = user?.emailVerified === 1;
  }

  return NextResponse.json({
    language: prefs.language,
    hasPage: hasAnyPage(primaryKey),
    authenticated: !!(authCtx?.userId || authCtx?.username),
    username: authCtx?.username ?? null,
    multiUser: isMultiUserEnabled(),
    publishedUsername,
    publishedConfigHash: getPublishedConfigHash(readKeys),
    authV2: AUTH_V2,
    emailVerified,
  });
}

export async function POST(req: Request) {
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";
  const readKeys = scope?.knowledgeReadKeys;

  try {
    const body = await req.json();
    const language = body?.language;
    const regenerateDraft = body?.regenerateDraft === true;

    if (!isLanguageCode(language)) {
      return NextResponse.json(
        { success: false, error: "Invalid language code" },
        { status: 400 },
      );
    }

    // Record the fact language on first call (before changing preference)
    setFactLanguageIfUnset(language, primaryKey);

    setPreferredLanguage(language, primaryKey);

    let regenerated = false;
    if (regenerateDraft) {
      const facts = getProjectedFacts(primaryKey, readKeys);
      if (facts.length > 0) {
        const currentDraft = getDraft(primaryKey);
        const username = currentDraft?.username ?? "draft";
        // Always compose in the fact language so values and templates are
        // in the same language, then translate the coherent result.
        const factLanguage = getFactLanguage(primaryKey) ?? language;
        const profileId = scope?.cognitiveOwnerKey ?? primaryKey;
        const regeneratedConfig = composeOptimisticPage(facts, username, factLanguage, undefined, undefined, profileId);
        const nextConfig = currentDraft
          ? {
              ...regeneratedConfig,
              surface: currentDraft.config.surface,
              voice: currentDraft.config.voice,
              light: currentDraft.config.light,
              style: currentDraft.config.style,
            }
          : regeneratedConfig;

        const translated = await translatePageContent(nextConfig, language, factLanguage);

        upsertDraft(username, translated, primaryKey);
        regenerated = true;
      }
    }

    logEvent({
      eventType: "preferences_updated",
      actor: "user",
      payload: { language, regeneratedDraft: regenerated },
    });

    return NextResponse.json({
      success: true,
      language,
      regeneratedDraft: regenerated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
