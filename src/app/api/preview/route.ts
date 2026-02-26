import { NextResponse } from "next/server";
import { getAllFacts } from "@/lib/services/kb-service";
import { getDraft } from "@/lib/services/page-service";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

/**
 * GET /api/preview?username=...
 *
 * Returns the current draft page config for the preview pane.
 * Always reads from the draft row — never from published.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language") || "en";

  // Resolve owner scope (survives session rotation)
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const primaryKey = scope?.knowledgePrimaryKey ?? "__default__";
  const readKeys = scope?.knowledgeReadKeys;

  // Always read the draft
  const draft = getDraft(primaryKey);
  if (draft) {
    return NextResponse.json({
      status: "optimistic_ready",
      publishStatus: draft.status, // "draft" | "approval_pending"
      config: draft.config,
      configHash: draft.configHash,
    });
  }

  // No draft yet — compose optimistic page from facts
  const facts = getAllFacts(primaryKey, readKeys);
  if (facts.length === 0) {
    return NextResponse.json({
      status: "idle",
      publishStatus: "draft",
      config: null,
    });
  }

  // Dynamic import to avoid circular dependency issues at build time
  const { composeOptimisticPage } = await import(
    "@/lib/services/page-composer"
  );
  const config = composeOptimisticPage(facts, "draft", language);

  return NextResponse.json({
    status: "optimistic_ready",
    publishStatus: "draft",
    config,
    factCount: facts.length,
  });
}
