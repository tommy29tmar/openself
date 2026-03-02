/**
 * Confirmation service — Layer 0 (semantic pre-check) + helpers for the
 * 4-layer confirmation system that protects identity overwrites and bulk deletes.
 *
 * Layer 0: Runs in chat route BEFORE createAgentTools.
 *          Clears stale pending confirmations when the user's message is NOT confirmatory.
 * Layer 1: Intra-turn latch (closure in createAgentTools).
 * Layer 2: Cross-turn pending state (session metadata).
 * Layer 3: TTL (5 minutes).
 */

import { createHash } from "crypto";
import { getSessionMeta, mergeSessionMeta } from "./session-metadata";

// ---------------------------------------------------------------------------
// Confirmatory message detection
// ---------------------------------------------------------------------------

// Start-anchored: allows trailing text like "Sì, cambia il nome".
// Messages > 100 chars are rejected (too long = new topic).
// Use (?=[\s,!.?;:。、！？；：」』]|$) instead of \b — word boundaries fail on non-ASCII (CJK, accented).
const B = "(?=[\\s,!.?;:\u3002\u3001\uFF01\uFF1F\uFF1B\uFF1A\u300D\u300F]|$)"; // boundary lookahead (incl. CJK punctuation)
const CONFIRMATORY_RE: Record<string, RegExp> = {
  en: new RegExp(`^(yes|yeah|yep|ok|okay|sure|confirm(?:ed)?|go ahead|do it|approved?|right|correct)${B}`, "i"),
  it: new RegExp(`^(s[iì]|ok|okay|va bene|confermo|vai|fallo|d'accordo|certo|esatto|procedi)${B}`, "i"),
  de: new RegExp(`^(ja|ok|okay|bestätig[et]?|mach|richtig|genau|einverstanden)${B}`, "i"),
  fr: new RegExp(`^(oui|ok|okay|confirme[rz]?|vas-y|d'accord|c'est bon|exact)${B}`, "i"),
  es: new RegExp(`^(s[ií]|ok|okay|confirmo|dale|hazlo|de acuerdo|correcto)${B}`, "i"),
  pt: new RegExp(`^(sim|ok|okay|confirmo|vai|faz|de acordo|certo|exato)${B}`, "i"),
  ja: new RegExp(`^(はい|うん|ok|okay|確認|いいよ|そうだ)${B}`, "i"),
  zh: new RegExp(`^(是的?|好的?|ok|okay|确认|对|没问题)${B}`, "i"),
};

export function isConfirmatoryMessage(text: string | null, language: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return false;
  const pattern = CONFIRMATORY_RE[language] ?? CONFIRMATORY_RE.en;
  return pattern.test(trimmed);
}

// ---------------------------------------------------------------------------
// Value hashing (canonical JSON for determinism)
// ---------------------------------------------------------------------------

/** Canonical JSON: keys sorted recursively, deterministic output. */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const sorted = Object.keys(obj).sort();
  return "{" + sorted.map(k => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

/** Truncated SHA-256 of canonical JSON representation. */
export function hashValue(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Pending confirmation types
// ---------------------------------------------------------------------------

export type PendingConfirmation = {
  id: string;
  type: "identity_overwrite" | "bulk_delete";
  category?: string;
  key?: string;
  valueHash?: string;
  factIds?: string[];
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Layer 0: Semantic pre-check (chat route)
// ---------------------------------------------------------------------------

/**
 * Called in chat route BEFORE createAgentTools.
 * If pending confirmations exist and user's message is NOT confirmatory → clear all.
 */
export function pruneUnconfirmedPendings(
  sessionId: string,
  lastUserMessage: string | null,
  language: string,
): void {
  const meta = getSessionMeta(sessionId);
  const pendings = meta?.pendingConfirmations;
  if (!Array.isArray(pendings) || pendings.length === 0) return;

  if (!isConfirmatoryMessage(lastUserMessage, language)) {
    // User didn't confirm → discard all pending confirmations
    mergeSessionMeta(sessionId, { pendingConfirmations: null });
  }
  // If confirmatory → leave pendings intact for the gate to consume
}
