import type { Section, SectionLock } from "@/lib/page-config/schema";

export type MutationKind = "position" | "widget" | "content";
export type MutationActor = "agent" | "heartbeat" | "user" | "composer";

/**
 * Central lock enforcement. Every code path that modifies a section
 * MUST call this before making changes.
 */
export function canMutateSection(
  section: Section,
  mutation: MutationKind,
  actor: MutationActor,
): { allowed: boolean; reason?: string } {
  const lock = section.lock;
  if (!lock) return { allowed: true };

  // User locks: only user can override
  if (lock.lockedBy === "user") {
    if (actor === "user") return { allowed: true };
    // Check granular lock
    if (mutation === "position" && lock.position) {
      return { allowed: false, reason: `Position locked by user: ${lock.reason ?? ""}` };
    }
    if (mutation === "widget" && lock.widget) {
      return { allowed: false, reason: `Widget locked by user: ${lock.reason ?? ""}` };
    }
    if (mutation === "content" && lock.content) {
      return { allowed: false, reason: `Content locked by user: ${lock.reason ?? ""}` };
    }
    return { allowed: true }; // lock doesn't cover this mutation kind
  }

  // Agent locks: agent and user can override, heartbeat respects
  if (lock.lockedBy === "agent") {
    if (actor === "user" || actor === "agent") return { allowed: true };
    if (actor === "heartbeat") {
      if (mutation === "position" && lock.position) {
        return { allowed: false, reason: "Position locked by agent" };
      }
      if (mutation === "widget" && lock.widget) {
        return { allowed: false, reason: "Widget locked by agent" };
      }
      if (mutation === "content" && lock.content) {
        return { allowed: false, reason: "Content locked by agent" };
      }
    }
    return { allowed: true };
  }

  return { allowed: true };
}

/** Extract locks map from sections for use in assignSlotsFromFacts */
export function extractLocks(sections: Section[]): Map<string, SectionLock> {
  const map = new Map<string, SectionLock>();
  for (const s of sections) {
    if (s.lock) map.set(s.id, s.lock);
  }
  return map;
}
