/**
 * Journal Pattern Analysis (Circuit F2).
 * Deterministic — no LLM. Analyzes journal entries across recent conversations
 * to detect behavioral patterns for meta-memory generation.
 */
import type { JournalEntry } from "@/lib/services/session-metadata";

export type JournalPattern = {
  type: "repeated_tool" | "tool_sequence" | "correction_pattern";
  description: string;
  suggestion: string;
  evidence: { tool?: string; sequence?: string[]; category?: string; frequency?: number };
};

/**
 * Analyze journal entries across recent conversations to detect behavioral patterns.
 * Deterministic — no LLM. Designed for deep heartbeat.
 *
 * @param entries Journal entries from multiple recent sessions (flattened, may span session boundaries)
 * @returns Max 2 most significant patterns
 *
 * NOTE: Sequence/correction detection operates on the flattened array. Entries at
 * session boundaries may create false-positive adjacency pairs. This is acceptable
 * for meta-memory suggestions (low-stakes) and avoids the complexity of session-aware detection.
 */
export function detectJournalPatterns(entries: JournalEntry[]): JournalPattern[] {
  if (entries.length < 5) return [];
  const patterns: JournalPattern[] = [];

  // 1. repeated_tool: same tool 5+ times
  const toolCounts = new Map<string, number>();
  for (const e of entries) {
    toolCounts.set(e.toolName, (toolCounts.get(e.toolName) ?? 0) + 1);
  }
  for (const [tool, count] of toolCounts) {
    if (count >= 5) {
      patterns.push({
        type: "repeated_tool",
        description: `Tool "${tool}" called ${count} times across recent sessions`,
        suggestion: `Consider batch operations or ask if the user wants to do multiple ${tool} ops at once.`,
        evidence: { tool, frequency: count },
      });
    }
  }

  // 2. tool_sequence: A→B pattern 3+ times
  const seqCounts = new Map<string, number>();
  for (let i = 0; i < entries.length - 1; i++) {
    const key = `${entries[i].toolName}→${entries[i + 1].toolName}`;
    seqCounts.set(key, (seqCounts.get(key) ?? 0) + 1);
  }
  for (const [seq, count] of seqCounts) {
    if (count >= 3) {
      const [a, b] = seq.split("→");
      patterns.push({
        type: "tool_sequence",
        description: `Sequence ${a} → ${b} repeated ${count} times`,
        suggestion: `This is a common workflow. Consider combining these steps proactively.`,
        evidence: { sequence: [a, b], frequency: count },
      });
    }
  }

  // 3. correction_pattern: create→update for same category within conversation
  const corrections = new Map<string, number>();
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].toolName === "create_fact" && entries[i + 1].toolName === "update_fact") {
      const cat = String(entries[i].args?.category ?? "unknown");
      corrections.set(cat, (corrections.get(cat) ?? 0) + 1);
    }
  }
  for (const [cat, count] of corrections) {
    if (count >= 2) {
      patterns.push({
        type: "correction_pattern",
        description: `Frequently corrects ${cat} facts right after creating them (${count}x)`,
        suggestion: `Ask for confirmation before saving ${cat} facts.`,
        evidence: { category: cat, frequency: count },
      });
    }
  }

  // Return top 2 by frequency
  return patterns
    .sort((a, b) => (b.evidence.frequency ?? 0) - (a.evidence.frequency ?? 0))
    .slice(0, 2);
}
