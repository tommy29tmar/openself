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

/** Serialize DB row to public API shape (excludes deprecated columns). */
function serializeLimits(row: typeof llmLimits.$inferSelect | undefined) {
  return {
    dailyTokenLimit: row?.dailyTokenLimit ?? 500_000,
    dailyCostWarningUsd: row?.dailyCostWarningUsd ?? 1.0,
    dailyCostHardLimitUsd: row?.dailyCostHardLimitUsd ?? 2.0,
    hardStop: row?.hardStop ?? true,
  };
}

const PATCHABLE_FIELDS = new Set([
  "dailyTokenLimit",
  "dailyCostWarningUsd",
  "dailyCostHardLimitUsd",
  "hardStop",
]);

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

  const limits = serializeLimits(row);
  const usage = getTodayUsage();

  return NextResponse.json({ limits, usage });
}

/** PATCH /api/admin/limits — update limits (partial update) */
export async function PATCH(req: Request) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(key)) continue;
    if (key === "hardStop" && typeof value !== "boolean") continue;
    if (key === "dailyTokenLimit" && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) continue;
    if (key.includes("Cost") && (typeof value !== "number" || value < 0)) continue;
    updates[key] = value;
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

  // Return updated state through serializer — never leak deprecated columns
  const row = db
    .select()
    .from(llmLimits)
    .where(eq(llmLimits.id, "main"))
    .get();

  return NextResponse.json({ success: true, limits: serializeLimits(row) });
}
