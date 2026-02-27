import { NextResponse } from "next/server";
import { rejectProposal } from "@/lib/services/proposal-service";
import { getAuthContext } from "@/lib/auth/session";

/**
 * POST /api/proposals/[id]/reject
 *
 * Reject a single conformity proposal by ID.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = getAuthContext(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  rejectProposal(proposalId);
  return NextResponse.json({ ok: true });
}
