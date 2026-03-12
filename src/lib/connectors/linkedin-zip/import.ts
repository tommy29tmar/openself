import { fromBuffer } from "yauzl-promise";
import { parseLinkedInCsv, type CsvRow } from "./parser";
import {
  mapProfile,
  mapProfileSummary,
  mapPositions,
  mapEducation,
  mapSkills,
  mapLanguages,
  mapCertifications,
  type FactInput,
} from "./mapper";
import { batchCreateFacts } from "../connector-fact-writer";
import { insertEvent } from "@/lib/services/episodic-service";
import {
  mapCertificationsToEpisodic,
  mapArticlesToEpisodic,
  type EpisodicInput,
} from "./activity-mapper";
import type { OwnerScope } from "@/lib/auth/session";
import type { ImportReport } from "../types";

type MapperFn = (rows: CsvRow[]) => FactInput[];

/** Standard mappers (no cross-file dependencies) */
const FILE_MAPPERS: Record<string, MapperFn> = {
  "Profile.csv": mapProfile,
  "Profile Summary.csv": mapProfileSummary,
  "Positions.csv": mapPositions,
  "Education.csv": mapEducation,
  "Languages.csv": mapLanguages,
  "Certifications.csv": mapCertifications,
};

/**
 * Files that need special handling (cross-file dependencies).
 * Skills.csv needs language names from Languages.csv to filter duplicates.
 * All lowercase so comparison with filename.toLowerCase() works correctly.
 */
const DEFERRED_FILES = new Set(["skills.csv"]);

/**
 * Activity-only files: extracted for episodic events (T4) but NOT for facts.
 * Certifications.csv is already in FILE_MAPPERS (produces facts AND events).
 * All lowercase so comparison with filename.toLowerCase() works correctly.
 */
const ACTIVITY_FILES = new Set(["articles.csv"]);

/** Activity mappers: filename → episodic event mapper */
const ACTIVITY_MAPPERS: Record<string, (rows: Record<string, string>[]) => EpisodicInput[]> = {
  "Certifications.csv": mapCertificationsToEpisodic,
  "Articles.csv": mapArticlesToEpisodic,
};

// All lowercase so comparison with filename.toLowerCase() works correctly
const EXCLUDE_FILES = new Set([
  "messages.csv",
  "guide_messages.csv",
  "learning_role_play_messages.csv",
  "ad_targeting.csv",
  "receipts_v2.csv",
  "registration.csv",
  "courses.csv",
  "company follows.csv",
  "causes you care about.csv",
]);

export async function importLinkedInZip(
  buffer: Buffer,
  scope: OwnerScope,
  username: string,
  factLanguage: string,
): Promise<ImportReport> {
  const allFacts: FactInput[] = [];

  // Catch corrupt ZIP errors gracefully
  let zipReader;
  try {
    zipReader = await fromBuffer(buffer);
  } catch (error) {
    return {
      factsWritten: 0,
      factsSkipped: 0,
      errors: [
        {
          reason: `Invalid ZIP: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      createdFacts: [],
    };
  }

  // Two-pass approach: first extract all CSV content, then process with cross-file deps
  const csvContents = new Map<string, string>();

  // Wrap in try/finally to ensure ZIP reader is closed
  try {
    for await (const entry of zipReader) {
      const filename = entry.filename.split("/").pop() ?? entry.filename;
      if (EXCLUDE_FILES.has(filename.toLowerCase())) continue;
      if (
        !FILE_MAPPERS[filename] &&
        !DEFERRED_FILES.has(filename.toLowerCase()) &&
        !ACTIVITY_FILES.has(filename.toLowerCase())
      ) continue;

      const stream = await entry.openReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      csvContents.set(filename, Buffer.concat(chunks).toString("utf-8"));
    }
  } finally {
    await zipReader.close();
  }

  // Pass 1: process standard mappers (including Languages.csv)
  for (const [filename, content] of csvContents) {
    const mapper = FILE_MAPPERS[filename];
    if (!mapper) continue;
    const rows = parseLinkedInCsv(content);
    allFacts.push(...mapper(rows));
  }

  // Pass 2: process Skills.csv with language names for dedup
  const skillsEntry = [...csvContents.entries()].find(
    ([k]) => k.toLowerCase() === "skills.csv",
  );
  if (skillsEntry) {
    const skillsCsv = skillsEntry[1];
    const languageNames = new Set(
      allFacts
        .filter((f) => f.category === "language")
        .map((f) => String(f.value.language).toLowerCase()),
    );
    const rows = parseLinkedInCsv(skillsCsv);
    allFacts.push(...mapSkills(rows, languageNames));
  }

  // --- Activity Stream: notable events → Episodic (T4) ---
  try {
    let eventsWritten = 0;
    for (const [filename, mapFn] of Object.entries(ACTIVITY_MAPPERS)) {
      const csvContent = csvContents.get(filename);
      if (!csvContent) continue;
      try {
        const rows = parseLinkedInCsv(csvContent);
        const events = mapFn(rows);
        for (const input of events) {
          try {
            insertEvent({
              ownerKey: scope.cognitiveOwnerKey,
              sessionId: "connector:linkedin_zip",
              eventAtUnix: input.eventAtUnix,
              eventAtHuman: input.eventAtHuman,
              actionType: input.actionType,
              narrativeSummary: input.narrativeSummary,
              source: "linkedin_zip",
              externalId: input.externalId,
            });
            eventsWritten++;
          } catch (err) {
            // Silently skip duplicate events (UNIQUE constraint on externalId)
            if (!(err instanceof Error && err.message.includes("UNIQUE"))) {
              console.warn("[linkedin] event write failed:", err);
            }
          }
        }
      } catch (err) {
        console.warn(`[linkedin] activity parse failed for ${filename}:`, err);
      }
    }
    if (eventsWritten > 0) {
      console.info(`[linkedin] activity: ${eventsWritten} events written`);
    }
  } catch (err) {
    console.warn("[linkedin] activity mapper failed (non-fatal):", err);
  }

  if (allFacts.length === 0) {
    return { factsWritten: 0, factsSkipped: 0, errors: [], createdFacts: [] };
  }

  const report = await batchCreateFacts(allFacts, scope, username, factLanguage);

  if (report.factsWritten > 0) {
    const positionCount = allFacts.filter((f) => f.category === "experience").length;
    const skillCount = allFacts.filter((f) => f.category === "skill").length;
    const certCount = allFacts.filter((f) => f.category === "achievement").length;

    insertEvent({
      ownerKey: scope.cognitiveOwnerKey,
      sessionId: scope.knowledgePrimaryKey,
      eventAtUnix: Math.floor(Date.now() / 1000),
      eventAtHuman: new Date().toISOString(),
      actionType: "milestone",
      narrativeSummary: `Imported LinkedIn profile: ${positionCount} positions, ${skillCount} skills, ${certCount} certifications`,
      entities: [],
      source: "linkedin_zip",
    });
  }

  return report;
}
