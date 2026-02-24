import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
vi.mock("@/lib/db", () => {
  const rows = new Map<string, any>();
  return {
    db: {
      insert: () => ({
        values: (v: any) => ({
          run: () => { rows.set(v.id ?? v.email, v); },
          onConflictDoNothing: () => ({ run: () => {} }),
          onConflictDoUpdate: () => ({ run: () => {} }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            get: () => null,
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            run: () => {},
          }),
        }),
      }),
    },
    sqlite: {},
  };
});

vi.mock("@/lib/db/schema", () => ({
  users: { id: "id", email: "email" },
  profiles: { id: "id", userId: "user_id" },
  sessions: { id: "id" },
}));

import { hashPassword, verifyPassword } from "@/lib/services/auth-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth-service password hashing", () => {
  it("hashes and verifies a password correctly", async () => {
    const password = "test-password-123";
    const hashed = await hashPassword(password);

    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(password);
    expect(hashed.length).toBeGreaterThan(20);

    const isValid = await verifyPassword(hashed, password);
    expect(isValid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hashed = await hashPassword("correct-password");
    const isValid = await verifyPassword(hashed, "wrong-password");
    expect(isValid).toBe(false);
  });

  it("produces different hashes for same password (salt)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });
});
