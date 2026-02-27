import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import {
  getPendingProposals,
  acceptProposal,
} from "@/lib/services/proposal-service";
import { getAuthContext } from "@/lib/auth/session";

/**
 * POST /api/proposals/accept-all
 *
 * Accept all pending proposals for the authenticated owner in a single transaction.
 * Returns counts of accepted, stale, and errors.
 */
export async function POST(req: Request) {
  const auth = getAuthContext(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = getPendingProposals(auth.profileId);
  let accepted = 0;
  let stale = 0;
  const errors: string[] = [];

  sqlite.exec("BEGIN");
  try {
    for (const proposal of pending) {
      const result = acceptProposal(proposal.id);
      if (result.ok) {
        accepted++;
      } else if (
        result.error === "STALE_PROPOSAL" ||
        result.error === "STATE_CHANGED"
      ) {
        stale++;
      } else {
        errors.push(`${proposal.sectionType}: ${result.error}`);
      }
    }
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ accepted, stale, errors });
}
