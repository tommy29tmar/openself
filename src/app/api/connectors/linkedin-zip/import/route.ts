import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import { importLinkedInZip } from "@/lib/connectors/linkedin-zip/import";
import { getFactLanguage } from "@/lib/services/preferences-service";

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST(req: NextRequest) {
  const scope = resolveOwnerScope(req);
  if (!scope) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Authentication required." },
      { status: 403 },
    );
  }

  const authCtx = getAuthContext(req);
  const username = authCtx?.username ?? "__default__";

  const contentLength = parseInt(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_SIZE) {
    return NextResponse.json(
      { success: false, code: "FILE_TOO_LARGE", error: "File too large (max 100 MB)." },
      { status: 413 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, code: "NO_FILE", error: "No file uploaded." },
        { status: 400 },
      );
    }

    if (!file.name.endsWith(".zip") && file.type !== "application/zip") {
      return NextResponse.json(
        { success: false, code: "INVALID_FORMAT", error: "File must be a ZIP archive." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { success: false, code: "FILE_TOO_LARGE", error: "File too large (max 100 MB)." },
        { status: 413 },
      );
    }

    const factLanguage = getFactLanguage(scope.knowledgePrimaryKey) ?? "en";
    const report = await importLinkedInZip(buffer, scope, username, factLanguage);

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("[linkedin-zip-import] Error:", error);
    return NextResponse.json(
      { success: false, code: "IMPORT_FAILED", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
