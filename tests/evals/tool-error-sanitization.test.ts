import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("tool error messages", () => {
  const toolsCode = readFileSync("src/lib/agent/tools.ts", "utf-8");
  const kbCode = readFileSync("src/lib/services/kb-service.ts", "utf-8");
  const toolNames = ["delete_fact", "create_fact", "batch_facts", "set_page_style", "generate_page", "search_facts"];

  it("should not contain raw tool names in message: or hint: fields", () => {
    const lines = toolsCode.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("message:") || line.startsWith("hint:")) {
        for (const toolName of toolNames) {
          expect(
            line.includes(toolName),
            `Line ${i + 1} contains "${toolName}": ${line.substring(0, 100)}`
          ).toBe(false);
        }
      }
    }
  });

  it("should not expose factId interpolations in messages", () => {
    expect(toolsCode).not.toMatch(/message:\s*`[^`]*\$\{factId\}/);
  });

  it("should not contain internal path references in kb-service error messages", () => {
    expect(kbCode).not.toMatch(/Fact\s+\w+\/\$\{input\.key\}/);
  });
});
