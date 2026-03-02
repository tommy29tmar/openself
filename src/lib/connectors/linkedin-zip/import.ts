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
  mapCourses,
  mapCompanyFollows,
  mapCauses,
  type FactInput,
} from "./mapper";
import { batchCreateFacts } from "../connector-fact-writer";
import type { OwnerScope } from "@/lib/auth/session";
import type { ImportReport } from "../types";

type MapperFn = (rows: CsvRow[]) => FactInput[];

const FILE_MAPPERS: Record<string, MapperFn> = {
  "Profile.csv": mapProfile,
  "Profile Summary.csv": mapProfileSummary,
  "Positions.csv": mapPositions,
  "Education.csv": mapEducation,
  "Skills.csv": mapSkills,
  "Languages.csv": mapLanguages,
  "Certifications.csv": mapCertifications,
  "Courses.csv": mapCourses,
  "Company Follows.csv": mapCompanyFollows,
  "Causes You Care About.csv": mapCauses,
};

// All lowercase so comparison with filename.toLowerCase() works correctly
const EXCLUDE_FILES = new Set([
  "messages.csv",
  "guide_messages.csv",
  "learning_role_play_messages.csv",
  "ad_targeting.csv",
  "receipts_v2.csv",
  "registration.csv",
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
    };
  }

  // Wrap in try/finally to ensure ZIP reader is closed
  try {
    for await (const entry of zipReader) {
      // Get just the filename (LinkedIn ZIPs often have directory prefixes)
      const filename = entry.filename.split("/").pop() ?? entry.filename;

      if (EXCLUDE_FILES.has(filename.toLowerCase())) continue;

      const mapper = FILE_MAPPERS[filename];
      if (!mapper) continue;

      const stream = await entry.openReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const content = Buffer.concat(chunks).toString("utf-8");

      const rows = parseLinkedInCsv(content);
      const facts = mapper(rows);
      allFacts.push(...facts);
    }
  } finally {
    await zipReader.close();
  }

  if (allFacts.length === 0) {
    return { factsWritten: 0, factsSkipped: 0, errors: [] };
  }

  return batchCreateFacts(allFacts, scope, username, factLanguage);
}
