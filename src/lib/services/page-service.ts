import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { page } from "@/lib/db/schema";
import {
  type PageConfig,
  validatePageConfig,
} from "@/lib/page-config/schema";

export function getPageByUsername(username: string): PageConfig | null {
  const row = db
    .select()
    .from(page)
    .where(eq(page.username, username))
    .get();

  if (!row) return null;

  return row.config as PageConfig;
}

export function upsertPage(username: string, config: PageConfig): void {
  const result = validatePageConfig(config);
  if (!result.ok) {
    throw new Error(`Invalid PageConfig: ${result.errors.join("; ")}`);
  }

  db.insert(page)
    .values({
      id: "main",
      username,
      config,
    })
    .onConflictDoUpdate({
      target: page.id,
      set: {
        username,
        config,
        updatedAt: new Date().toISOString(),
      },
    })
    .run();
}
