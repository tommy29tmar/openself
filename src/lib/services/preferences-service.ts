import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentConfig } from "@/lib/db/schema";
import { type LanguageCode, isLanguageCode } from "@/lib/i18n/languages";

type PreferencesShape = {
  language: LanguageCode | null;
};

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function getPreferences(): PreferencesShape {
  const row = db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "main"))
    .get();

  const config = toObject(row?.config);
  const language = isLanguageCode(config.language) ? config.language : null;

  return { language };
}

export function setPreferredLanguage(language: LanguageCode): void {
  const row = db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "main"))
    .get();

  const currentConfig = toObject(row?.config);
  const nextConfig = { ...currentConfig, language };

  db.insert(agentConfig)
    .values({
      id: "main",
      config: nextConfig,
    })
    .onConflictDoUpdate({
      target: agentConfig.id,
      set: {
        config: nextConfig,
        updatedAt: new Date().toISOString(),
      },
    })
    .run();
}
