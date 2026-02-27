import { NextResponse } from "next/server";
import {
  getPendingProposals,
  markStaleProposals,
} from "@/lib/services/proposal-service";
import { getAuthContext } from "@/lib/auth/session";

/**
 * GET /api/proposals
 *
 * Returns all pending conformity proposals for the authenticated owner.
 * Marks stale proposals before returning to ensure freshness.
 */
export async function GET(req: Request) {
  const auth = getAuthContext(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Mark stale before returning so the user sees only actionable proposals
  markStaleProposals(auth.profileId);

  const proposals = getPendingProposals(auth.profileId);
  return NextResponse.json({ proposals });
}
