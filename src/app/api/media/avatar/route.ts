import { NextResponse } from "next/server";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { uploadAvatar } from "@/lib/services/media-service";
import { processAvatarImage } from "@/lib/services/image-utils";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  // Auth
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const authCtx = getAuthContext(req);
  const profileId = authCtx?.profileId ?? "main";

  // Parse FormData
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, code: "NO_FILE", error: "No file provided." },
      { status: 400 },
    );
  }

  // Size check (belt-and-suspenders; media-service also checks)
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { success: false, code: "FILE_TOO_LARGE", error: "File exceeds 2 MB limit." },
      { status: 400 },
    );
  }

  // MIME check
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { success: false, code: "INVALID_TYPE", error: `Unsupported file type: ${file.type}` },
      { status: 400 },
    );
  }

  // Read buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Magic bytes validation + EXIF stripping
  let processed: { data: Buffer; mimeType: string };
  try {
    processed = processAvatarImage(buffer, file.type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid image";
    return NextResponse.json(
      { success: false, code: "INVALID_IMAGE", error: message },
      { status: 400 },
    );
  }

  // Delete existing avatar first (partial unique index prevents insert of second avatar)
  db.delete(mediaAssets)
    .where(and(eq(mediaAssets.profileId, profileId), eq(mediaAssets.kind, "avatar")))
    .run();

  // Upload new avatar
  try {
    const id = uploadAvatar(profileId, processed.data, processed.mimeType);
    return NextResponse.json({
      success: true,
      id,
      url: `/api/media/${id}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { success: false, code: "UPLOAD_FAILED", error: message },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  // Auth
  const scope = resolveOwnerScope(req);
  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const authCtx = getAuthContext(req);
  const profileId = authCtx?.profileId ?? "main";

  // Delete avatar for this profile
  db.delete(mediaAssets)
    .where(and(eq(mediaAssets.profileId, profileId), eq(mediaAssets.kind, "avatar")))
    .run();

  return NextResponse.json({ success: true });
}
