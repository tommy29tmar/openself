import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";

describe("Avatar Upload", () => {
  describe("POST /api/media/avatar validation", () => {
    it("rejects files over 2MB", async () => {
      const { POST } = await import("@/app/api/media/avatar/route");
      const oversized = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: "image/jpeg" });
      const form = new FormData();
      form.append("file", oversized, "big.jpg");
      const req = new Request("http://localhost/api/media/avatar", {
        method: "POST",
        body: form,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("FILE_TOO_LARGE");
    });

    it("rejects non-image MIME types", async () => {
      const { processAvatarImage } = await import(
        "@/lib/services/image-utils"
      );
      const buf = Buffer.from("not an image");
      expect(() => processAvatarImage(buf, "application/pdf")).toThrow();
    });

    it("rejects files with mismatched magic bytes", async () => {
      const { processAvatarImage } = await import(
        "@/lib/services/image-utils"
      );
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(() => processAvatarImage(pngBytes, "image/jpeg")).toThrow(
        "MIME mismatch",
      );
    });
  });

  describe("media-service uploadAvatar", () => {
    it("stores avatar and returns media ID", async () => {
      const { uploadAvatar, getMediaById } = await import(
        "@/lib/services/media-service"
      );
      const profileId = `test-avatar-${randomUUID()}`;
      const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // minimal JPEG header
      const id = uploadAvatar(profileId, buf, "image/jpeg");
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
      const media = getMediaById(id);
      expect(media).not.toBeNull();
      expect(media!.mimeType).toBe("image/jpeg");
      expect(media!.data.length).toBeGreaterThan(0);
    });
  });
});
