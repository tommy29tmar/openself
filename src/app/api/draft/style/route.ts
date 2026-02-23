import { NextResponse } from "next/server";
import { getDraft, upsertDraft } from "@/lib/services/page-service";
import { AVAILABLE_THEMES } from "@/lib/page-config/schema";
import { isAvailableFont } from "@/lib/page-config/fonts";
import type { PageConfig } from "@/lib/page-config/schema";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { isMultiUserEnabled, getSession } from "@/lib/services/session-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Resolve session
  const sessionId = getSessionIdFromRequest(req);
  if (isMultiUserEnabled()) {
    if (!sessionId || !getSession(sessionId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json();
    const draft = getDraft(sessionId);

    if (!draft) {
      return NextResponse.json(
        { success: false, error: "No draft exists" },
        { status: 404 },
      );
    }

    const config = { ...draft.config };

    // Merge theme if provided
    if (
      typeof body.theme === "string" &&
      (AVAILABLE_THEMES as readonly string[]).includes(body.theme)
    ) {
      config.theme = body.theme;
    }

    // Merge style fields if provided
    if (body.style && typeof body.style === "object") {
      const style = { ...config.style };

      if (body.style.colorScheme === "light" || body.style.colorScheme === "dark") {
        style.colorScheme = body.style.colorScheme;
      }

      if (isAvailableFont(body.style.fontFamily)) {
        style.fontFamily = body.style.fontFamily;
      }

      if (
        body.style.layout === "centered" ||
        body.style.layout === "split" ||
        body.style.layout === "stack"
      ) {
        style.layout = body.style.layout;
      }

      config.style = style;
    }

    upsertDraft(draft.username, config as PageConfig, sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
