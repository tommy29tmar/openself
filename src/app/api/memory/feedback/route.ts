import { NextResponse } from "next/server";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";
import { feedbackMemory, type MemoryFeedback } from "@/lib/services/memory-service";

/**
 * POST /api/memory/feedback
 * Body: { memoryId: string, feedback: "helpful" | "wrong" }
 */
export async function POST(req: Request) {
  const scope = resolveOwnerScope(req);

  if (isMultiUserEnabled() && !scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const ownerKey = scope?.cognitiveOwnerKey ?? "__default__";

  try {
    const body = await req.json();
    const { memoryId, feedback } = body;

    if (!memoryId || typeof memoryId !== "string") {
      return NextResponse.json(
        { success: false, error: "memoryId is required" },
        { status: 400 },
      );
    }

    if (feedback !== "helpful" && feedback !== "wrong") {
      return NextResponse.json(
        { success: false, error: 'feedback must be "helpful" or "wrong"' },
        { status: 400 },
      );
    }

    const updated = feedbackMemory(memoryId, ownerKey, feedback as MemoryFeedback);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Memory not found or already inactive" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }
}
