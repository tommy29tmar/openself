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
