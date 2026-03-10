type JournalEntry = {
  toolName: string;
  success: boolean;
  args?: Record<string, unknown>;
};

type GuardStreamPart =
  | { type: "text-delta"; textDelta: string }
  | { type: "tool-result"; toolName: string; result: unknown }
  | { type: string; [key: string]: unknown };

const COMPLETION_CLAIM_BACKING_TOOL_NAMES = new Set([
  "create_fact",
  "batch_facts",
  "delete_fact",
  "update_page_style",
  "reorder_sections",
  "move_section",
  "generate_page",
  "record_event",
  "set_layout",
  "resolve_conflict",
  "set_fact_visibility",
  "archive_fact",
  "unarchive_fact",
  "reorder_items",
]);

const LEADING_FILLER_PREFIX =
  /^(?:(?:ok(?:ay)?|certo|va bene|allora|sure|alright|great|perfetto|bene)\s*[,.:;!?-–—]*\s*)+/i;

const DIRECT_ACTION_CLAIM_PREFIXES = [
  /^(?:aggiunt[oaie]|salvat[oaie]|aggiornat[oaie]|rimoss[oaie]|cancellat[oaie]|eliminat[oaie]|pubblicat[oaie]|rigenerat[oaie]|fatto)\b/i,
  /^(?:added|saved|updated|removed|deleted|published|rebuilt|regenerated|done)\b/i,
];

const ACTION_CLAIM_PATTERNS = [
  ...DIRECT_ACTION_CLAIM_PREFIXES,
  /^(?:l'ho|ho)\s+(?:aggiunto|aggiunta|salvato|salvata|aggiornato|aggiornata|rimosso|rimossa|cancellato|cancellata|eliminato|eliminata|pubblicato|pubblicata|rigenerato|rigenerata)\b/i,
  /^(?:i(?:'ve)?\s+)?(?:added|saved|updated|removed|deleted|published|rebuilt|regenerated)\b/i,
];

const ACTION_FALLBACKS: Record<string, string> = {
  en: "I haven't done that yet. If you want, I can do it now.",
  it: "Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.",
};

function normalize(text: string): string {
  return text
    .trimStart()
    .replaceAll("’", "'")
    .replace(LEADING_FILLER_PREFIX, "")
    .toLowerCase();
}

function didToolActuallyCompleteAction(
  toolName: string,
  success: boolean,
  opts?: {
    args?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
  },
): boolean {
  if (!success) return false;

  switch (toolName) {
    case "request_publish":
    case "propose_soul_change":
    case "propose_lock":
    case "save_memory":
      return false;
    case "review_soul_proposal":
      return opts?.args?.accept === true || opts?.result?.accepted === true;
    case "confirm_episodic_pattern":
      return opts?.args?.accept === true || opts?.result?.accepted === true;
    default:
      return COMPLETION_CLAIM_BACKING_TOOL_NAMES.has(toolName);
  }
}

function classifyClaimPrefix(text: string): "wait" | "safe" | "risky" {
  const normalized = normalize(text);

  if (!normalized) return "wait";
  if (DIRECT_ACTION_CLAIM_PREFIXES.some((pattern) => pattern.test(normalized))) {
    return "risky";
  }

  if (normalized.length < 12 && !/[\s.!?\n]/.test(normalized)) {
    return "wait";
  }

  return "safe";
}

function isSuccessfulMutationToolResult(part: GuardStreamPart): boolean {
  if (part.type !== "tool-result") return false;
  const tr = part as { toolName: string; result: unknown };
  const result = tr.result as Record<string, unknown> | null | undefined;
  return didToolActuallyCompleteAction(
    tr.toolName,
    result?.success === true,
    { result },
  );
}

export function hasSuccessfulMutationToolCall(journal: JournalEntry[]): boolean {
  return journal.some((entry) =>
    didToolActuallyCompleteAction(entry.toolName, entry.success, {
      args: entry.args,
    }),
  );
}

export function looksLikeUnbackedActionClaim(text: string): boolean {
  const normalized = normalize(text);
  return ACTION_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function getUnbackedActionFallback(language: string): string {
  return ACTION_FALLBACKS[language] ?? ACTION_FALLBACKS.en;
}

export function sanitizeUnbackedActionClaim(
  text: string,
  journal: JournalEntry[],
  language: string,
): string {
  if (!text.trim()) return text;
  if (hasSuccessfulMutationToolCall(journal)) return text;
  if (!looksLikeUnbackedActionClaim(text)) return text;
  return getUnbackedActionFallback(language);
}

export function createUnbackedActionClaimTransform(language: string) {
  return () => {
    let sawSuccessfulMutation = false;
    let decided = false;
    let bufferingRiskyPrefix = false;
    let bufferedText = "";
    const bufferedParts: Array<{ type: "text-delta"; textDelta: string }> = [];

    const flushBufferedParts = (controller: TransformStreamDefaultController<GuardStreamPart>) => {
      for (const part of bufferedParts) {
        controller.enqueue(part);
      }
      bufferedParts.length = 0;
      bufferedText = "";
    };

    return new TransformStream<GuardStreamPart, GuardStreamPart>({
      transform(part, controller) {
        if (part.type === "tool-result") {
          if (isSuccessfulMutationToolResult(part)) {
            sawSuccessfulMutation = true;
            if (bufferedParts.length > 0) {
              flushBufferedParts(controller);
            }
          }
          controller.enqueue(part);
          return;
        }

        if (part.type !== "text-delta") {
          controller.enqueue(part);
          return;
        }

        const textPart = part as { type: "text-delta"; textDelta: string };

        if (sawSuccessfulMutation) {
          controller.enqueue(part);
          return;
        }

        if (!decided) {
          bufferedParts.push(textPart);
          bufferedText += textPart.textDelta;

          const prefixState = classifyClaimPrefix(bufferedText);
          if (prefixState === "wait") {
            return;
          }

          decided = true;
          if (prefixState === "risky") {
            bufferingRiskyPrefix = true;
            return;
          }

          flushBufferedParts(controller);
          return;
        }

        if (bufferingRiskyPrefix) {
          bufferedParts.push(textPart);
          bufferedText += textPart.textDelta;
          return;
        }

        controller.enqueue(part);
      },
      flush(controller) {
        if (bufferedParts.length === 0) return;

        if (!sawSuccessfulMutation && looksLikeUnbackedActionClaim(bufferedText)) {
          controller.enqueue({
            type: "text-delta",
            textDelta: getUnbackedActionFallback(language),
          });
          return;
        }

        flushBufferedParts(controller);
      },
    });
  };
}
