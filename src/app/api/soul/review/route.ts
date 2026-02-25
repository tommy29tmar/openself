import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { reviewProposal, getPendingProposals } from "@/lib/services/soul-service";

/**
 * GET /api/soul/review — List pending proposals
 * POST /api/soul/review — Accept or reject a proposal
 * Body: { proposalId: string, accept: boolean }
 */
export async function GET(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";
  const proposals = getPendingProposals(ownerKey);

  return NextResponse.json({ success: true, proposals });
}

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
    const { proposalId, accept } = body;

    if (!proposalId || typeof proposalId !== "string") {
      return NextResponse.json(
        { success: false, error: "proposalId is required" },
        { status: 400 },
      );
    }

    if (typeof accept !== "boolean") {
      return NextResponse.json(
        { success: false, error: "accept must be a boolean" },
        { status: 400 },
      );
    }

    const result = reviewProposal(proposalId, ownerKey, accept);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }
}
