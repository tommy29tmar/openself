export function stringifyToolArgsForRepair(args: unknown): string {
  if (typeof args === "string") return args;
  if (args === undefined) return "";

  try {
    const json = JSON.stringify(args);
    if (typeof json === "string") return json;
  } catch {
    // Fall through to string coercion.
  }

  try {
    return String(args ?? "");
  } catch {
    return "";
  }
}

export function stripMarkdownCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
}

/**
 * Attempt to repair common JSON malformations from LLM output.
 * Handles: unquoted keys, unquoted string values.
 * Returns repaired JSON string, or original if repair fails.
 */
export function repairJsonValue(raw: string): string {
  // If already valid JSON, return as-is
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    // Continue to repair
  }

  try {
    // Fix 1: Add quotes around unquoted keys  ({role: "x"} → {"role": "x"})
    let fixed = raw.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

    // Fix 2: Handle partially-quoted keys: company": "val" → "company": "val"
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_]\w*)"(\s*:)/g, '$1"$2"$3');

    // Fix 3: Add quotes around unquoted string values
    // Strategy: match values that start with a letter (not digit, quote, brace, bracket, or minus)
    // and exclude JSON keywords (true, false, null) via negative lookahead.
    // Using [a-zA-Z] as first char avoids the \s* backtracking bug where
    // space characters could pass through a negative-lookahead charset.
    fixed = fixed.replace(
      /:\s*(?!true\b|false\b|null\b)([a-zA-Z][^,}\]"]*?)(?=[,}\]])/g,
      (_, val) => `:"${val.trim()}"`,
    );

    // Validate the repaired JSON
    JSON.parse(fixed);
    return fixed;
  } catch {
    return raw;
  }
}
