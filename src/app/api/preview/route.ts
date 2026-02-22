import { NextResponse } from "next/server";
import { getAllFacts } from "@/lib/services/kb-service";
import { getPageByUsername } from "@/lib/services/page-service";

/**
 * GET /api/preview?username=...
 *
 * Returns the current page config for the preview pane.
 * During onboarding (before publish), it composes an optimistic
 * page from KB facts. After publish, it returns the persisted config.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username") || "draft";
  const language = searchParams.get("language") || "en";

  // Check if a published page exists
  const existing = getPageByUsername(username);
  if (existing) {
    return NextResponse.json({
      status: "published",
      config: existing,
    });
  }

  // Otherwise compose optimistic page from facts
  const facts = getAllFacts();
  if (facts.length === 0) {
    return NextResponse.json({
      status: "idle",
      config: null,
    });
  }

  // Dynamic import to avoid circular dependency issues at build time
  const { composeOptimisticPage } = await import(
    "@/lib/services/page-composer"
  );
  const config = composeOptimisticPage(facts, username, language);

  return NextResponse.json({
    status: "optimistic_ready",
    config,
    factCount: facts.length,
  });
}
