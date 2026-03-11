import { db } from "@/lib/db";
import { llmUsageDaily, llmLimits } from "@/lib/db/schema";
import { logEvent } from "@/lib/services/event-service";
import { sql, eq } from "drizzle-orm";

// Cost per 1M tokens (input / output) in USD
const COST_TABLE: Record<string, { input: number; output: number }> = {
  // Google
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  // Anthropic
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  // Ollama (local, free)
  "llama3.3": { input: 0, output: 0 },
};

const DEFAULT_COST = { input: 0.5, output: 1.5 }; // conservative fallback

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = COST_TABLE[model] ?? DEFAULT_COST;
  return (
    (inputTokens / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output
  );
}

export function recordUsage(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): void {
  const day = today();
  const cost = estimateCost(model, inputTokens, outputTokens);

  db.insert(llmUsageDaily)
    .values({
      day,
      provider,
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: cost,
    })
    .onConflictDoUpdate({
      target: [llmUsageDaily.day, llmUsageDaily.provider, llmUsageDaily.model],
      set: {
        inputTokens: sql`${llmUsageDaily.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${llmUsageDaily.outputTokens} + ${outputTokens}`,
        estimatedCostUsd: sql`${llmUsageDaily.estimatedCostUsd} + ${cost}`,
      },
    })
    .run();
}

export type TodayUsage = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export function getTodayUsage(): TodayUsage {
  const day = today();
  const rows = db
    .select({
      inputTokens: llmUsageDaily.inputTokens,
      outputTokens: llmUsageDaily.outputTokens,
      estimatedCostUsd: llmUsageDaily.estimatedCostUsd,
    })
    .from(llmUsageDaily)
    .where(eq(llmUsageDaily.day, day))
    .all();

  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;

  for (const row of rows) {
    totalInput += row.inputTokens ?? 0;
    totalOutput += row.outputTokens ?? 0;
    totalCost += row.estimatedCostUsd ?? 0;
  }

  return {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    estimatedCostUsd: totalCost,
  };
}

function parseEnvInt(key: string): number | undefined {
  const raw = process.env[key];
  return raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : undefined;
}

function parseEnvFloat(key: string): number | undefined {
  const raw = process.env[key];
  return raw && /^\d+(\.\d+)?$/.test(raw) ? parseFloat(raw) : undefined;
}

function parseEnvBool(key: string): boolean | undefined {
  const raw = process.env[key]?.toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
}

function getLimits() {
  const row = db
    .select()
    .from(llmLimits)
    .where(eq(llmLimits.id, "main"))
    .get();

  const envTokenLimit = parseEnvInt("LLM_DAILY_TOKEN_LIMIT");
  const envCostWarning = parseEnvFloat("LLM_DAILY_COST_WARNING_USD");
  const envCostHardLimit = parseEnvFloat("LLM_DAILY_COST_HARD_LIMIT_USD");
  const envHardStop = parseEnvBool("LLM_HARD_STOP");

  // Env vars take precedence over DB, DB is fallback for runtime overrides
  return {
    dailyTokenLimit: envTokenLimit ?? row?.dailyTokenLimit ?? 500_000,
    dailyCostWarningUsd: envCostWarning ?? row?.dailyCostWarningUsd ?? 1.0,
    dailyCostHardLimitUsd: envCostHardLimit ?? row?.dailyCostHardLimitUsd ?? 2.0,
    hardStop: envHardStop ?? row?.hardStop ?? true,
  };
}

export type BudgetResult = {
  allowed: boolean;
  warningMessage?: string;
};

export function checkBudget(): BudgetResult {
  const usage = getTodayUsage();
  const limits = getLimits();

  // --- Determine which hard limits are exceeded ---
  const costExceeded = usage.estimatedCostUsd >= limits.dailyCostHardLimitUsd;
  const tokensExceeded = usage.totalTokens >= limits.dailyTokenLimit;

  // --- Hard stop: block if enabled ---
  // NOTE: logEvent is intentionally NOT wrapped in try/catch here.
  // If logging fails, the error propagates and blocks the request — fail-closed.
  if (limits.hardStop) {
    if (costExceeded) {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "hard_limit",
          dailyCostUsd: usage.estimatedCostUsd,
          limitUsd: limits.dailyCostHardLimitUsd,
        },
      });
      return {
        allowed: false,
        warningMessage: `Daily cost limit reached ($${usage.estimatedCostUsd.toFixed(2)} / $${limits.dailyCostHardLimitUsd.toFixed(2)}). Try again tomorrow.`,
      };
    }
    if (tokensExceeded) {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "hard_limit",
          totalTokens: usage.totalTokens,
          limitTokens: limits.dailyTokenLimit,
        },
      });
      return {
        allowed: false,
        warningMessage: `Daily token limit reached (${usage.totalTokens.toLocaleString()} / ${limits.dailyTokenLimit.toLocaleString()}). Try again tomorrow.`,
      };
    }
  }

  // --- Bypass mode (hardStop=false): log exactly one event, always allow ---
  // CRITICAL: Set warningMessage BEFORE logEvent — if logEvent throws, the message
  // must already be set to prevent fallthrough to the generic warning branch.
  let warningMessage: string | undefined;
  let bypassed = false;

  if (costExceeded) {
    // Cost bypass takes priority — even if tokens are also exceeded, only one event
    warningMessage = `Daily cost limit bypassed (LLM_HARD_STOP=false): $${usage.estimatedCostUsd.toFixed(2)} / $${limits.dailyCostHardLimitUsd.toFixed(2)}.`;
    bypassed = true;
    try {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "hard_limit_bypassed",
          dailyCostUsd: usage.estimatedCostUsd,
          limitUsd: limits.dailyCostHardLimitUsd,
        },
      });
    } catch {
      // Best-effort: logging failure must not block requests
    }
  } else if (tokensExceeded) {
    warningMessage = `Daily token limit bypassed (LLM_HARD_STOP=false): ${usage.totalTokens.toLocaleString()} / ${limits.dailyTokenLimit.toLocaleString()}.`;
    bypassed = true;
    try {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "hard_limit_bypassed",
          totalTokens: usage.totalTokens,
          limitTokens: limits.dailyTokenLimit,
        },
      });
    } catch {
      // Best-effort
    }
  }

  // Warning: daily cost approaching (below hard limit but above warning threshold)
  // Suppressed when a bypass is active — avoid duplicate/misleading logging
  if (!bypassed && usage.estimatedCostUsd >= limits.dailyCostWarningUsd) {
    warningMessage = `Daily cost warning: $${usage.estimatedCostUsd.toFixed(2)} of $${limits.dailyCostHardLimitUsd.toFixed(2)} hard limit used.`;
    try {
      logEvent({
        eventType: "budget_warning",
        actor: "system",
        payload: {
          level: "warning",
          dailyCostUsd: usage.estimatedCostUsd,
          warningUsd: limits.dailyCostWarningUsd,
        },
      });
    } catch {
      // Best-effort
    }
  }

  return { allowed: true, warningMessage };
}
