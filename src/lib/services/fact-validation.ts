/**
 * Fact validation module — Phase 1 Data Quality Gate.
 *
 * Validates fact values per category/key rules before persisting.
 * Rejects placeholders, empty objects, and malformed values.
 */

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class FactValidationError extends Error {
  public readonly code = "FACT_VALIDATION_FAILED" as const;
  public readonly category: string;
  public readonly key: string;

  constructor(message: string, category: string, key: string) {
    super(message);
    this.name = "FactValidationError";
    this.category = category;
    this.key = key;
  }
}

// ---------------------------------------------------------------------------
// Placeholder detection
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  /^n\/?a$/i,
  /^none$/i,
  /^null$/i,
  /^undefined$/i,
  /^unknown$/i,
  /^tbd$/i,
  /^todo$/i,
  /^placeholder$/i,
  /^example$/i,
  /^test$/i,
  /^default$/i,
  /^anonymous$/i,
  /^xxx+$/i,
  /^\?+$/,
  /^\.{2,}$/,
  /^-+$/,
  /^—$/,
];

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}

// ---------------------------------------------------------------------------
// Per-category required fields
// ---------------------------------------------------------------------------

type FieldRule = {
  /** At least one of these fields must contain a non-placeholder string. */
  requiredOneOf: string[];
  /** Fields that must be valid URLs when present (string-only). */
  urlFields?: string[];
  /** Fields that must be valid emails when present (string-only). */
  emailFields?: string[];
};

const CATEGORY_RULES: Record<string, FieldRule> = {
  identity: { requiredOneOf: ["full", "name", "value", "full_name", "city", "tagline", "text", "role", "title"] },
  experience: { requiredOneOf: ["role", "title", "company", "organization"] },
  education: { requiredOneOf: ["institution", "school", "name", "degree"] },
  project: { requiredOneOf: ["title", "name"], urlFields: ["url"] },
  skill: { requiredOneOf: ["name", "value"] },
  interest: { requiredOneOf: ["name", "value"] },
  achievement: { requiredOneOf: ["title", "name"] },
  stat: { requiredOneOf: ["label"] },
  activity: { requiredOneOf: ["name", "value"] },
  social: { requiredOneOf: ["url", "value", "username"], urlFields: ["url"] },
  reading: { requiredOneOf: ["title", "name"], urlFields: ["url"] },
  music: { requiredOneOf: ["title", "name"], urlFields: ["url"] },
  language: { requiredOneOf: ["language", "name"] },
  contact: { requiredOneOf: ["value", "email", "phone", "address"], emailFields: ["email", "value"] },
  "private-contact": { requiredOneOf: ["value", "email", "phone"], emailFields: ["email"] },
};

// ---------------------------------------------------------------------------
// URL / Email validation helpers
// ---------------------------------------------------------------------------

function isValidUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Basic check — must contain @ and a dot after it
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

/**
 * Validate a fact value before persisting.
 * Throws FactValidationError on failure.
 */
