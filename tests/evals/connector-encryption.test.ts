import { describe, it, expect } from "vitest";
import { encryptCredentials, decryptCredentials } from "@/lib/services/connector-encryption";

describe("connector-encryption", () => {
  // Fixed test key (32 bytes hex = 64 chars)
  const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("round-trip: encrypt then decrypt returns original", () => {
    const original = { access_token: "ghp_abc123", scope: "read:user" };
    const encrypted = encryptCredentials(original, TEST_KEY);
    expect(typeof encrypted).toBe("string");
    expect(encrypted).not.toContain("ghp_abc123"); // must not be plaintext
    const decrypted = decryptCredentials(encrypted, TEST_KEY);
    expect(decrypted).toEqual(original);
  });

  it("different encryptions of same input produce different ciphertexts", () => {
    const original = { token: "test" };
    const a = encryptCredentials(original, TEST_KEY);
    const b = encryptCredentials(original, TEST_KEY);
    expect(a).not.toBe(b); // random IV each time
  });

  it("decryption with wrong key throws", () => {
    const original = { token: "test" };
    const encrypted = encryptCredentials(original, TEST_KEY);
    const wrongKey = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decryptCredentials(encrypted, wrongKey)).toThrow();
  });

  it("includes keyVersion in encrypted payload", () => {
    const original = { token: "test" };
    const encrypted = encryptCredentials(original, TEST_KEY);
    const parsed = JSON.parse(Buffer.from(encrypted, "base64").toString("utf-8"));
    expect(parsed.v).toBe(1);
  });

  it("handles empty object", () => {
    const original = {};
    const encrypted = encryptCredentials(original, TEST_KEY);
    const decrypted = decryptCredentials(encrypted, TEST_KEY);
    expect(decrypted).toEqual({});
  });

  it("handles complex nested objects", () => {
    const original = {
      access_token: "ghp_abc",
      refresh_token: "ghr_xyz",
      expires_at: 1234567890,
      nested: { scope: ["read:user", "repo"] },
    };
    const encrypted = encryptCredentials(original, TEST_KEY);
    const decrypted = decryptCredentials(encrypted, TEST_KEY);
    expect(decrypted).toEqual(original);
  });
});
