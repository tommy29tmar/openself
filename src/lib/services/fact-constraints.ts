export class FactConstraintError extends Error {
  code: "EXISTING_CURRENT" | "CASCADE_WARNING";
  existingFactId?: string;
  suggestion: string;

  constructor(opts: { code: FactConstraintError["code"]; existingFactId?: string; suggestion: string }) {
    super(`Fact constraint: ${opts.code} — ${opts.suggestion}`);
    this.name = "FactConstraintError";
    this.code = opts.code;
    this.existingFactId = opts.existingFactId;
    this.suggestion = opts.suggestion;
  }
}

// Previously contained "experience", but people legitimately hold multiple
// current roles (freelance + contributor, full-time + consulting, etc.).
// Kept as mechanism for future categories if needed.
export const CURRENT_UNIQUE_CATEGORIES = new Set<string>();
