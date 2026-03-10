import { describe, it, expect } from "vitest";

describe("onStepFinish reasoning logging", () => {
  it("tracks step index across all steps (including those without reasoning)", () => {
    const logs: Array<{ stepIndex: number; reasoning: string; finishReason: string }> = [];
    let stepCounter = 0;

    const onStepFinish = (stepResult: { reasoning?: string; finishReason: string }) => {
      if (stepResult.reasoning) {
        logs.push({
          stepIndex: stepCounter,
          reasoning: stepResult.reasoning,
          finishReason: stepResult.finishReason,
        });
      }
      stepCounter++;
    };

    // Step 0: tool call with reasoning
    onStepFinish({ reasoning: "I need to create a fact", finishReason: "tool-calls" });
    // Step 1: text response without reasoning
    onStepFinish({ finishReason: "stop" });
    // Step 2: another tool call with reasoning
    onStepFinish({ reasoning: "Now regenerate the page", finishReason: "tool-calls" });

    expect(logs).toHaveLength(2);
    expect(logs[0].stepIndex).toBe(0);
    expect(logs[0].reasoning).toBe("I need to create a fact");
    expect(logs[1].stepIndex).toBe(2);
    expect(logs[1].reasoning).toBe("Now regenerate the page");
    expect(stepCounter).toBe(3);
  });
});
