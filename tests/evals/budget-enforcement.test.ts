import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DB and dependencies before importing
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => undefined),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => ({ run: vi.fn() })) })) })),
  },
}));

const mockLogEvent = vi.fn();
vi.mock("@/lib/services/event-service", () => ({
  logEvent: (...args: any[]) => mockLogEvent(...args),
}));

describe("checkBudget with hardStop=false", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    // mockReset clears calls AND restores default (no-op) implementation
    mockLogEvent.mockReset();
    for (const key of [
      "LLM_HARD_STOP",
      "LLM_DAILY_COST_HARD_LIMIT_USD",
      "LLM_DAILY_TOKEN_LIMIT",
      "LLM_DAILY_COST_WARNING_USD",
    ]) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("returns allowed=true with exactly one bypassed event when cost exceeds hard limit and hardStop=false", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 100000, outputTokens: 200000, estimatedCostUsd: 5.0 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    expect(result.warningMessage).toContain("$5.00");
    expect(result.warningMessage).toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "budget_warning",
        payload: expect.objectContaining({ level: "hard_limit_bypassed" }),
      }),
    );
  });

  it("returns allowed=true with exactly one bypassed event when tokens exceed limit and hardStop=false", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // cost below hard limit to isolate the token path
          all: vi.fn(() => [{ inputTokens: 3000000, outputTokens: 0, estimatedCostUsd: 0.5 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_TOKEN_LIMIT = "2000000";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    expect(result.warningMessage).toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ level: "hard_limit_bypassed" }),
      }),
    );
  });

  it("emits exactly one event when BOTH cost and token limits are exceeded with hardStop=false", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 3000000, outputTokens: 0, estimatedCostUsd: 5.0 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_TOKEN_LIMIT = "2000000";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    // Cost takes priority
    expect(result.warningMessage).toContain("cost");
    expect(result.warningMessage).toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          level: "hard_limit_bypassed",
          dailyCostUsd: 5.0,
        }),
      }),
    );
  });

  it("returns allowed=true even if logEvent throws during bypass, and does NOT attempt fallback warning log", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 100000, outputTokens: 200000, estimatedCostUsd: 5.0 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    // Make logEvent throw
    mockLogEvent.mockImplementation(() => { throw new Error("DB write failed"); });

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    // Must still allow — logging failure must not block requests
    expect(result.allowed).toBe(true);
    // warningMessage should still be set (set before logEvent call)
    expect(result.warningMessage).toContain("bypassed");
    // logEvent was called once (the bypass attempt that threw) — NOT twice (no fallback warning)
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
  });

  it("returns allowed=false when tokens exceed limit and hardStop=true", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // tokens over limit, cost below hard limit
          all: vi.fn(() => [{ inputTokens: 3000000, outputTokens: 0, estimatedCostUsd: 0.5 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "true";
    process.env.LLM_DAILY_TOKEN_LIMIT = "2000000";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(false);
    expect(result.warningMessage).toContain("token limit reached");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ level: "hard_limit", limitTokens: 2000000 }),
      }),
    );
  });

  it("returns allowed=false when cost exceeds hard limit and hardStop=true", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 100000, outputTokens: 200000, estimatedCostUsd: 5.0 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "true";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(false);
    expect(result.warningMessage).toContain("limit reached");
  });

  it("token bypass suppresses generic cost warning (tokens over + cost between warning and hard limit)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // tokens 3M > 2M limit, cost $1.5 above warning ($1) but below hard limit ($2)
          all: vi.fn(() => [{ inputTokens: 3000000, outputTokens: 0, estimatedCostUsd: 1.5 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_TOKEN_LIMIT = "2000000";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    // Token bypass takes effect — generic cost warning suppressed
    expect(result.warningMessage).toContain("token");
    expect(result.warningMessage).toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ level: "hard_limit_bypassed" }),
      }),
    );
  });

  it("returns allowed=true with normal warning when cost above warning but below hard limit", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ inputTokens: 50000, outputTokens: 10000, estimatedCostUsd: 1.5 }]),
          get: vi.fn(() => undefined),
        })),
      })),
    } as any);

    process.env.LLM_HARD_STOP = "false";
    process.env.LLM_DAILY_COST_WARNING_USD = "1";
    process.env.LLM_DAILY_COST_HARD_LIMIT_USD = "2";

    const { checkBudget } = await import("@/lib/services/usage-service");
    const result = checkBudget();

    expect(result.allowed).toBe(true);
    expect(result.warningMessage).toContain("warning");
    expect(result.warningMessage).not.toContain("bypassed");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ level: "warning" }),
      }),
    );
  });
});

describe("dead code removal — structural", () => {
  it("admin limits route does not expose dead fields", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/app/api/admin/limits/route.ts", "utf-8");
    expect(src).not.toContain("monthlyCostLimitUsd");
    expect(src).not.toContain("heartbeatCallLimit");
  });

  it("admin limits route uses serializeLimits in both GET and PATCH handlers (not just definition)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/app/api/admin/limits/route.ts", "utf-8");
    // Count call sites only — exclude the function definition line
    const callSites = src.match(/[^n]\sserializeLimits\(/g) || [];
    expect(callSites.length).toBeGreaterThanOrEqual(2);
  });

  it("usage-service does not reference LLM_MONTHLY_COST_LIMIT_USD", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/lib/services/usage-service.ts", "utf-8");
    expect(src).not.toContain("LLM_MONTHLY_COST_LIMIT_USD");
    expect(src).not.toContain("monthlyCostLimit");
  });

  it(".env.example does not contain LLM_MONTHLY_COST_LIMIT_USD", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(".env.example", "utf-8");
    expect(src).not.toContain("LLM_MONTHLY_COST_LIMIT_USD");
  });
});
