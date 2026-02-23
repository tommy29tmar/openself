import { NextResponse } from "next/server";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { getAllFacts } from "@/lib/services/kb-service";
import { getDraft, hasAnyPage, upsertDraft } from "@/lib/services/page-service";
import { logEvent } from "@/lib/services/event-service";
import {
  getPreferences,
  setPreferredLanguage,
} from "@/lib/services/preferences-service";
import { isLanguageCode } from "@/lib/i18n/languages";

export const dynamic = "force-dynamic";

export async function GET() {
  const prefs = getPreferences();
  return NextResponse.json({
    language: prefs.language,
    hasPage: hasAnyPage(),
  });
}

export async function POST(req: Request) {
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

    setPreferredLanguage(language);

    let regenerated = false;
    if (regenerateDraft) {
      const facts = getAllFacts();
      if (facts.length > 0) {
        const currentDraft = getDraft();
        const username = currentDraft?.username ?? "draft";
        const regeneratedConfig = composeOptimisticPage(facts, username, language);
        const nextConfig = currentDraft
          ? {
              ...regeneratedConfig,
              theme: currentDraft.config.theme,
              style: currentDraft.config.style,
            }
          : regeneratedConfig;

        upsertDraft(username, nextConfig);
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
