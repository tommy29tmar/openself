import { NextResponse } from "next/server";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { getAllFacts } from "@/lib/services/kb-service";
import { getDraft, hasAnyPage, upsertDraft } from "@/lib/services/page-service";
import { logEvent } from "@/lib/services/event-service";
import {
  getPreferences,
  setPreferredLanguage,
  getFactLanguage,
  setFactLanguageIfUnset,
} from "@/lib/services/preferences-service";
import { isLanguageCode } from "@/lib/i18n/languages";
import { translatePageContent } from "@/lib/ai/translate";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { isMultiUserEnabled, getSession } from "@/lib/services/session-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sessionId = getSessionIdFromRequest(req);
  if (isMultiUserEnabled()) {
    if (!sessionId || !getSession(sessionId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const prefs = getPreferences(sessionId);
  return NextResponse.json({
    language: prefs.language,
    hasPage: hasAnyPage(sessionId),
  });
}

export async function POST(req: Request) {
  const sessionId = getSessionIdFromRequest(req);
  if (isMultiUserEnabled()) {
    if (!sessionId || !getSession(sessionId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
    setFactLanguageIfUnset(language, sessionId);

    setPreferredLanguage(language, sessionId);

    let regenerated = false;
    if (regenerateDraft) {
      const facts = getAllFacts(sessionId);
      if (facts.length > 0) {
        const currentDraft = getDraft(sessionId);
        const username = currentDraft?.username ?? "draft";
        // Always compose in the fact language so values and templates are
        // in the same language, then translate the coherent result.
        const factLanguage = getFactLanguage(sessionId) ?? language;
        const regeneratedConfig = composeOptimisticPage(facts, username, factLanguage);
        const nextConfig = currentDraft
          ? {
              ...regeneratedConfig,
              theme: currentDraft.config.theme,
              style: currentDraft.config.style,
            }
          : regeneratedConfig;

        const translated = await translatePageContent(nextConfig, language, factLanguage);

        upsertDraft(username, translated, sessionId);
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
