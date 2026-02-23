import { runMigrations } from "../src/lib/db/migrate";
import { db } from "../src/lib/db/index";
import { page } from "../src/lib/db/schema";
import { mockPageConfig } from "../src/lib/mock/page-config";

try {
  runMigrations();

  const username = mockPageConfig.username;

  // Insert published row (id=username, status="published")
  db.insert(page)
    .values({
      id: username,
      username,
      config: mockPageConfig,
      status: "published",
    })
    .onConflictDoUpdate({
      target: page.id,
      set: {
        username,
        config: mockPageConfig,
        status: "published",
        updatedAt: new Date().toISOString(),
      },
    })
    .run();

  // Insert draft row (id="draft", status="draft")
  db.insert(page)
    .values({
      id: "draft",
      username,
      config: mockPageConfig,
      status: "draft",
    })
    .onConflictDoUpdate({
      target: page.id,
      set: {
        username,
        config: mockPageConfig,
        status: "draft",
        updatedAt: new Date().toISOString(),
      },
    })
    .run();

  console.log(`Seeded page for username "${username}" (published + draft rows).`);
} catch (error) {
  console.error("Seed failed:", error);
  process.exit(1);
}
