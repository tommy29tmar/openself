import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("SignupModal — no domain leakage", () => {
  const src = readFileSync(
    join(__dirname, "../../src/components/auth/SignupModal.tsx"),
    "utf-8",
  );

  it("must NOT contain a hardcoded domain in the username preview", () => {
    // The component should show a relative path like /{username}, not openself.dev/{username}
    expect(src).not.toMatch(/openself\.dev\//);
    expect(src).not.toMatch(/openselfweb/i);
  });

  it("should display the username as a relative path", () => {
    // Verify the preview text uses a relative path format
    expect(src).toMatch(/\/{username}/);
  });
});
