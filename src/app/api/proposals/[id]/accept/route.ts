import { NextResponse } from "next/server";
import { acceptProposal } from "@/lib/services/proposal-service";
import { getAuthContext } from "@/lib/auth/session";

/**
 * POST /api/proposals/[id]/accept
 *
 * Accept a single conformity proposal by ID.
 * Guards (stale facts, state changed) are checked inside acceptProposal.
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

  const result = acceptProposal(proposalId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
