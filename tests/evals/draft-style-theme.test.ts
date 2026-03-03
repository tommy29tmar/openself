import { describe, it, expect } from "vitest";

describe("BUG-12: theme preservation on auto-compose", () => {
  it("/api/draft/style auto-compose should check published page for theme", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/app/api/draft/style/route.ts", "utf-8");
    const autoComposeBlock = src.slice(
      src.indexOf("if (!draft)"),
      src.indexOf("const config = {"),
    );
    // Must reference published page to carry forward theme/style
    expect(autoComposeBlock).toMatch(/getPublishedPage|published|draftMeta/i);
  });
});
