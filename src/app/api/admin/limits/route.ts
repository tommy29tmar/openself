import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { llmLimits } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTodayUsage } from "@/lib/services/usage-service";

function checkAdminAuth(req: Request): boolean {
  const secret = process.env.ADMIN_API_KEY;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** GET /api/admin/limits — read current limits + today's usage */
export async function GET(req: Request) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = db
    .select()
    .from(llmLimits)
    .where(eq(llmLimits.id, "main"))
    .get();

  const limits = {
    dailyTokenLimit: row?.dailyTokenLimit ?? 150_000,
    monthlyCostLimitUsd: row?.monthlyCostLimitUsd ?? 25.0,
    dailyCostWarningUsd: row?.dailyCostWarningUsd ?? 1.0,
    dailyCostHardLimitUsd: row?.dailyCostHardLimitUsd ?? 2.0,
    heartbeatCallLimit: row?.heartbeatCallLimit ?? 3,
    hardStop: row?.hardStop ?? true,
  };

  const usage = getTodayUsage();

  return NextResponse.json({ limits, usage });
}

/** PATCH /api/admin/limits — update limits (partial update) */
export async function PATCH(req: Request) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const allowed = new Set([
    "dailyTokenLimit",
    "monthlyCostLimitUsd",
    "dailyCostWarningUsd",
    "dailyCostHardLimitUsd",
    "heartbeatCallLimit",
    "hardStop",
  ]);

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowed.has(key)) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  // Upsert: insert default row if it doesn't exist, then update
  db.insert(llmLimits)
    .values({ id: "main" })
    .onConflictDoNothing()
    .run();

  db.update(llmLimits)
    .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(llmLimits.id, "main"))
    .run();

  // Return updated state
  const row = db
    .select()
    .from(llmLimits)
    .where(eq(llmLimits.id, "main"))
    .get();

  return NextResponse.json({ success: true, limits: row });
}
