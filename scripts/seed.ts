import { runMigrations } from "../src/lib/db/migrate";
import { db } from "../src/lib/db/index";
import { page } from "../src/lib/db/schema";
import { mockPageConfig } from "../src/lib/mock/page-config";

try {
  runMigrations();

  db.insert(page)
    .values({
      id: "main",
      username: mockPageConfig.username,
      config: mockPageConfig,
    })
    .onConflictDoUpdate({
      target: page.id,
      set: {
        username: mockPageConfig.username,
        config: mockPageConfig,
        updatedAt: new Date().toISOString(),
      },
    })
    .run();

  console.log(`Seeded page for username "${mockPageConfig.username}".`);
} catch (error) {
  console.error("Seed failed:", error);
  process.exit(1);
}
