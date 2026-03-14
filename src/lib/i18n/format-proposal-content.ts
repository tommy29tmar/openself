/**
 * Formats raw JSON content from conformity/curation proposals into
 * human-readable text. The content stored in proposals is typically
 * `JSON.stringify(record)` where record has field names as keys.
 *
 * This utility tries to extract meaningful text and present it cleanly.
 */

/** Fields to prioritize when extracting readable text (order matters). */
const PRIMARY_FIELDS = [
  "text",
  "name",
  "title",
  "tagline",
  "suggested",
  "current",
  "intro",
  "description",
  "institution",
  "field",
  "language",
  "proficiency",
  "frequency",
];

// ---------------------------------------------------------------------------
// Issue type & severity translation helpers
// ---------------------------------------------------------------------------

const ISSUE_TYPE_MAP: Record<string, Record<string, string>> = {
  tone_drift: { en: "Tone drift", it: "Deriva di tono", de: "Tonabweichung", fr: "Dérive de ton", es: "Deriva de tono", pt: "Desvio de tom", ja: "トーンのずれ", zh: "语气偏差" },
  curation: { en: "Curation", it: "Curazione", de: "Kuratierung", fr: "Curation", es: "Curación", pt: "Curadoria", ja: "キュレーション", zh: "策展" },
  coherence: { en: "Coherence", it: "Coerenza", de: "Kohärenz", fr: "Cohérence", es: "Coherencia", pt: "Coerência", ja: "一貫性", zh: "一致性" },
  completeness_gap: { en: "Completeness gap", it: "Lacuna", de: "Lücke", fr: "Lacune", es: "Laguna", pt: "Lacuna", ja: "不足", zh: "缺失" },
  role_mismatch: { en: "Role mismatch", it: "Ruolo non corrispondente", de: "Rollenabweichung", fr: "Rôle incohérent", es: "Rol no coincidente", pt: "Papel incompatível", ja: "役割不一致", zh: "角色不匹配" },
};

const SEVERITY_MAP: Record<string, Record<string, string>> = {
  high: { en: "High", it: "Alta", de: "Hoch", fr: "Haute", es: "Alta", pt: "Alta", ja: "高", zh: "高" },
  medium: { en: "Medium", it: "Media", de: "Mittel", fr: "Moyenne", es: "Media", pt: "Média", ja: "中", zh: "中" },
  low: { en: "Low", it: "Bassa", de: "Niedrig", fr: "Faible", es: "Baja", pt: "Baixa", ja: "低", zh: "低" },
  info: { en: "Info", it: "Info", de: "Info", fr: "Info", es: "Info", pt: "Info", ja: "情報", zh: "信息" },
};

export function translateIssueType(type: string, lang: string): string {
  return ISSUE_TYPE_MAP[type]?.[lang] ?? ISSUE_TYPE_MAP[type]?.en ?? type.replace(/_/g, " ");
}

export function translateSeverity(severity: string, lang: string): string {
  return SEVERITY_MAP[severity]?.[lang] ?? severity;
}

// ---------------------------------------------------------------------------
// Canonical value translations (proficiency, temporal, frequency, etc.)
// ---------------------------------------------------------------------------

const CANONICAL_TRANSLATIONS: Record<string, Record<string, string>> = {
  native: { it: "madrelingua", de: "Muttersprache", fr: "langue maternelle", es: "nativo", pt: "nativo", ja: "母語", zh: "母语" },
  fluent: { it: "fluente", de: "fließend", fr: "courant", es: "fluido", pt: "fluente", ja: "流暢", zh: "流利" },
  intermediate: { it: "intermedio", de: "mittelstufe", fr: "intermédiaire", es: "intermedio", pt: "intermediário", ja: "中級", zh: "中级" },
  current: { it: "attuale", de: "aktuell", fr: "actuel", es: "actual", pt: "atual", ja: "現在", zh: "当前" },
  past: { it: "passato", de: "vergangen", fr: "passé", es: "pasado", pt: "passado", ja: "過去", zh: "过去" },
  daily: { it: "ogni giorno", de: "täglich", fr: "quotidien", es: "diario", pt: "diário", ja: "毎日", zh: "每天" },
  weekly: { it: "settimanale", de: "wöchentlich", fr: "hebdomadaire", es: "semanal", pt: "semanal", ja: "毎週", zh: "每周" },
};

