import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import {
  acceptEpisodicProposalAsActivity,
  resolveEpisodicProposal,
} from "@/lib/services/episodic-service";

export async function POST(req: Request) {
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  try {
    const body = await req.json();
    const { id, accept } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }
    if (typeof accept !== "boolean") {
      return NextResponse.json(
        { success: false, error: "accept must be a boolean" },
        { status: 400 },
      );
    }

    if (accept) {
      const result = acceptEpisodicProposalAsActivity(
        id,
        ownerKey,
        "api", // sessionId — no chat session for API calls
        ownerKey, // profileId — same as ownerKey
      );
      if (!result) {
        return NextResponse.json(
          { success: false, error: "Proposal not found, already resolved, or expired" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, factId: result.factId });
    } else {
      const ok = resolveEpisodicProposal(id, ownerKey, false);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Proposal not found, already resolved, or expired" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true });
    }
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
}
