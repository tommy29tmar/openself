import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function uploadAvatar(
  profileId: string,
  data: Buffer,
  mimeType: string,
): string {
  if (data.length > MAX_AVATAR_BYTES) {
    throw new Error(`Avatar exceeds 2 MB limit (${data.length} bytes)`);
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const id = crypto.randomUUID();

  db.insert(mediaAssets)
    .values({
      id,
      profileId,
      kind: "avatar",
      storageBackend: "sqlite",
      blobData: data,
      mimeType,
      bytes: data.length,
      sha256,
      visibility: "public",
    })
    .onConflictDoUpdate({
      target: mediaAssets.id,
      set: {
        blobData: data,
        mimeType,
        bytes: data.length,
        sha256,
      },
    })
    .run();

  return id;
}

/**
 * Get the avatar media ID for a profile, or null if none exists.
 */
export function getProfileAvatar(profileId: string): string | null {
  const row = db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.profileId, profileId),
        eq(mediaAssets.kind, "avatar"),
      ),
    )
    .get();
  return row?.id ?? null;
}

export function getMediaById(
  id: string,
): { data: Buffer; mimeType: string } | null {
  const row = db
    .select({
      blobData: mediaAssets.blobData,
      mimeType: mediaAssets.mimeType,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .get();

  if (!row || !row.blobData) return null;

  return {
    data: Buffer.from(row.blobData as ArrayBuffer),
    mimeType: row.mimeType,
  };
}
