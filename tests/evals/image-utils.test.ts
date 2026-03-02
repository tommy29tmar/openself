import { describe, it, expect } from "vitest";

describe("image-utils", () => {
  describe("detectMimeFromMagicBytes", () => {
    it("detects JPEG from magic bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);
      expect(detectMimeFromMagicBytes(jpeg)).toBe("image/jpeg");
    });

    it("detects PNG from magic bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectMimeFromMagicBytes(png)).toBe("image/png");
    });

    it("detects WebP from magic bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      // RIFF....WEBP
      const webp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
        0x50,
      ]);
      expect(detectMimeFromMagicBytes(webp)).toBe("image/webp");
    });

    it("detects GIF from magic bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(detectMimeFromMagicBytes(gif)).toBe("image/gif");
    });

    it("returns null for unknown bytes", async () => {
      const { detectMimeFromMagicBytes } = await import(
        "@/lib/services/image-utils"
      );
      const unknown = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(detectMimeFromMagicBytes(unknown)).toBeNull();
    });
  });

  describe("stripExifFromJpeg", () => {
    it("strips APP1 (EXIF) markers from JPEG", async () => {
      const { stripExifFromJpeg } = await import(
        "@/lib/services/image-utils"
      );
      // Minimal JPEG with an APP1 marker
      // SOI(FFD8) + APP1(FFE1 + length 0008 + "Exif\0\0") + SOS(FFDA) + EOI(FFD9)
      const app1Payload = Buffer.from("Exif\x00\x00", "binary");
      const app1Length = Buffer.alloc(2);
      app1Length.writeUInt16BE(app1Payload.length + 2);

      const jpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([0xff, 0xe1]), // APP1 marker
        app1Length,
        app1Payload,
        Buffer.from([0xff, 0xda]), // SOS
        Buffer.from([0x00]),       // dummy scan data
        Buffer.from([0xff, 0xd9]), // EOI
      ]);

      const stripped = stripExifFromJpeg(jpeg);
      // Should not contain APP1 marker (FFE1)
      expect(stripped.includes(Buffer.from([0xff, 0xe1]))).toBe(false);
      // Should still start with SOI
      expect(stripped[0]).toBe(0xff);
      expect(stripped[1]).toBe(0xd8);
    });

    it("returns JPEG unchanged if no EXIF present", async () => {
      const { stripExifFromJpeg } = await import(
        "@/lib/services/image-utils"
      );
      // Minimal JPEG: SOI + SOS + EOI
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0xff, 0xd9]);
      const stripped = stripExifFromJpeg(jpeg);
      expect(stripped).toEqual(jpeg);
    });
  });
});
