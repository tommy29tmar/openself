import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentConfig } from "@/lib/db/schema";
import { type LanguageCode, isLanguageCode } from "@/lib/i18n/languages";

type PreferencesShape = {
  language: LanguageCode | null;
  /** The language in which facts were originally created. Set once on first selection. */
  factLanguage: LanguageCode | null;
};

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function getPreferences(sessionId: string = "__default__"): PreferencesShape {
  const row = db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, sessionId))
    .get();

  const config = toObject(row?.config);
  const language = isLanguageCode(config.language) ? config.language : null;
  const factLanguage = isLanguageCode(config.factLanguage) ? config.factLanguage : null;

  return { language, factLanguage };
}

export function getFactLanguage(sessionId: string = "__default__"): LanguageCode | null {
  return getPreferences(sessionId).factLanguage;
}

/**
 * Record the language in which facts are originally created.
 * Only writes once — subsequent calls are no-ops.
 */
export function setFactLanguageIfUnset(language: LanguageCode, sessionId: string = "__default__"): void {
  const current = getPreferences(sessionId);
  if (current.factLanguage) return; // already set

  const row = db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, sessionId))
    .get();

  const currentConfig = toObject(row?.config);
  const nextConfig = { ...currentConfig, factLanguage: language };

  db.insert(agentConfig)
    .values({
      id: sessionId,
      sessionId,
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

export function setPreferredLanguage(language: LanguageCode, sessionId: string = "__default__"): void {
  const row = db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, sessionId))
    .get();

  const currentConfig = toObject(row?.config);
  const nextConfig = { ...currentConfig, language };

  db.insert(agentConfig)
    .values({
      id: sessionId,
      sessionId,
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
