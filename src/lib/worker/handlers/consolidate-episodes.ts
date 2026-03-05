// src/lib/worker/handlers/consolidate-episodes.ts
import { consolidateEpisodesForOwner } from "@/lib/services/episodic-consolidation-service";
import { archiveOldEvents } from "@/lib/services/episodic-service";

const ARCHIVE_DAYS = 180;

export async function consolidateEpisodesHandler(payload: Record<string, unknown>): Promise<void> {
  const ownerKey = payload.ownerKey as string;
  if (!ownerKey) throw new Error("consolidate_episodes: missing ownerKey");
  const proposalsCreated = await consolidateEpisodesForOwner(ownerKey);
  const cutoffUnix = Math.floor(Date.now() / 1000) - ARCHIVE_DAYS * 86400;
  const archived = archiveOldEvents(ownerKey, cutoffUnix);
  console.log(`[consolidate-episodes] owner=${ownerKey} proposals=${proposalsCreated} archived=${archived}`);
}
