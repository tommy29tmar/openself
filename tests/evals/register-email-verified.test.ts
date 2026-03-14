import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("registration email verification", () => {
  it("should set emailVerified=1 in /api/register route", () => {
    const code = readFileSync("src/app/api/register/route.ts", "utf-8");
    expect(code).toMatch(/emailVerified:\s*1/);
  });

  it("should set emailVerified=1 in createUser (auth-service)", () => {
    const code = readFileSync("src/lib/services/auth-service.ts", "utf-8");
    expect(code).toMatch(/emailVerified:\s*1/);
  });
});
