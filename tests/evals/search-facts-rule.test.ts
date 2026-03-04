import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) }}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { returningNoPagePolicy } from "@/lib/agent/policies/returning-no-page";
import { planningProtocol } from "@/lib/agent/policies/planning-protocol";
import { memoryUsageDirectives } from "@/lib/agent/policies/memory-directives";

describe("search_facts rule embedding", () => {
  it("returningNoPagePolicy contains the unified search_facts rule", () => {
    expect(returningNoPagePolicy("en")).toContain("WHEN TO CALL search_facts");
  });
  it("planningProtocol contains the unified search_facts rule", () => {
    expect(planningProtocol()).toContain("WHEN TO CALL search_facts");
  });
  it("memoryUsageDirectives contains the unified search_facts rule", () => {
    expect(memoryUsageDirectives()).toContain("WHEN TO CALL search_facts");
  });
  it("none of them contain 'BEFORE every question'", () => {
    for (const text of [returningNoPagePolicy("en"), planningProtocol(), memoryUsageDirectives()]) {
      expect(text).not.toContain("BEFORE every question");
    }
  });
  it("none of them contain 'ALWAYS use search_facts before asking'", () => {
    for (const text of [returningNoPagePolicy("en"), planningProtocol(), memoryUsageDirectives()]) {
      expect(text).not.toContain("ALWAYS use search_facts before asking");
    }
  });
});
