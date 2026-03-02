import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";

describe("Avatar Composer Wiring", () => {
  let uniqueProfileId: string;

  beforeEach(() => {
    uniqueProfileId = `test-composer-${randomUUID()}`;
  });

  it("getProfileAvatar returns media ID when avatar exists", async () => {
    const { uploadAvatar, getProfileAvatar } = await import(
      "@/lib/services/media-service"
    );
    const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const id = uploadAvatar(uniqueProfileId, buf, "image/jpeg");
    const result = getProfileAvatar(uniqueProfileId);
    expect(result).toBe(id);
  });

  it("getProfileAvatar returns null when no avatar", async () => {
    const { getProfileAvatar } = await import(
      "@/lib/services/media-service"
    );
    expect(getProfileAvatar(uniqueProfileId)).toBeNull();
  });
});
