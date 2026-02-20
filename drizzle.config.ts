import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: "./db/openself.db",
  },
});
