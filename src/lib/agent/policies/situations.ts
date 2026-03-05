/**
 * Situation-specific directive generators.
 *
 * Each function returns a self-contained paragraph that can be injected into the
 * system prompt to give the agent awareness of a specific real-time situation.
 *
 * These are composed by getSituationDirectives() in the registry.
 */

/**
 * Directive: pending proposals from the heartbeat that need user review.
 */
export function pendingProposalsDirective(count: number, sections: string[]): string {
  if (count <= 0) return "";
  const sectionList = sections.length > 0 ? ` in sections: ${sections.join(", ")}` : "";
  return `PENDING PROPOSALS: You have ${count} content proposal${count !== 1 ? "s" : ""} waiting for user review${sectionList}.
When appropriate, mention to the user that there are suggestions ready for review.
Do not push — just mention it naturally if the conversation allows.
The user can review proposals via the proposal banner in the builder.`;
}

/**
 * Directive: sections that are thin or empty and need more facts.
 */
export function thinSectionsDirective(sections: string[]): string {
  if (sections.length === 0) return "";
  const sectionList = sections.join(", ");
  return `THIN SECTIONS: The following page sections need more content: ${sectionList}.
When the conversation naturally allows, guide the user toward topics that would fill these sections.
Pick the 1-2 most relevant thin sections based on conversation context — don't list all of them at once.
Frame questions naturally, not as "I need data for your skills section."`;
}

/**
 * Directive: facts that haven't been updated in 30+ days.
 */
export function staleFactsDirective(facts: string[]): string {
  if (facts.length === 0) return "";
  const topStale = facts.slice(0, 5); // Limit to 5 to avoid prompt bloat
  const factList = topStale.join(", ");
  const moreNote = facts.length > 5 ? ` (and ${facts.length - 5} more)` : "";
  return `STALE FACTS: These facts haven't been updated in over 30 days: ${factList}${moreNote}.
When natural, ask the user if any of these are still accurate.
Prioritize facts that seem most likely to have changed (job roles, projects, current activities).
Use update_fact if the user confirms a change, delete_fact if something is no longer relevant.`;
}

/**
 * Directive: open fact conflicts needing resolution.
 */
export function openConflictsDirective(conflicts: string[]): string {
  if (conflicts.length === 0) return "";
  const conflictList = conflicts.join("; ");
  return `OPEN CONFLICTS: There are conflicting facts that need resolution: ${conflictList}.
Ask the user to clarify which version is correct.
Use resolve_conflict once the user makes a choice.
Do not present conflicts as errors — frame them as "I noticed two different pieces of info about X, which one is current?"`;
}

/**
 * Directive: facts with low relevance scores that could be archived.
 */
export function archivableFactsDirective(facts: string[]): string {
  if (facts.length === 0) return "";
  const topArchivable = facts.slice(0, 5); // Limit to 5 to avoid prompt bloat
  const factList = topArchivable.join(", ");
  const moreNote = facts.length > 5 ? ` (and ${facts.length - 5} more)` : "";
  return `ARCHIVABLE FACTS: These facts have low relevance (old, low confidence, or no children): ${factList}${moreNote}.
When natural, ask the user if any of these are still relevant.
Use archive_fact for facts the user confirms are outdated — this soft-deletes them (recoverable via unarchive_fact).
Do not archive facts the user hasn't confirmed — always ask first.`;
}

/**
 * Directive: coherence issues detected during last page generation.
 * Merges both warning and info severity issues into a single block.
 */
