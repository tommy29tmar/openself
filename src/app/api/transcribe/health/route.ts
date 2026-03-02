import { NextResponse } from "next/server";

const STT_SERVICE_URL = process.env.STT_SERVICE_URL || "http://stt:8080";

export async function GET() {
  if (process.env.VOICE_STT_SERVER_FALLBACK_ENABLED !== "true") {
    return NextResponse.json({ available: false }, { status: 503 });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${STT_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return NextResponse.json({ available: true });
    }
    return NextResponse.json({ available: false }, { status: 503 });
  } catch {
    return NextResponse.json({ available: false }, { status: 503 });
  }
}
