import type { OwnerScope } from "@/lib/auth/session";
import { getActiveFacts, countFacts } from "@/lib/services/kb-service";
import { hasAnyPublishedPage, getDraft } from "@/lib/services/page-service";
import { getSummary } from "@/lib/services/summary-service";
import { getActiveMemories } from "@/lib/services/memory-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getOpenConflicts } from "@/lib/services/conflict-service";
import { buildSystemPrompt } from "@/lib/agent/prompts";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { filterPublishableFacts } from "@/lib/services/page-projection";
import { SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";
import type { JourneyState, BootstrapPayload, BootstrapData } from "@/lib/agent/journey";
import { computeRelevance } from "@/lib/agent/journey";
import type { FactRow } from "@/lib/services/kb-service";
import { ARCHETYPE_STRATEGIES } from "@/lib/agent/archetypes";
import { getSessionMeta, mergeSessionMeta } from "@/lib/services/session-metadata";
import { coherenceIssuesDirective } from "@/lib/agent/policies/situations";
import { isNewTopicSignal } from "@/lib/agent/policies/topic-signal-detector";
import type { PromptMode } from "./prompts";
import { detectConnectorUrls } from "@/lib/connectors/magic-paste";
import type { PageConfig } from "@/lib/page-config/schema";

/**
 * Sort facts for context injection:
 * 1. Guarantee the N most recently updated facts are always included
 * 2. Fill remaining slots by relevance score (confidence × recency × children)
 * 3. Tie-break: updatedAt desc
 */
export function sortFactsForContext(
  facts: FactRow[],
  childCountMap: Map<string, number>,
  cap: number,
  recentGuaranteeCount = 5,
): FactRow[] {
  // Always sort for consistent ordering (tests rely on this even for small sets).
  if (facts.length <= cap) {
    return [...facts]
      .map(f => ({ f, score: computeRelevance(f, childCountMap) }))
      .sort((a, b) =>
        b.score - a.score ||
        new Date(b.f.updatedAt ?? 0).getTime() - new Date(a.f.updatedAt ?? 0).getTime()
      )
      .map(({ f }) => f);
  }

  // Clamp guarantee count
  const g = Math.min(recentGuaranteeCount, cap, facts.length);

  const sorted = [...facts].sort(
    (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
  );

  const guaranteed = sorted.slice(0, g);
  const recentIds = new Set(guaranteed.map(f => f.id));

  const rest = facts
    .filter(f => !recentIds.has(f.id))
    .map(f => ({ f, score: computeRelevance(f, childCountMap) }))
    .sort((a, b) =>
      b.score - a.score ||
      new Date(b.f.updatedAt ?? 0).getTime() - new Date(a.f.updatedAt ?? 0).getTime()
    )
    .map(({ f }) => f)
    .slice(0, cap - g);

  return [...guaranteed, ...rest];
}

/**
 * Rough token estimation: ~4 chars per token.
 * Used for per-block budget allocation (not billing).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Per-block token budgets
const BUDGET = {
  soul: 13000,
  facts: 17000,
  summary: 7000,
  memories: 3500,
  conflicts: 1500,
  pageState: 1500,
  recentTurns: 22000,
  total: 65000,
} as const;

export type ContextResult = {
  systemPrompt: string;
  trimmedMessages: Array<{ role: string; content: string }>;
  mode: PromptMode;
};

/**
 * Context profile per journey state.
 * Controls which blocks are injected and their budgets.
 * Omitted blocks skip DB queries entirely (saves tokens AND latency).
 */
export type ContextProfile = {
  facts: { include: boolean; budget: number };
  soul: { include: boolean; budget: number };
  summary: { include: boolean; budget: number };
  memories: { include: boolean; budget: number };
  conflicts: { include: boolean; budget: number };
  pageState: { include: boolean; budget: number };
  richness: { include: boolean };
  layoutIntelligence: { include: boolean };
  schemaMode: "full" | "minimal" | "none";
};

export const CONTEXT_PROFILES: Record<JourneyState, ContextProfile> = {
  first_visit: {
    facts: { include: true, budget: 17000 },
    soul: { include: false, budget: 0 },
    summary: { include: false, budget: 0 },
    memories: { include: false, budget: 0 },
    conflicts: { include: false, budget: 0 },
    pageState: { include: false, budget: 0 },
    richness: { include: false },
    layoutIntelligence: { include: false },
    schemaMode: "minimal",
  },
  returning_no_page: {
    facts: { include: true, budget: 17000 },
    soul: { include: true, budget: 7000 },
    summary: { include: true, budget: 7000 },
    memories: { include: true, budget: 3500 },
    conflicts: { include: true, budget: 1500 },
    pageState: { include: false, budget: 0 },
    richness: { include: false },
    layoutIntelligence: { include: false },
    schemaMode: "full",
  },
  draft_ready: {
    facts: { include: true, budget: 13000 },
    soul: { include: true, budget: 13000 },
    summary: { include: false, budget: 0 },
    memories: { include: false, budget: 0 },
    conflicts: { include: true, budget: 1500 },
    pageState: { include: true, budget: 1500 },
    richness: { include: true },
    layoutIntelligence: { include: true },
    schemaMode: "none",
  },
  active_fresh: {
    facts: { include: true, budget: 13000 },
    soul: { include: true, budget: 8500 },
    summary: { include: true, budget: 7000 },
    memories: { include: true, budget: 3500 },
    conflicts: { include: true, budget: 1500 },
    pageState: { include: true, budget: 1500 },
    richness: { include: true },
    layoutIntelligence: { include: true },
    schemaMode: "none",
  },
  active_stale: {
    facts: { include: true, budget: 17000 },
    soul: { include: true, budget: 8500 },
    summary: { include: true, budget: 7000 },
    memories: { include: true, budget: 3500 },
    conflicts: { include: true, budget: 1500 },
    pageState: { include: true, budget: 1500 },
    richness: { include: true },
    layoutIntelligence: { include: false },
    schemaMode: "none",
  },
  blocked: {
    facts: { include: false, budget: 0 },
    soul: { include: false, budget: 0 },
    summary: { include: false, budget: 0 },
    memories: { include: false, budget: 0 },
    conflicts: { include: false, budget: 0 },
    pageState: { include: false, budget: 0 },
    richness: { include: false },
    layoutIntelligence: { include: false },
    schemaMode: "none",
  },
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

export type AuthInfo = {
  authenticated: boolean;
  username: string | null;
};

/**
 * Map JourneyState to PromptMode for backward compatibility.
 *
 * CONTRACT (frozen — must match Sprint 2 journeyStateToPromptMode):
 *   onboarding:    first_visit, returning_no_page
 *   steady_state:  draft_ready, active_fresh, active_stale, blocked
 *
 * Rationale: returning_no_page users have no draft yet — they still
 * need the onboarding flow to collect initial facts.
 */
function mapJourneyStateToMode(state: JourneyState): PromptMode {
  if (state === "first_visit" || state === "returning_no_page") return "onboarding";
  return "steady_state";
}

export function assembleContext(
  scope: OwnerScope,
  language: string,
  clientMessages: Array<{ role: string; content: string }>,
  authInfo?: AuthInfo,
  bootstrap?: BootstrapPayload,
  bootstrapData?: BootstrapData,
  quotaInfo?: { remaining: number; limit: number },
): ContextResult {
  // Use bootstrap journeyState when available, fall back to detectMode()
  const mode: PromptMode = bootstrap
    ? mapJourneyStateToMode(bootstrap.journeyState)
    : detectMode(scope.knowledgeReadKeys);

  // --- Determine context profile ---
  const profile = bootstrap ? CONTEXT_PROFILES[bootstrap.journeyState] : null;

  // --- Build context blocks (conditional on profile) ---

  // Facts block — use passthrough data when available, otherwise query DB
  let existingFacts: ReturnType<typeof getActiveFacts> = [];
  let factsBlock = "";
  if (!profile || profile.facts.include) {
    existingFacts = bootstrapData?.facts
      ?? getActiveFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);
    const childCountMap = bootstrapData?.childCountMap ?? new Map<string, number>();
    const topFacts = sortFactsForContext(existingFacts, childCountMap, 120);
    factsBlock =
      topFacts.length > 0
        ? `KNOWN FACTS ABOUT THE USER (${topFacts.length} facts):\n${topFacts
            .map((f) => `- [${f.category}/${f.key}]: ${JSON.stringify(f.value)}`)
            .join("\n")}`
        : "";
    factsBlock = truncateToTokenBudget(factsBlock, profile?.facts.budget ?? BUDGET.facts);
  }

  // Soul block (compiled identity overlay) — passthrough or query
  let soulBlock = "";
  if (!profile || profile.soul.include) {
    const activeSoul = bootstrapData?.soul
      ?? getActiveSoul(scope.cognitiveOwnerKey);
    soulBlock = activeSoul?.compiled ?? "";
    soulBlock = truncateToTokenBudget(soulBlock, profile?.soul.budget ?? BUDGET.soul);
  }

  // Summary block (Tier 2)
  let summaryBlock = "";
  if (!profile || profile.summary.include) {
    summaryBlock = getSummary(scope.cognitiveOwnerKey) ?? "";
    summaryBlock = truncateToTokenBudget(summaryBlock, profile?.summary.budget ?? BUDGET.summary);
  }

  // Memories block (Tier 3)
  let memoriesBlock = "";
  if (!profile || profile.memories.include) {
    const activeMemories = getActiveMemories(scope.cognitiveOwnerKey, 10);
    memoriesBlock =
      activeMemories.length > 0
        ? activeMemories
            .map((m) => `- [${m.memoryType}] ${m.content}`)
            .join("\n")
        : "";
    memoriesBlock = truncateToTokenBudget(memoriesBlock, profile?.memories.budget ?? BUDGET.memories);
  }

  // Conflicts block — passthrough or query
  let conflictsBlock = "";
  if (!profile || profile.conflicts.include) {
    const openConflicts = bootstrapData?.openConflictRecords
      ?? getOpenConflicts(scope.cognitiveOwnerKey);
    conflictsBlock =
      openConflicts.length > 0
        ? openConflicts
            .map(
              (c) =>
                `- [${c.id}] ${c.category}/${c.key}: fact_a=${c.factAId}(${c.sourceA ?? "?"}) vs fact_b=${c.factBId ?? "?"}(${c.sourceB ?? "?"})`,
            )
            .join("\n")
        : "";
    conflictsBlock = truncateToTokenBudget(conflictsBlock, profile?.conflicts.budget ?? BUDGET.conflicts);
  }

  // Page state block — draft layout/presence/sections snapshot
  let pageStateBlock = "";
  if (profile?.pageState.include) {
    const draft = getDraft(scope.knowledgePrimaryKey);
    if (draft?.config) {
      const cfg = draft.config as PageConfig;
      const sections = (cfg.sections ?? []).map(s =>
        `  - ${s.type}${s.slot ? ` [slot:${s.slot}]` : ""}${s.widgetId ? ` widget:${s.widgetId}` : ""}`
      ).join("\n");
      const presenceLine = `surface:${cfg.surface ?? "?"} voice:${cfg.voice ?? "?"} light:${cfg.light ?? "?"}`;
      const layoutLine = cfg.layoutTemplate ? `layoutTemplate: ${cfg.layoutTemplate}` : "layoutTemplate: (default)";
      pageStateBlock = `CURRENT DRAFT PAGE:\n${layoutLine}\npresence: ${presenceLine}\nsections:\n${sections || "  (none)"}`;
      pageStateBlock = truncateToTokenBudget(pageStateBlock, profile.pageState.budget ?? BUDGET.pageState);
    }
  }

  // Base system prompt — always use composable path; synthesise a minimal bootstrap when not provided
  const basePrompt = bootstrap
    ? buildSystemPrompt(bootstrap, { schemaMode: profile?.schemaMode ?? "full" })
    : buildSystemPrompt(
        {
          journeyState: "first_visit",
          language,
          situations: [],
          expertiseLevel: "novice",
          userName: null,
          lastSeenDaysAgo: null,
          publishedUsername: null,
          pendingProposalCount: 0,
          thinSections: [],
          staleFacts: [],
          openConflicts: [],
          archivableFacts: [],
          conversationContext: null,
          archetype: "generalist",
        } as BootstrapPayload,
        { schemaMode: "minimal" }
      );

  // --- Mutable parts: truncatable blocks (rebuilt during budget overflow) ---
  const mutableParts: string[] = [basePrompt];
  if (factsBlock) mutableParts.push(`\n\n---\n\n${factsBlock}`);
  if (soulBlock) mutableParts.push(`\n\n---\n\nSOUL PROFILE:\n${soulBlock}`);
  if (summaryBlock) mutableParts.push(`\n\n---\n\nCONVERSATION SUMMARY:\n${summaryBlock}`);
  if (memoriesBlock) mutableParts.push(`\n\n---\n\nAGENT MEMORIES:\n${memoriesBlock}`);
  if (conflictsBlock) mutableParts.push(`\n\n---\n\nPENDING CONFLICTS:\n${conflictsBlock}`);
  if (pageStateBlock) mutableParts.push(`\n\n---\n\nPAGE STATE:\n${pageStateBlock}`);

  // --- Static parts: non-truncatable blocks (always preserved during budget overflow) ---
  const staticParts: string[] = [];

  // Auth context for steady-state publishing guidance
  if (mode === "steady_state" && authInfo?.authenticated && authInfo.username) {
    staticParts.push(
      `\n\n---\n\nUSER AUTH: Authenticated as "${authInfo.username}". Published page: /${authInfo.username}.\n` +
      `Use request_publish with username "${authInfo.username}" — do NOT ask for a username.\n` +
      `The user can also publish from the navigation bar.`,
    );
  }

  // Archetype-weighted exploration priorities — conditional on profile.richness
  const archetype = bootstrap?.archetype ?? "generalist";
  const strategy = ARCHETYPE_STRATEGIES[archetype];
  const includeRichness = !profile || profile.richness.include;
  const includeLayout = !profile || profile.layoutIntelligence.include;

  if (mode === "onboarding" && includeRichness) {
    // Onboarding: show archetype + priorities to guide fact collection
    const publishable = bootstrapData?.publishableFacts ?? filterPublishableFacts(existingFacts);
    const weighted = strategy.explorationOrder
      .map(category => ({
        category,
        richness: classifySectionRichness(publishable, category),
      }))
      .filter(x => x.richness !== "rich");

    if (weighted.length > 0) {
      const priorityLines = weighted.map(
        (x, i) => `${i + 1}. ${x.category}: ${x.richness}`,
      );
      const explorationBlock = `ARCHETYPE: ${archetype}\nEXPLORATION PRIORITIES (${archetype} profile):\n${priorityLines.join("\n")}`;
      staticParts.push(`\n\n---\n\n${explorationBlock}`);
    }
  } else if (mode === "steady_state") {
    // Steady state: richness + layout intelligence (conditional)
    if (includeRichness) {
      const publishable = bootstrapData?.publishableFacts ?? filterPublishableFacts(existingFacts);
      const weighted = strategy.explorationOrder
        .map(category => ({
          category,
          richness: classifySectionRichness(publishable, category),
        }))
        .filter(x => x.richness !== "rich");

      if (weighted.length > 0) {
        const priorityLines = weighted.map(
          (x, i) => `${i + 1}. ${x.category}: ${x.richness}`,
        );
        const explorationBlock = `EXPLORATION PRIORITIES (${archetype} profile):\n${priorityLines.join("\n")}`;
        staticParts.push(`\n\n---\n\n${explorationBlock}`);
      }
    }

    if (includeLayout) {
      const layoutIntelligence = `PAGE LAYOUT INTELLIGENCE:
Profile archetype: ${archetype}
Section priority: ${strategy.sectionPriority.join(" → ")}

Before proposing a reorder, explain reasoning and ask for confirmation.`;
      staticParts.push(`\n\n---\n\n${layoutIntelligence}`);
    }
  }

  // --- Resume injection: incomplete operation from previous turn ---
  // Use anchor session (knowledgePrimaryKey) — route.ts writes journal/pendingOps
  // to writeSessionId which equals knowledgePrimaryKey. Reading from currentSessionId
  // would miss data in multi-session authenticated setups.
  const PENDING_OPS_TTL_MS = 60 * 60 * 1000; // 1 hour
  const anchorSessionId = scope.knowledgePrimaryKey;

  // Declare latestUserMessage here so the pending ops gate can use it
  const latestUserMessage = [...clientMessages].reverse().find(m => m.role === "user")?.content ?? "";

  if (anchorSessionId) {
    try {
      const meta = getSessionMeta(anchorSessionId);
      const pending = meta.pendingOperations as { timestamp: string; journal: unknown[]; finishReason: string } | undefined;
      if (pending?.timestamp) {
        const age = Date.now() - new Date(pending.timestamp).getTime();
        if (age >= PENDING_OPS_TTL_MS) {
          // Stale — clean up
          mergeSessionMeta(anchorSessionId, { pendingOperations: undefined });
        } else if (pending.journal?.length > 0) {
          // Gate: if user sent a new request, clear pending ops — don't resume
          const isNewRequest = latestUserMessage
            ? isNewTopicSignal(latestUserMessage, language)
            : false;

          if (isNewRequest) {
            mergeSessionMeta(anchorSessionId, { pendingOperations: null });
          } else {
            const summaries = (pending.journal as Array<{ toolName: string; summary?: string; success: boolean }>)
              .map(j => `- ${j.toolName}: ${j.summary ?? (j.success ? "ok" : "failed")}`)
              .join("\n");
            staticParts.push(
              `\n\n---\n\nINCOMPLETE_OPERATION (previous turn hit step limit):\n${summaries}\nResume where you left off — do NOT repeat completed steps.`,
            );
          }
        }
      }
    } catch { /* best-effort */ }
  }

  // --- Coherence issues injection (circuit D1, steady_state only) ---
  if (anchorSessionId && mode === "steady_state") {
    try {
      const meta = getSessionMeta(anchorSessionId);
      const warnings = (meta.coherenceWarnings ?? []) as Array<{ type: string; severity: string; description: string; suggestion: string }>;
      const infos = (meta.coherenceInfos ?? []) as Array<{ type: string; severity: string; description: string; suggestion: string }>;
      const allIssues = [...warnings, ...infos];
      const directive = coherenceIssuesDirective(allIssues);
      if (directive) {
        staticParts.push(`\n\n---\n\n${directive}`);
      }
    } catch { /* best-effort */ }
  }

  // --- Message quota warning: nudge agent to suggest registration ---
  if (quotaInfo && quotaInfo.remaining <= 3) {
    staticParts.push(`\n\n---\n\nMESSAGE QUOTA (anonymous user):
Remaining messages: ${quotaInfo.remaining}/${quotaInfo.limit}.

This applies to anonymous users only — authenticated users have their own quota managed by the UI.

Wait for a NATURAL PAUSE before mentioning registration. Natural pauses:
- User just responded with a short affirmation ("great", "ok", "perfetto", "bello", "thanks", "👍")
- You just completed an action (page generated, fact saved, style changed)
- User's reply is short and contains no new request or open question

When the moment is right, weave in ONE casual sentence — max:
"By the way — you're almost out of messages. Want to grab a username to keep going?"
Suggest a username based on their name if known (e.g. "marco-rossi" for Marco Rossi).
Do NOT add this if you're mid-explanation or mid-topic.`);
  }

  // --- Magic paste: detect connector URLs from the latest user message ---
  const detectedConnectors = detectConnectorUrls(latestUserMessage);
  const magicPasteHint = detectedConnectors.length > 0
    ? `\nDETECTED SOURCE URLS: ${detectedConnectors.map(d => `${d.connectorId} (${d.url})`).join(", ")}. If relevant, suggest the user connect it as a Source via the Sources panel.`
    : "";
  if (magicPasteHint) {
    staticParts.push(`\n\n---\n\n${magicPasteHint}`);
  }

  const staticSuffix = staticParts.join("");
  let systemPrompt = mutableParts.join("") + staticSuffix;

  // --- Post-assembly guard: iteratively truncate if over total budget ---
  let totalTokens = estimateTokens(systemPrompt);
  if (totalTokens > BUDGET.total) {
    // Only mutable blocks are shrunk; static blocks (auth, quota, magic paste, etc.) are always preserved.
    const blocks = [
      { name: "facts", content: factsBlock, budget: BUDGET.facts },
      { name: "soul", content: soulBlock, budget: BUDGET.soul },
      { name: "summary", content: summaryBlock, budget: BUDGET.summary },
      { name: "memories", content: memoriesBlock, budget: BUDGET.memories },
      { name: "conflicts", content: conflictsBlock, budget: BUDGET.conflicts },
      { name: "pageState", content: pageStateBlock, budget: BUDGET.pageState },
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

      // Rebuild mutable parts only; always append staticSuffix
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
                    : b.name === "conflicts"
                      ? "PENDING CONFLICTS:\n"
                      : "PAGE STATE:\n";
          parts.push(`\n\n---\n\n${label}${b.content}`);
        }
      }
      systemPrompt = parts.join("") + staticSuffix;
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

  // Cap at 20 most recent turns
  const maxTurns = 20;
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