export function coherenceIssuesDirective(issues: Array<{ type: string; severity: string; description: string; suggestion: string }>): string {
  if (issues.length === 0) return "";
  const lines = issues.map(i => `- ${i.severity}: [${i.type}] ${i.description}\n  → ${i.suggestion}`);
  return `COHERENCE ISSUES (from last page generation):\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Post-import reaction
// ---------------------------------------------------------------------------

import type { ImportGapReport } from "@/lib/connectors/import-gap-analyzer";

/** Sanitize text: strip control chars, cap length (G5). */
function sanitize(text: string, maxLen = 100): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x1f\x7f]/g, "").slice(0, maxLen);
}

/**
 * Sanitize user/model-derived text to a safe string:
 * 1. Collapse CR, LF, TAB → space
 * 2. Strip remaining non-printable control chars (U+0000–U+001F and U+007F)
 * 3. Cap at maxLen
 * Applied only to overlay keys, overlay values, and reason. NOT to template text.
 */
function sanitizeForPrompt(value: string, maxLen = 100): string {
  return value
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, maxLen);
}

const MAX_OVERLAY_KEYS = 5;

export function pendingSoulProposalsDirective(
  proposals: Array<{ id: string; overlay: Record<string, unknown>; reason: string }>,
): string {
  if (proposals.length === 0) return "";
  const first = proposals[0];
  const safeOverlay =
    first.overlay && typeof first.overlay === "object" && !Array.isArray(first.overlay)
      ? first.overlay
      : {};
  const allEntries = Object.entries(safeOverlay);
  const renderedEntries = allEntries.slice(0, MAX_OVERLAY_KEYS);
  const omitted = allEntries.length - renderedEntries.length;
  const overlayLines = renderedEntries
    .map(([k, v]) => {
      const safeKey = sanitizeForPrompt(String(k), 30);
      const rawVal = Array.isArray(v) ? (v as unknown[]).map(String).join(", ") : String(v ?? "");
      const safeVal = sanitizeForPrompt(rawVal, 120);
      return `  ${safeKey}: ${safeVal}`;
    })
    .join("\n");
  const omittedNote = omitted > 0 ? `\n  (${omitted} more omitted)` : "";
  const safeReason = sanitizeForPrompt(first.reason ?? "", 200);
  return `PENDING SOUL PROPOSAL (id: ${first.id}):
I previously noticed patterns in how you express yourself and proposed an update to your style profile:
${overlayLines || "  (no details available)"}${omittedNote}
${safeReason ? `Reason: ${safeReason}` : ""}

Bring this up naturally in conversation — e.g., "I noticed something about how you communicate and wanted to check with you...".
If the user agrees, call review_soul_proposal with accept: true.
If the user disagrees, call review_soul_proposal with accept: false.
Do NOT pressure the user. If they seem uninterested, let it go.`;
}

export function recentImportDirective(report: ImportGapReport): string {
  const s = report.summary;
  const role = s.currentRole ? sanitize(s.currentRole) : "not specified";

  const contextBlock = [
    "--- BEGIN IMPORT CONTEXT ---",
    "LINKEDIN IMPORT JUST COMPLETED:",
    "The user just imported their LinkedIn profile.",
    "",
    "IMPORTED DATA SUMMARY:",
    `- Current role: ${role}`,
    `- Past experiences: ${s.pastRoles} roles`,
    `- Education: ${s.educationCount} entries`,
    `- Languages: ${s.languageCount}`,
    `- Skills: ${s.skillCount}`,
    `- Certifications: ${s.certificationCount}`,
  ];

  if (report.gaps.length > 0) {
    contextBlock.push("");
    contextBlock.push("GAPS TO EXPLORE (prioritized):");
    for (const gap of report.gaps) {
      contextBlock.push(`${gap.priority}. ${sanitize(gap.description, 200)}`);
    }
  }

  contextBlock.push("--- END IMPORT CONTEXT ---");

  const policy = `POST-IMPORT REVIEW MODE:
The user just imported their LinkedIn profile. Your job is to review the data
and fill the gaps that LinkedIn doesn't cover.

RULES:
- Briefly acknowledge the import (1-2 sentences, mention current role + one distinctive element)
- Ask ONE open-ended question about the top gap
- Do NOT recite numbers, lists, or inventory of imported data
- In subsequent turns, explore remaining gaps one at a time
- If the user asks to generate the page at any point, do it immediately — no resistance
- After 3-5 enrichment questions, propose generating the page
- Keep the tone conversational, not interrogative`;

  return `${contextBlock.join("\n")}\n\n${policy}`;
}
