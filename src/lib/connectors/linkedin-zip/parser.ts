import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string>;

export function parseLinkedInCsv(content: string): CsvRow[] {
  // Strip BOM
  const cleaned = content.replace(/^\uFEFF/, "");

  // Detect preamble: if first line doesn't look like a CSV header, skip until we find one
  const lines = cleaned.split("\n");
  let headerLineIdx = 0;

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    // A header line typically has multiple comma-separated values
    if (
      lines[i].includes(",") &&
      !lines[i].startsWith("Notes:") &&
      !lines[i].startsWith("#")
    ) {
      headerLineIdx = i;
      break;
    }
  }

  const csvContent = lines.slice(headerLineIdx).join("\n");

  try {
    return parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch {
    return [];
  }
}
