import { eq, and, asc } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { soulProfiles, soulChangeProposals } from "@/lib/db/schema";
import { randomUUID } from "crypto";

export type SoulOverlay = {
  voice?: string;
  tone?: string;
  values?: string[];
  selfDescription?: string;
  communicationStyle?: string;
  [key: string]: unknown;
};

export type SoulProfile = {
  id: string;
  ownerKey: string;
  version: number;
  overlay: SoulOverlay;
  compiled: string;
  isActive: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SoulProposal = {
  id: string;
  ownerKey: string;
  soulProfileId: string | null;
  proposedOverlay: SoulOverlay;
  reason: string | null;
  status: string;
  createdAt: string | null;
  resolvedAt: string | null;
};

/**
 * Get the active soul profile for an owner.
 */
export function getActiveSoul(ownerKey: string): SoulProfile | null {
  const row = db
    .select()
    .from(soulProfiles)
    .where(and(eq(soulProfiles.ownerKey, ownerKey), eq(soulProfiles.isActive, 1)))
    .get();
  return row ? (row as SoulProfile) : null;
}

/**
 * Compile a soul overlay into a prose string for the system prompt.
 */
function compileSoul(overlay: SoulOverlay): string {
  const parts: string[] = [];
  if (overlay.voice) parts.push(`Voice: ${overlay.voice}`);
  if (overlay.tone) parts.push(`Tone: ${overlay.tone}`);
  if (overlay.values && overlay.values.length > 0)
    parts.push(`Values: ${overlay.values.join(", ")}`);
  if (overlay.selfDescription) parts.push(`Self-description: ${overlay.selfDescription}`);
  if (overlay.communicationStyle) parts.push(`Communication style: ${overlay.communicationStyle}`);
  return parts.join("\n");
}

/**
 * Create or update the soul overlay. Creates new version (old deactivated).
 */
export function updateSoulOverlay(ownerKey: string, overlay: SoulOverlay): SoulProfile {
  return sqlite.transaction(() => {
    // Get current version
    const current = sqlite
      .prepare(
        "SELECT id, version FROM soul_profiles WHERE owner_key = ? AND is_active = 1",
      )
      .get(ownerKey) as { id: string; version: number } | undefined;

    const newVersion = (current?.version ?? 0) + 1;
    const compiled = compileSoul(overlay);
    const now = new Date().toISOString();
    const newId = randomUUID();

    // Deactivate old
    if (current) {
      sqlite
        .prepare("UPDATE soul_profiles SET is_active = 0, updated_at = ? WHERE id = ?")
        .run(now, current.id);
    }

    // Create new
    sqlite
      .prepare(
        `INSERT INTO soul_profiles(id, owner_key, version, overlay, compiled, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(newId, ownerKey, newVersion, JSON.stringify(overlay), compiled, now, now);

    return {
      id: newId,
      ownerKey,
      version: newVersion,
      overlay,
      compiled,
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    };
  })();
}

/**
 * Create a soul change proposal.
 */
export function proposeSoulChange(
  ownerKey: string,
  proposedOverlay: SoulOverlay,
  reason?: string,
): SoulProposal {
  const soul = getActiveSoul(ownerKey);
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(soulChangeProposals)
    .values({
      id,
      ownerKey,
      soulProfileId: soul?.id ?? null,
      proposedOverlay: proposedOverlay as any,
      reason: reason ?? null,
      status: "pending",
      createdAt: now,
    })
    .run();

  return {
    id,
    ownerKey,
    soulProfileId: soul?.id ?? null,
    proposedOverlay,
    reason: reason ?? null,
    status: "pending",
    createdAt: now,
    resolvedAt: null,
  };
}

/**
 * Get pending proposals for an owner.
 */
export function getPendingProposals(ownerKey: string): SoulProposal[] {
  return db
    .select()
    .from(soulChangeProposals)
    .where(
      and(
        eq(soulChangeProposals.ownerKey, ownerKey),
        eq(soulChangeProposals.status, "pending"),
      ),
    )
    .orderBy(asc(soulChangeProposals.createdAt), asc(soulChangeProposals.id))
    .all() as SoulProposal[];
}

/**
 * Review a proposal. Idempotent: only updates if status is 'pending'.
 * On accept: updates soul overlay and marks accepted.
 * On reject: marks rejected.
 */
export function reviewProposal(
  proposalId: string,
  ownerKey: string,
  accept: boolean,
): { success: boolean; error?: string } {
  const now = new Date().toISOString();
  const newStatus = accept ? "accepted" : "rejected";

  // Idempotent: only update if still pending
  const result = sqlite
    .prepare(
      "UPDATE soul_change_proposals SET status = ?, resolved_at = ? WHERE id = ? AND owner_key = ? AND status = 'pending'",
    )
    .run(newStatus, now, proposalId, ownerKey);

  if (result.changes !== 1) {
    return { success: false, error: "Proposal not found or already resolved" };
  }

  if (accept) {
    // Apply the overlay
    const proposal = db
      .select()
      .from(soulChangeProposals)
      .where(eq(soulChangeProposals.id, proposalId))
      .get();

    if (proposal) {
      const overlay = proposal.proposedOverlay as SoulOverlay;
      // Merge with existing soul
      const current = getActiveSoul(ownerKey);
      const merged = current
        ? { ...(current.overlay as SoulOverlay), ...overlay }
        : overlay;
      updateSoulOverlay(ownerKey, merged);
    }
  }

  return { success: true };
}

/**
 * Expire proposals older than TTL hours.
 */
export function expireStaleProposals(ttlHours: number = 48): number {
  const result = sqlite
    .prepare(
      `UPDATE soul_change_proposals
       SET status = 'expired', resolved_at = datetime('now')
       WHERE status = 'pending'
       AND created_at < datetime('now', '-${ttlHours} hours')`,
    )
    .run();
  return result.changes;
}