export function validateFactValue(
  category: string,
  key: string,
  value: Record<string, unknown>,
): void {
  // Rule 1: value must be a non-empty object
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FactValidationError(
      "Fact value must be a non-empty object",
      category,
      key,
    );
  }

  const entries = Object.entries(value).filter(
    ([, v]) => v !== null && v !== undefined,
  );

  if (entries.length === 0) {
    throw new FactValidationError(
      "Fact value must contain at least one non-null field",
      category,
      key,
    );
  }

  // Rule 2: per-category required fields
  const rules = CATEGORY_RULES[category];
  if (rules) {
    const hasRequiredField = rules.requiredOneOf.some((field) => {
      const v = value[field];
      if (typeof v === "string") return !isPlaceholder(v);
      if (typeof v === "number" || typeof v === "boolean") return true;
      return false;
    });

    if (!hasRequiredField) {
      throw new FactValidationError(
        `${category} fact requires at least one of: ${rules.requiredOneOf.join(", ")}`,
        category,
        key,
      );
    }

    // Rule 3: URL fields must be valid URLs when present
    if (rules.urlFields) {
      for (const field of rules.urlFields) {
        const v = value[field];
        if (v !== undefined && v !== null && typeof v === "string" && v.trim().length > 0) {
          if (!isValidUrl(v)) {
            throw new FactValidationError(
              `${category} fact field "${field}" must be a valid URL (got "${v}")`,
              category,
              key,
            );
          }
        }
      }
    }

    // Rule 4: Email fields must look like emails when present AND the contact type is email
    if (rules.emailFields && (category === "contact" || category === "private-contact")) {
      // For "contact": existing behavior — only validate when type === "email"
      // For "private-contact": always validate emailFields that are present (no type gate)
      const shouldValidateEmail = category === "private-contact" || value.type === "email";
      if (shouldValidateEmail) {
        for (const field of rules.emailFields) {
          const v = value[field];
          if (v !== undefined && v !== null && typeof v === "string" && v.trim().length > 0) {
            if (!looksLikeEmail(v)) {
              throw new FactValidationError(
                `${category} fact field "${field}" must be a valid email (got "${v}")`,
                category,
                key,
              );
            }
          }
        }
      }
    }
  }

  // Rule 5: reject date-placeholder patterns like YYYY-YYYY, YYYY-MM, YYYY in period/start/end fields
  const PERIOD_PLACEHOLDER_RE = /^[A-Z]{2,4}\s*[-–]\s*[A-Z]{2,4}$/;  // YYYY-YYYY, XX-XX, etc.
  const DATE_FIELD_PLACEHOLDER_RE = /^[A-Z]{4}(-[A-Z]{2}){0,2}$/;     // YYYY, YYYY-MM, YYYY-MM-DD

  for (const field of ["period", "start", "end"]) {
    const fv = value[field];
    if (typeof fv === "string" && fv.trim().length > 0) {
      const trimmed = fv.trim();
      if (PERIOD_PLACEHOLDER_RE.test(trimmed) || DATE_FIELD_PLACEHOLDER_RE.test(trimmed)) {
        throw new FactValidationError(
          `Fact field "${field}" contains a placeholder date ("${fv}"). Use real dates (e.g. "2018-06") or omit.`,
          category,
          key,
        );
      }
    }
  }

  // Rule 6: all string values must not be placeholders (generic fallback)
  // Only check the "primary" value fields — not metadata like type, activityType, etc.
  const PRIMARY_VALUE_FIELDS = new Set([
    "full", "name", "value", "full_name", "title", "role", "company",
    "organization", "institution", "school", "label", "language",
    "description", "text", "tagline", "start", "end",
  ]);

  for (const [fieldKey, fieldVal] of entries) {
    if (PRIMARY_VALUE_FIELDS.has(fieldKey) && typeof fieldVal === "string" && isPlaceholder(fieldVal)) {
      throw new FactValidationError(
        `Fact field "${fieldKey}" contains a placeholder value ("${fieldVal}")`,
        category,
        key,
      );
    }
  }

  // Rule 7: identity name fields must contain only a name (max 5 words / 80 chars)
  if (category === "identity") {
    const nameOnlyFields = ["full", "full_name"];
    const keySpecificFields = (key === "name" || key === "full-name") ? ["name", "value"] : [];
    for (const nameField of [...nameOnlyFields, ...keySpecificFields]) {
      const nv = value[nameField];
      if (typeof nv === "string" && nv.trim().length > 0) {
        const wordCount = nv.trim().split(/\s+/).length;
        if (wordCount > 5 || nv.length > 80) {
          throw new FactValidationError(
            `identity "${nameField}" must contain only a name (got ${wordCount} words)`,
            category,
            key,
          );
        }
      }
    }
  }
}

/**
 * Check if a fact value is valid (returns boolean, doesn't throw).
 */
export function isValidFactValue(
  category: string,
  key: string,
  value: Record<string, unknown>,
): { valid: boolean; error?: string } {
  try {
    validateFactValue(category, key, value);
    return { valid: true };
  } catch (err) {
    if (err instanceof FactValidationError) {
      return { valid: false, error: err.message };
    }
    throw err;
  }
}
