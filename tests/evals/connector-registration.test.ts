import { describe, it, expect } from "vitest";
import { getConnector } from "@/lib/connectors/registry";

// Top-level import triggers registration as ESM side-effect
import "@/lib/connectors/register-all";

describe("connector registration", () => {
  it("registers github connector with sync support", () => {
    const gh = getConnector("github");
    expect(gh).toBeDefined();
    expect(gh!.type).toBe("github");
    expect(gh!.supportsSync).toBe(true);
    expect(gh!.supportsImport).toBe(false);
  });

  it("registers linkedin_zip connector with import support", () => {
    const li = getConnector("linkedin_zip");
    expect(li).toBeDefined();
    expect(li!.type).toBe("linkedin_zip");
    expect(li!.supportsSync).toBe(false);
    expect(li!.supportsImport).toBe(true);
  });
});