/**
 * If a single line is exactly a canonical English term (case-insensitive),
 * replace it with the translated equivalent for the given language.
 */
function translateCanonicalValues(text: string, lang: string): string {
  if (lang === "en") return text;

  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      const translated = CANONICAL_TRANSLATIONS[lower]?.[lang];
      return translated ?? line;
    })
    .join("\n");
}

/**
 * Given a raw content string (typically JSON), return a clean human-readable
 * representation. Falls back to the raw string when parsing fails.
 *
 * @param raw  - The raw content string (often JSON-stringified)
 * @param lang - BCP-47 language code for canonical value translation (default "en")
 */
export function formatProposalContent(raw: string, lang = "en"): string {
  if (!raw) return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not valid JSON -- return as-is (already human-readable text)
    return translateCanonicalValues(raw, lang);
  }

  if (typeof parsed === "string") return translateCanonicalValues(parsed, lang);
  if (Array.isArray(parsed)) return translateCanonicalValues(formatArray(parsed), lang);
  if (parsed !== null && typeof parsed === "object") {
    return translateCanonicalValues(formatObject(parsed as Record<string, unknown>), lang);
  }

  return translateCanonicalValues(raw, lang);
}

function formatObject(obj: Record<string, unknown>): string {
  const parts: string[] = [];

  // First pass: extract primary fields in priority order
  const seen = new Set<string>();
  for (const key of PRIMARY_FIELDS) {
    if (key in obj && obj[key] != null) {
      const val = obj[key];
      if (typeof val === "string" && val.trim()) {
        parts.push(val.trim());
        seen.add(key);
      }
    }
  }

  // Handle "items" array (skills groups, experience items, etc.)
  if ("items" in obj && Array.isArray(obj.items)) {
    const itemTexts = formatArray(obj.items);
    if (itemTexts) parts.push(itemTexts);
    seen.add("items");
  }

  // Handle "groups" - may be an array or a nested JSON string
  if ("groups" in obj && obj.groups != null) {
    let groups: unknown = obj.groups;

    // Fix: if groups is a stringified JSON array, parse it
    if (typeof groups === "string") {
      try {
        groups = JSON.parse(groups);
      } catch {
        // Not parseable -- leave as string, will fall through
      }
    }

    if (Array.isArray(groups)) {
      for (const group of groups) {
        if (group && typeof group === "object") {
          const g = group as Record<string, unknown>;
          const title = typeof g.title === "string" ? g.title : "";
          const items = Array.isArray(g.items) ? g.items.filter(Boolean).join(", ") : "";
          if (title && items) {
            parts.push(`${title}: ${items}`);
          } else if (title) {
            parts.push(title);
          } else if (items) {
            parts.push(items);
          }
        }
      }
      seen.add("groups");
    } else if (typeof groups === "string" && groups.trim()) {
      // Could not parse and it's a non-empty string -- include as-is
      parts.push(groups.trim());
      seen.add("groups");
    }
  }

  // Second pass: pick up any remaining string fields (e.g., items_0_description)
  for (const [key, val] of Object.entries(obj)) {
    if (seen.has(key)) continue;
    if (typeof val === "string" && val.trim()) {
      // Skip internal/hash fields
      if (key.startsWith("_") || key.endsWith("Hash") || key === "id" || key === "ownerKey") continue;
      parts.push(val.trim());
      seen.add(key);
    }
  }

  if (parts.length === 0) {
    // Fallback: stringify compactly without braces
    return Object.entries(obj)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
  }

  // Join with line breaks for multi-field content, or just return single field
  return parts.join("\n");
}

function formatArray(arr: unknown[]): string {
  return arr
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return formatObject(item as Record<string, unknown>);
      }
      return String(item);
    })
    .filter(Boolean)
    .join("\n");
}
