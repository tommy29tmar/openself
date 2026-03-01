/**
 * Archetype detection — 8 archetypal user profiles with multilingual regex
 * detection, fact-based refinement, and strategy templates.
 *
 * Detection order matters: designer → academic → executive → consultant →
 * developer → creator → student → generalist (fallback).
 */
import type { FactRow } from "@/lib/services/kb-service";

export type Archetype =
  | "developer"
  | "designer"
  | "executive"
  | "student"
  | "creator"
  | "consultant"
  | "academic"
  | "generalist";

export type ArchetypeStrategy = {
  explorationOrder: string[];
  sectionPriority: string[];
  toneHint: string;
  communicationStyle: string;
};

// ── Detection signals (multilingual regex) ──────────────────────────

type SignalEntry = { archetype: Archetype; pattern: RegExp };

/**
 * Ordered detection rules. First match wins.
 * Patterns cover en, it, de, fr, es keywords.
 */
const ARCHETYPE_SIGNALS: SignalEntry[] = [
  {
    archetype: "designer",
    pattern:
      /\b(designer|design(?:er)?|UX|UI|graphic|visual|illustrat|art\s*director|creative\s*director|grafikdesign|gestalt|concepteur|diseñador|disegnator)/i,
  },
  {
    archetype: "academic",
    pattern:
      /\b(professor|profess(?:or|eur|ore)|researcher|ricercat|forscher|chercheur|investigador|lecturer|dozent|docente|PhD|postdoc|tenure)/i,
  },
  {
    archetype: "executive",
    pattern:
      /\b(CEO|CTO|CFO|COO|CMO|CIO|CISO|VP|president|(?<!art\s|creative\s|design\s)director|founder|co-?founder|managing\s*director|geschäftsführer|dirigente|directeur|director\s*general|amministratore)/i,
  },
  {
    archetype: "consultant",
    pattern:
      /\b(consultant|consult|advisor|advisory|freelance\s*consult|berater|consulente|conseil|consultor|strategist|strateg)/i,
  },
  {
    archetype: "developer",
    pattern:
      /\b(develop|engineer|programm|software|fullstack|full-stack|frontend|front-end|backend|back-end|devops|cloud|data\s*engineer|ingegnere|entwickler|développeur|desarrollador|codeur|coder|hacker)/i,
  },
  {
    archetype: "creator",
    pattern:
      /\b(creator|content\s*creator|influencer|blogger|vlogger|youtuber|streamer|podcaster|writer|author|journalist|filmmaker|photographer|fotograf|créateur|creador|artista|artist)/i,
  },
  {
    archetype: "student",
    pattern:
      /\b((?:master|bachelor|phd|doctoral|graduate|undergrad)\s*(?:degree\s*)?(?:student|stud|candidate|program|thesis))|(?:student(?:e|in|ess[ae])?)\b/i,
  },
];

// ── Category → archetype mapping for refinement ─────────────────────

const CATEGORY_TO_ARCHETYPE: Record<string, Archetype> = {
  project: "creator",
  achievement: "executive",
  education: "academic",
  skill: "developer",
  social: "creator",
};

// Categories NOT used for refinement (everyone has them)
// experience, identity, interest, activity, reading, music, language, contact, stat

// ── Detection functions ─────────────────────────────────────────────

/**
 * Detect archetype from role string and/or last user message.
 * First match in ARCHETYPE_SIGNALS wins. Falls back to "generalist".
 */
export function detectArchetypeFromSignals(
  role: string | null,
  lastUserMessage: string | null,
): Archetype {
  const text = [role, lastUserMessage].filter(Boolean).join(" ");
  if (!text) return "generalist";

  for (const { archetype, pattern } of ARCHETYPE_SIGNALS) {
    if (pattern.test(text)) return archetype;
  }

  return "generalist";
}

/**
 * Refine archetype based on accumulated facts.
 * Only runs when ≥5 facts exist. Dominant category needs ≥3 facts.
 * Returns refined archetype or the original if no refinement applies.
 */
export function refineArchetype(
  facts: Pick<FactRow, "category">[],
  currentArchetype: Archetype,
): Archetype {
  if (facts.length < 5) return currentArchetype;

  // Count facts per discriminating category
  const counts = new Map<string, number>();
  for (const f of facts) {
    if (f.category in CATEGORY_TO_ARCHETYPE) {
      counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    }
  }

  // Find dominant category (≥3 facts)
  let dominant: { category: string; count: number } | null = null;
  for (const [category, count] of counts) {
    if (count >= 3 && (!dominant || count > dominant.count)) {
      dominant = { category, count };
    }
  }

  if (dominant) {
    return CATEGORY_TO_ARCHETYPE[dominant.category];
  }

  return currentArchetype;
}

// ── Strategy templates ──────────────────────────────────────────────

export const ARCHETYPE_STRATEGIES: Record<Archetype, ArchetypeStrategy> = {
  developer: {
    explorationOrder: ["project", "skill", "experience", "education", "achievement"],
    sectionPriority: ["skills", "projects", "experience", "education"],
    toneHint: "technical, direct, concrete examples preferred",
    communicationStyle: "technical, concrete",
  },
  designer: {
    explorationOrder: ["project", "skill", "experience", "interest", "achievement"],
    sectionPriority: ["projects", "skills", "experience", "interests"],
    toneHint: "visual, evocative, portfolio-focused",
    communicationStyle: "visual, evocative",
  },
  executive: {
    explorationOrder: ["experience", "achievement", "project", "education", "stat"],
    sectionPriority: ["experience", "achievements", "stats", "projects"],
    toneHint: "strategic, concise, impact-driven metrics",
    communicationStyle: "strategic, results-oriented",
  },
  student: {
    explorationOrder: ["education", "project", "skill", "interest", "activity"],
    sectionPriority: ["education", "projects", "skills", "activities"],
    toneHint: "enthusiastic, growth-oriented, potential over pedigree",
    communicationStyle: "encouraging, growth-focused",
  },
  creator: {
    explorationOrder: ["project", "social", "skill", "interest", "achievement"],
    sectionPriority: ["projects", "social", "skills", "interests"],
    toneHint: "expressive, portfolio-first, audience-aware",
    communicationStyle: "expressive, audience-aware",
  },
  consultant: {
    explorationOrder: ["experience", "skill", "project", "achievement", "education"],
    sectionPriority: ["experience", "skills", "projects", "achievements"],
    toneHint: "authoritative, domain expertise, client-focused results",
    communicationStyle: "authoritative, solution-oriented",
  },
  academic: {
    explorationOrder: ["education", "project", "achievement", "skill", "experience"],
    sectionPriority: ["education", "projects", "achievements", "skills"],
    toneHint: "precise, nuanced, publication and research focus",
    communicationStyle: "precise, nuanced",
  },
  generalist: {
    explorationOrder: ["experience", "skill", "interest", "project", "education"],
    sectionPriority: ["experience", "skills", "interests", "projects"],
    toneHint: "balanced, adaptable, breadth over depth",
    communicationStyle: "friendly, balanced",
  },
};
