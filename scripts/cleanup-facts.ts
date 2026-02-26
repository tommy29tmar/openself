#!/usr/bin/env npx tsx
/**
 * Legacy fact cleanup script.
 *
 * Validates all facts against `validateFactValue()` and reports/removes invalid entries.
 *
 * Modes:
 *   --dry-run   (default) Show invalid facts, no DB writes
 *   --export    Write report to cleanup-facts-report.json
 *   --apply     Delete invalid facts from the DB
 *
 * Uses the same validation rules as `createFact`/`updateFact` gates.
 */

import { db } from "../src/lib/db/index";
import { facts as factsTable } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateFactValue, FactValidationError } from "../src/lib/services/fact-validation";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const mode = args.includes("--apply")
  ? "apply"
  : args.includes("--export")
    ? "export"
    : "dry-run";

console.log(`[cleanup-facts] Mode: ${mode}\n`);

type InvalidEntry = {
  factId: string;
  sessionId: string;
  category: string;
  key: string;
  value: unknown;
  error: string;
};

const invalid: InvalidEntry[] = [];
let validCount = 0;

// Get all facts
const allFacts = db.select().from(factsTable).all();
console.log(`Found ${allFacts.length} total fact(s)\n`);

for (const fact of allFacts) {
  try {
    validateFactValue(fact.category, fact.key, fact.value as Record<string, unknown>);
    validCount++;
  } catch (err) {
    if (err instanceof FactValidationError) {
      invalid.push({
        factId: fact.id,
        sessionId: fact.sessionId,
        category: fact.category,
        key: fact.key,
        value: fact.value,
        error: err.message,
      });
    }
  }
}

console.log(`Valid: ${validCount}`);
console.log(`Invalid: ${invalid.length}\n`);

if (invalid.length > 0) {
  // Group by error type for summary
  const errorCounts = new Map<string, number>();
  for (const entry of invalid) {
    const count = errorCounts.get(entry.error) ?? 0;
    errorCounts.set(entry.error, count + 1);
  }

  console.log("--- Invalid fact summary ---");
  for (const [error, count] of errorCounts.entries()) {
    console.log(`  ${count}x  ${error}`);
  }
  console.log("");

  // Show first 10 invalid facts
  const preview = invalid.slice(0, 10);
  for (const entry of preview) {
    console.log(`  [${entry.factId}] ${entry.category}/${entry.key}: ${entry.error}`);
    console.log(`    value: ${JSON.stringify(entry.value)}`);
  }
  if (invalid.length > 10) {
    console.log(`  ... and ${invalid.length - 10} more`);
  }
}

if (mode === "apply" && invalid.length > 0) {
  console.log(`\nDeleting ${invalid.length} invalid fact(s)...`);
  let deleted = 0;
  for (const entry of invalid) {
    db.delete(factsTable).where(eq(factsTable.id, entry.factId)).run();
    deleted++;
  }
  console.log(`Deleted ${deleted} fact(s).`);
}

if (mode === "export") {
  const reportPath = "cleanup-facts-report.json";
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        total: allFacts.length,
        valid: validCount,
        invalid: invalid.length,
        entries: invalid,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport written to ${reportPath}`);
}

if (mode === "dry-run" && invalid.length > 0) {
  console.log(`\nRun with --apply to delete invalid facts, or --export to save a report.`);
}
