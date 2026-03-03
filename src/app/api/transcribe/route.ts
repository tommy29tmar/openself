import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, MAX_CONTENT_LENGTH } from "@/lib/middleware/transcribe-rate-limit";

const STT_SERVICE_URL = process.env.STT_SERVICE_URL || "http://stt:8080";

export async function POST(req: NextRequest) {
  if (process.env.VOICE_STT_SERVER_FALLBACK_ENABLED !== "true") {
    return NextResponse.json({ error: "Voice STT not enabled" }, { status: 503 });
  }

  // Session check — same pattern as /api/chat route
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit — prefer req.ip (set by Next.js from trusted proxy), fall back to header
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Content-Length pre-check (untrusted, but fast rejection for obviously large payloads)
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Audio too large (max 5MB)" }, { status: 413 });
  }

  // Content-Type check
  const contentType = req.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  try {
    // Parse FormData — this buffers the full body in memory (Next.js route handlers
    // don't support streaming FormData parsing). Acceptable for ≤5MB audio clips.
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }
    if (file.size > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: `Audio too large (${file.size} bytes, max ${MAX_CONTENT_LENGTH})` }, { status: 413 });
    }

    // Re-build FormData for upstream
    const upstreamForm = new FormData();
    upstreamForm.append("file", file, "audio.webm");
    const language = formData.get("language");
    if (typeof language === "string" && language.trim()) {
      upstreamForm.append("language", language.trim());
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000); // 30s timeout

    const res = await fetch(`${STT_SERVICE_URL}/transcribe`, {
      method: "POST",
      body: upstreamForm,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text, language: data.language });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ error: "Transcription timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "Voice unavailable" }, { status: 503 });
  }
}
