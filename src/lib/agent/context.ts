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
import { getFactsReadScope } from "@/lib/agent/facts-read-scope";
import type { PendingConfirmation } from "@/lib/services/confirmation-service";

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

type PromptBlock = {
  name: string;
  content: string;
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
    schemaMode: "minimal",
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
    schemaMode: "minimal",
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
    schemaMode: "minimal",
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

function shrinkBlockContent(content: string): string {
  const currentLen = content.length;
  if (currentLen <= 64) return "";

  const newLen = Math.floor(currentLen * 0.8);
  const truncated = content.slice(0, newLen);
  return truncated.length > 3
    ? `${truncated.slice(0, -3)}...`
    : "";
}

function buildTemporalContextBlock(now = new Date()): string {
  const isoNow = now.toISOString();
  return `CURRENT TEMPORAL CONTEXT:
- Current timestamp: ${isoNow} (UTC)
- Resolve relative time expressions ("today", "yesterday", "this morning", "last Tuesday") against this timestamp before calling record_event.
- record_event expects eventAtHuman as an ISO-8601 timestamp.
- If the day boundary or timezone is ambiguous, ask a short clarification instead of guessing.`;
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
  conversationSessionId?: string,
): ContextResult {
  const { factsReadId, factsReadKeys } = getFactsReadScope(scope);

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
      ?? getActiveFacts(factsReadId, factsReadKeys);
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

  // Empty-facts notice for first_visit: tell the agent to extract immediately.
  // Only inject when bootstrap is explicitly provided with first_visit — the
  // no-bootstrap fallback (line 354) always synthesizes first_visit regardless
  // of actual state, so we don't inject there to avoid false positives.
  if (!factsBlock && bootstrap?.journeyState === "first_visit") {
    factsBlock = "[No facts recorded yet. Start extracting information from the user's messages immediately.]";
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

  // Base system prompt — always use composable path.
  // The no-bootstrap branch is a legacy/direct-call fallback: in production the
  // chat route always provides bootstrap via assembleBootstrapPayload() (route.ts).
  // Tests that call assembleContext() directly without bootstrap hit this path.
  // We default to first_visit because we lack the DB queries needed to detect
  // the real journey state here. This is acceptable — the path is not used in
  // production and fixing it would require threading scope-dependent queries
  // into a function that is intentionally scope-light.
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

  // --- Static parts: preserved preferentially, but shrinkable as a last resort ---
  const staticBlocks: PromptBlock[] = [];

  // Auth context for steady-state publishing guidance
  if (mode === "steady_state" && authInfo?.authenticated && authInfo.username) {
    staticBlocks.push({
      name: "auth",
      content:
        `\n\n---\n\nUSER AUTH: Authenticated as "${authInfo.username}". Published page: /${authInfo.username}.\n` +
        `Use request_publish with username "${authInfo.username}" — do NOT ask for a username.\n` +
        `The user can also publish from the navigation bar.`,
    });
  }

  staticBlocks.push({
    name: "temporalContext",
    content: `\n\n---\n\n${buildTemporalContextBlock()}`,
  });

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
      staticBlocks.push({ name: "exploration", content: `\n\n---\n\n${explorationBlock}` });
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
        staticBlocks.push({ name: "exploration", content: `\n\n---\n\n${explorationBlock}` });
      }
    }

    if (includeLayout) {
      const layoutIntelligence = `PAGE LAYOUT INTELLIGENCE:
Profile archetype: ${archetype}
Section priority: ${strategy.sectionPriority.join(" → ")}

Before proposing a reorder, explain reasoning and ask for confirmation.`;
      staticBlocks.push({ name: "layout", content: `\n\n---\n\n${layoutIntelligence}` });
    }
  }

  // --- Resume injection: incomplete operation from previous turn ---
  // Pending operations are conversation-scoped, not profile-anchor scoped.
  const PENDING_OPS_TTL_MS = 60 * 60 * 1000; // 1 hour
  const anchorSessionId = scope.knowledgePrimaryKey;
  const pendingOpsSessionId = conversationSessionId ?? anchorSessionId;

  // Declare latestUserMessage here so the pending ops gate can use it
  const latestUserMessage = [...clientMessages].reverse().find(m => m.role === "user")?.content ?? "";

  if (pendingOpsSessionId) {
    try {
      const meta = getSessionMeta(pendingOpsSessionId);
      const pending = meta.pendingOperations as { timestamp: string; journal: unknown[]; finishReason: string } | undefined;
      if (pending?.timestamp) {
        const age = Date.now() - new Date(pending.timestamp).getTime();
        if (age >= PENDING_OPS_TTL_MS) {
          // Stale — clean up
          mergeSessionMeta(pendingOpsSessionId, { pendingOperations: undefined });
        } else if (pending.journal?.length > 0) {
          // Gate: if user sent a new request, clear pending ops — don't resume
          const isNewRequest = latestUserMessage
            ? isNewTopicSignal(latestUserMessage, language)
            : false;

          if (isNewRequest) {
            mergeSessionMeta(pendingOpsSessionId, { pendingOperations: null });
          } else {
            const summaries = (pending.journal as Array<{ toolName: string; summary?: string; success: boolean }>)
              .map(j => `- ${j.toolName}: ${j.summary ?? (j.success ? "ok" : "failed")}`)
              .join("\n");
            staticBlocks.push({
              name: "pendingOps",
              content: `\n\n---\n\nINCOMPLETE_OPERATION (previous turn hit step limit):\n${summaries}\nResume where you left off — do NOT repeat completed steps.`,
            });
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
        staticBlocks.push({ name: "coherence", content: `\n\n---\n\n${directive}` });
      }
    } catch { /* best-effort */ }
  }

  // --- Pending confirmations injection (BUG-1b: surface confirmationIds for agent retry) ---
  // Scoped to bulk_delete with confirmationId only — other types work via existing tool flow.
  // Read from anchor session (scope.knowledgePrimaryKey), same as createAgentTools/pruneUnconfirmedPendings.
  // Apply same 5-min TTL as createAgentTools (tools.ts:169) since assembleContext runs first.
  const CONFIRM_TTL_MS = 5 * 60 * 1000;
  const anchorForConfirmations = scope.knowledgePrimaryKey;
  if (anchorForConfirmations) {
    try {
      const confirmMeta = getSessionMeta(anchorForConfirmations);
      const rawPendings = confirmMeta?.pendingConfirmations as PendingConfirmation[] | undefined;
      if (Array.isArray(rawPendings) && rawPendings.length > 0) {
        const confirmNow = Date.now();
        // Filter: TTL + only bulk_delete with confirmationId
        const confirmPendings = rawPendings.filter(
          p => p.type === "bulk_delete"
            && p.confirmationId
            && confirmNow - new Date(p.createdAt).getTime() < CONFIRM_TTL_MS
        );
        if (confirmPendings.length > 0) {
          const lines = confirmPendings.map(p => {
            const ids = (p.factIds ?? []).join(", ");
            return `- batch_facts confirmation pending: confirmationId="${p.confirmationId}" for deleting [${ids}]. Pass this confirmationId in your next batch_facts call.`;
          });
          staticBlocks.push({
            name: "pendingConfirmations",
            content: `\n\n---\n\nPENDING CONFIRMATIONS (from previous turn):\n${lines.join("\n")}`,
          });
        }
      }
    } catch { /* best-effort */ }
  }

  // --- Message quota warning: nudge agent to suggest registration ---
  if (quotaInfo && quotaInfo.remaining <= 3) {
    staticBlocks.push({ name: "quota", content: `\n\n---\n\nMESSAGE QUOTA (anonymous user):
Remaining messages: ${quotaInfo.remaining}/${quotaInfo.limit}.

This applies to anonymous users only — authenticated users have their own quota managed by the UI.

Wait for a NATURAL PAUSE before mentioning registration. Natural pauses:
- User just responded with a short affirmation ("great", "ok", "perfetto", "bello", "thanks", "👍")
- You just completed an action (page generated, fact saved, style changed)
- User's reply is short and contains no new request or open question

When the moment is right, weave in ONE casual sentence — max:
"By the way — you're almost out of messages. Want to grab a username to keep going?"
Suggest a username based on their name if known (e.g. "marco-rossi" for Marco Rossi).
Do NOT add this if you're mid-explanation or mid-topic.` });
  }

  // --- Magic paste: detect connector URLs from the latest user message ---
  const detectedConnectors = detectConnectorUrls(latestUserMessage);
  const magicPasteHint = detectedConnectors.length > 0
    ? `\nDETECTED SOURCE URLS: ${detectedConnectors.map(d => `${d.connectorId} (${d.url})`).join(", ")}. If relevant, suggest the user connect it as a Source via the Sources panel.`
    : "";
  if (magicPasteHint) {
    staticBlocks.push({ name: "magicPaste", content: `\n\n---\n\n${magicPasteHint}` });
  }

  const renderStaticSuffix = () => staticBlocks.map((block) => block.content).join("");
  let staticSuffix = renderStaticSuffix();
  let systemPrompt = mutableParts.join("") + staticSuffix;

  // --- Post-assembly guard: iteratively truncate if over total budget ---
  let totalTokens = estimateTokens(systemPrompt);
  if (totalTokens > BUDGET.total) {
    // Shrink mutable blocks first. If they are exhausted and we are still over budget,
    // shrink static blocks as a last resort. This guarantees the final prompt respects BUDGET.total.
    const blocks = [
      { name: "facts", content: factsBlock, budget: BUDGET.facts },
      { name: "soul", content: soulBlock, budget: BUDGET.soul },
      { name: "summary", content: summaryBlock, budget: BUDGET.summary },
      { name: "memories", content: memoriesBlock, budget: BUDGET.memories },
      { name: "conflicts", content: conflictsBlock, budget: BUDGET.conflicts },
      { name: "pageState", content: pageStateBlock, budget: BUDGET.pageState },
    ];

    let iterations = 0;
    while (totalTokens > BUDGET.total && iterations < 20) {
      const mutableCandidates = blocks.filter((b) => b.content.length > 0);
      const staticCandidates = staticBlocks.filter((b) => b.content.length > 0);
      const candidates = mutableCandidates.length > 0 ? mutableCandidates : staticCandidates;
      if (candidates.length === 0) break;

      let largest = candidates[0];
      for (const candidate of candidates.slice(1)) {
        if (estimateTokens(candidate.content) > estimateTokens(largest.content)) {
          largest = candidate;
        }
      }
      largest.content = shrinkBlockContent(largest.content);

      // Rebuild mutable parts; append the current static suffix.
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
      staticSuffix = renderStaticSuffix();
      systemPrompt = parts.join("") + staticSuffix;
      totalTokens = estimateTokens(systemPrompt);
      iterations++;
    }

    if (totalTokens > BUDGET.total) {
      systemPrompt = truncateToTokenBudget(systemPrompt, BUDGET.total);
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
