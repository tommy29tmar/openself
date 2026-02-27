import type { OwnerScope } from "@/lib/auth/session";
import { getAllFacts, countFacts } from "@/lib/services/kb-service";
import { hasAnyPublishedPage } from "@/lib/services/page-service";
import { getSummary } from "@/lib/services/summary-service";
import { getActiveMemories } from "@/lib/services/memory-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getOpenConflicts } from "@/lib/services/conflict-service";
import { getSystemPromptText } from "@/lib/agent/prompts";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { filterPublishableFacts } from "@/lib/services/page-projection";
import { SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";
import type { PromptMode } from "./promptAssembler";

/**
 * Rough token estimation: ~4 chars per token.
 * Used for per-block budget allocation (not billing).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Per-block token budgets
const BUDGET = {
  soul: 1500,
  facts: 2000,
  summary: 800,
  memories: 400,
  conflicts: 200,
  recentTurns: 2600,
  total: 7500,
} as const;

export type ContextResult = {
  systemPrompt: string;
  trimmedMessages: Array<{ role: string; content: string }>;
  mode: PromptMode;
};

/**
 * Detect agent mode based on knowledge state across all sessions.
 */
export function detectMode(readKeys: string[]): PromptMode {
  if (hasAnyPublishedPage(readKeys)) return "steady_state";
  if (countFacts(readKeys) >= 5) return "steady_state";
  return "onboarding";
}

/**
 * Truncate text to fit within a token budget.
 */
function truncateToTokenBudget(text: string, budget: number): string {
  const maxChars = budget * 4; // inverse of estimateTokens
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + "...";
}

/**
 * Assemble the full context for a chat turn.
 *
 * Gathers facts, soul, summary, memories, conflicts from DB,
 * composes the system prompt with per-block token budgets,
 * and trims client messages to fit within the total budget.
 */
export type ProfileArchetype = "developer" | "designer" | "executive" | "student" | "creator" | "generalist";

export function detectArchetype(facts: Array<{ category: string; key: string; value: unknown }>): ProfileArchetype {
  const projectFacts = facts.filter((f) => f.category === "project");
  const experienceFacts = facts.filter((f) => f.category === "experience");
  const identityFacts = facts.filter((f) => f.category === "identity");
  const skillFacts = facts.filter((f) => f.category === "skill");

  // Check role/title keywords
  const roleFact = identityFacts.find((f) => f.key === "role" || f.key === "title");
  const roleStr = roleFact ? JSON.stringify(roleFact.value).toLowerCase() : "";

  if (roleStr.includes("designer") || roleStr.includes("ux") || roleStr.includes("ui")) return "designer";
  if (roleStr.includes("ceo") || roleStr.includes("cto") || roleStr.includes("director") || roleStr.includes("vp")) return "executive";
  if (roleStr.includes("student") || roleStr.includes("intern")) return "student";

  // 3+ projects with URL = creator
  const projectsWithUrl = projectFacts.filter((f) => {
    const v = typeof f.value === "object" && f.value !== null ? f.value : {};
    return "url" in v || "link" in v;
  });
  if (projectsWithUrl.length >= 3) return "creator";

  // Dev signals
  if (skillFacts.length >= 3) return "developer";

  // Lots of experience = executive
  if (experienceFacts.length >= 5) return "executive";

  return "generalist";
}

export type AuthInfo = {
  authenticated: boolean;
  username: string | null;
};

export function assembleContext(
  scope: OwnerScope,
  language: string,
  clientMessages: Array<{ role: string; content: string }>,
  authInfo?: AuthInfo,
): ContextResult {
  const mode = detectMode(scope.knowledgeReadKeys);

  // --- Build context blocks ---

  // Facts block
  const existingFacts = getAllFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);
  const topFacts = existingFacts.slice(0, 50);
  let factsBlock =
    topFacts.length > 0
      ? `KNOWN FACTS ABOUT THE USER (${topFacts.length} facts):\n${topFacts
          .map((f) => `- [${f.category}/${f.key}]: ${JSON.stringify(f.value)}`)
          .join("\n")}`
      : "";
  factsBlock = truncateToTokenBudget(factsBlock, BUDGET.facts);

  // Soul block (compiled identity overlay)
  const activeSoul = getActiveSoul(scope.cognitiveOwnerKey);
  let soulBlock = activeSoul?.compiled ?? "";
  soulBlock = truncateToTokenBudget(soulBlock, BUDGET.soul);

  // Summary block (Tier 2)
  let summaryBlock = getSummary(scope.cognitiveOwnerKey) ?? "";
  summaryBlock = truncateToTokenBudget(summaryBlock, BUDGET.summary);

  // Memories block (Tier 3)
  const activeMemories = getActiveMemories(scope.cognitiveOwnerKey, 10);
  let memoriesBlock =
    activeMemories.length > 0
      ? activeMemories
          .map((m) => `- [${m.memoryType}] ${m.content}`)
          .join("\n")
      : "";
  memoriesBlock = truncateToTokenBudget(memoriesBlock, BUDGET.memories);

  // Conflicts block
  const openConflicts = getOpenConflicts(scope.cognitiveOwnerKey);
  let conflictsBlock =
    openConflicts.length > 0
      ? openConflicts
          .map(
            (c) =>
              `- [${c.id}] ${c.category}/${c.key}: fact_a=${c.factAId}(${c.sourceA}) vs fact_b=${c.factBId ?? "?"}(${c.sourceB ?? "?"})`,
          )
          .join("\n")
      : "";
  conflictsBlock = truncateToTokenBudget(conflictsBlock, BUDGET.conflicts);

  // Base system prompt
  const basePrompt = getSystemPromptText(mode, language);

  // Compose full system prompt
  const contextParts = [basePrompt];
  if (factsBlock) contextParts.push(`\n\n---\n\n${factsBlock}`);
  if (soulBlock) contextParts.push(`\n\n---\n\nSOUL PROFILE:\n${soulBlock}`);
  if (summaryBlock)
    contextParts.push(`\n\n---\n\nCONVERSATION SUMMARY:\n${summaryBlock}`);
  if (memoriesBlock)
    contextParts.push(`\n\n---\n\nAGENT MEMORIES:\n${memoriesBlock}`);
  if (conflictsBlock)
    contextParts.push(`\n\n---\n\nPENDING CONFLICTS:\n${conflictsBlock}`);

  // Auth context for steady-state publishing guidance
  if (mode === "steady_state" && authInfo?.authenticated && authInfo.username) {
    contextParts.push(
      `\n\n---\n\nUSER AUTH: Authenticated as "${authInfo.username}". Published page: /${authInfo.username}.\n` +
      `Use request_publish with username "${authInfo.username}" — do NOT ask for a username.\n` +
      `The user can also publish from the navigation bar.`,
    );
  }

  // Section richness block (steady_state only — drives drill-down)
  let richnessBlock = "";
  if (mode === "steady_state") {
    const publishable = filterPublishableFacts(existingFacts);
    const lines: string[] = [];
    for (const sectionType of Object.keys(SECTION_FACT_CATEGORIES)) {
      const level = classifySectionRichness(publishable, sectionType);
      if (level !== "rich") {
        lines.push(`- ${sectionType}: ${level}`);
      }
    }
    if (lines.length > 0) {
      richnessBlock = `SECTION RICHNESS (thin/empty sections need more facts):\n${lines.join("\n")}`;
    }
  }
  if (richnessBlock) contextParts.push(`\n\n---\n\n${richnessBlock}`);

  // Layout intelligence block (steady_state only)
  if (mode === "steady_state") {
    const archetype = detectArchetype(existingFacts);
    const layoutIntelligence = `PAGE LAYOUT INTELLIGENCE:
Default order: bio → at-a-glance → experience → projects → education → achievements → [personality sections]

Profile archetype: ${archetype}

Consider reordering when:
- designer: projects before experience (portfolio-first)
- student: education before experience
- executive: experience before everything (track record)
- creator: projects + achievements before experience
- User EXPLICITLY asks: put requested section right after bio

Before proposing a reorder, explain reasoning and ask for confirmation.`;
    contextParts.push(`\n\n---\n\n${layoutIntelligence}`);
  }

  let systemPrompt = contextParts.join("");

  // --- Post-assembly guard: iteratively truncate if over total budget ---
  let totalTokens = estimateTokens(systemPrompt);
  if (totalTokens > BUDGET.total) {
    // Identify blocks and their current sizes for iterative truncation
    const blocks = [
      { name: "facts", content: factsBlock, budget: BUDGET.facts },
      { name: "soul", content: soulBlock, budget: BUDGET.soul },
      { name: "summary", content: summaryBlock, budget: BUDGET.summary },
      { name: "memories", content: memoriesBlock, budget: BUDGET.memories },
      { name: "conflicts", content: conflictsBlock, budget: BUDGET.conflicts },
    ];

    let iterations = 0;
    while (totalTokens > BUDGET.total && iterations < 10) {
      // Find the largest block
      let largest = blocks[0];
      for (const b of blocks) {
        if (estimateTokens(b.content) > estimateTokens(largest.content)) {
          largest = b;
        }
      }

      // Truncate it by 20%
      const currentLen = largest.content.length;
      if (currentLen === 0) break;
      const newLen = Math.floor(currentLen * 0.8);
      largest.content = largest.content.slice(0, newLen);
      if (largest.content.length > 3) {
        largest.content = largest.content.slice(0, -3) + "...";
      }

      // Rebuild prompt
      const parts = [basePrompt];
      for (const b of blocks) {
        if (b.content) {
          const label =
            b.name === "facts"
              ? ""
              : b.name === "soul"
                ? "SOUL PROFILE:\n"
                : b.name === "summary"
                  ? "CONVERSATION SUMMARY:\n"
                  : b.name === "memories"
                    ? "AGENT MEMORIES:\n"
                    : "PENDING CONFLICTS:\n";
          parts.push(`\n\n---\n\n${label}${b.content}`);
        }
      }
      systemPrompt = parts.join("");
      totalTokens = estimateTokens(systemPrompt);
      iterations++;
    }
  }

  // --- Trim client messages to fit within recent turns budget ---
  const maxTurnChars = BUDGET.recentTurns * 4;
  let turnChars = 0;
  const trimmedMessages: Array<{ role: string; content: string }> = [];

  // Walk backwards from latest message to keep the most recent turns
  for (let i = clientMessages.length - 1; i >= 0; i--) {
    const msg = clientMessages[i];
    const msgChars = msg.content.length;
    if (turnChars + msgChars > maxTurnChars && trimmedMessages.length >= 2) {
      break; // Keep at least 2 most recent messages
    }
    turnChars += msgChars;
    trimmedMessages.unshift(msg);
  }

  // Cap at 12 most recent turns
  const maxTurns = 12;
  const finalMessages =
    trimmedMessages.length > maxTurns
      ? trimmedMessages.slice(-maxTurns)
      : trimmedMessages;

  return {
    systemPrompt,
    trimmedMessages: finalMessages,
    mode,
  };
}
