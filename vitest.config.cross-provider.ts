import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Dedicated vitest config for cross-provider eval tests.
 *
 * These tests call real LLMs and are therefore:
 * - Slow (5-30s per scenario)
 * - Expensive (API costs)
 * - Non-deterministic (LLM output varies)
 *
 * Run explicitly:
 *   npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
 *
 * Run for a single provider:
 *   AI_PROVIDER=anthropic npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/evals/cross-provider/**/*.eval.ts"],
    testTimeout: 60_000, // 60s per test — LLM calls are slow
    hookTimeout: 30_000,
    // Run sequentially to avoid rate limits
    sequence: {
      concurrent: false,
    },
  },
});
