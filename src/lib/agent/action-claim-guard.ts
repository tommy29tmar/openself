type JournalEntry = {
  toolName: string;
  success: boolean;
};

type GuardStreamPart =
  | { type: "text-delta"; textDelta: string }
  | { type: "tool-result"; toolName: string; result: unknown }
  | { type: string; [key: string]: unknown };

const MUTATING_TOOL_NAMES = new Set([
  "create_fact",
  "batch_facts",
  "update_fact",
  "delete_fact",
  "update_page_style",
  "reorder_sections",
  "move_section",
  "generate_page",
  "request_publish",
  "propose_soul_change",
  "review_soul_proposal",
  "record_event",
  "confirm_episodic_pattern",
  "save_memory",
  "set_layout",
  "propose_lock",
  "resolve_conflict",
  "set_fact_visibility",
  "archive_fact",
  "unarchive_fact",
  "reorder_items",
]);

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
    .toLowerCase();
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
  if (!MUTATING_TOOL_NAMES.has(part.toolName)) return false;

  const result = part.result as { success?: boolean } | null | undefined;
  return result?.success !== false;
}

export function hasSuccessfulMutationToolCall(journal: JournalEntry[]): boolean {
  return journal.some((entry) => entry.success && MUTATING_TOOL_NAMES.has(entry.toolName));
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

        if (sawSuccessfulMutation) {
          controller.enqueue(part);
          return;
        }

        if (!decided) {
          bufferedParts.push(part);
          bufferedText += part.textDelta;

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
          bufferedParts.push(part);
          bufferedText += part.textDelta;
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
