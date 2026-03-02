import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { importLinkedInZip } from "@/lib/connectors/linkedin-zip/import";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { acquireImportLock, releaseImportLock } from "@/lib/connectors/idempotency";
import { connectorError } from "@/lib/connectors/api-errors";
import { writeImportEvent } from "@/lib/connectors/import-event";

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    return connectorError("AUTH_REQUIRED", "Authentication required.", 403, false);
  }

  const authCtx = getAuthContext(req);
  const username = authCtx?.username ?? "__default__";
  const ownerKey = scope.cognitiveOwnerKey;

  const contentLength = parseInt(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_SIZE) {
    return connectorError("FILE_TOO_LARGE", "File too large (max 100 MB).", 413, false);
  }

  // Acquire import lock — reject if another import is already running
  if (!acquireImportLock(ownerKey)) {
    return connectorError("ALREADY_IMPORTING", "An import is already in progress.", 409, true);
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return connectorError("NO_FILE", "No file uploaded.", 400, false);
    }

    if (!file.name.endsWith(".zip") && file.type !== "application/zip") {
      return connectorError("INVALID_FORMAT", "File must be a ZIP archive.", 400, false);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      return connectorError("FILE_TOO_LARGE", "File too large (max 100 MB).", 413, false);
    }

    const factLanguage = getFactLanguage(scope.knowledgePrimaryKey) ?? "en";
    const report = await importLinkedInZip(buffer, scope, username, factLanguage);

    // Write pending import event flag for agent reaction
    if (report.factsWritten > 0) {
      writeImportEvent(scope.knowledgePrimaryKey, report.factsWritten);
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("[linkedin-zip-import] Error:", error);
    return connectorError("IMPORT_FAILED", error instanceof Error ? error.message : String(error), 500, true);
  } finally {
    releaseImportLock(ownerKey);
  }
}
