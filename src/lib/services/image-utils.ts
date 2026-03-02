/**
 * Lightweight image utilities: magic bytes detection + JPEG EXIF stripping.
 * No external dependencies (no sharp).
 */

const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: RIFF....WEBP
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
];

const WEBP_MARKER = Buffer.from("WEBP");

export function detectMimeFromMagicBytes(data: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (data.length < offset + sig.bytes.length) continue;
    const match = sig.bytes.every((b, i) => data[offset + i] === b);
    if (match) {
      // WebP needs secondary check at offset 8
      if (sig.mime === "image/webp") {
        if (data.length >= 12 && data.subarray(8, 12).equals(WEBP_MARKER)) {
          return "image/webp";
        }
        continue;
      }
      return sig.mime;
    }
  }
  return null;
}

/**
 * Strip EXIF (APP1 = 0xFFE1) markers from JPEG data.
 * Preserves all other markers and image data.
 * Returns the buffer unchanged if no APP1 markers found.
 */
export function stripExifFromJpeg(data: Buffer): Buffer {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return data; // Not a JPEG
  }

  const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])]; // SOI
  let pos = 2;

  while (pos < data.length - 1) {
    // Not a marker
    if (data[pos] !== 0xff) {
      // We've hit scan data — copy the rest verbatim
      chunks.push(data.subarray(pos));
      break;
    }

    const marker = data[pos + 1];

    // SOS (0xDA) — everything after is scan data, copy verbatim
    if (marker === 0xda) {
      chunks.push(data.subarray(pos));
      break;
    }

    // EOI
    if (marker === 0xd9) {
      chunks.push(data.subarray(pos, pos + 2));
      break;
    }

    // Markers with length field (anything from 0xC0 to 0xFE except RST0-7)
    if (pos + 3 >= data.length) break;
    const segLen = data.readUInt16BE(pos + 2);

    // APP1 (0xE1) — skip it (this is EXIF/XMP)
    if (marker === 0xe1) {
      pos += 2 + segLen;
      continue;
    }

    // Keep all other markers
    chunks.push(data.subarray(pos, pos + 2 + segLen));
    pos += 2 + segLen;
  }

  return Buffer.concat(chunks);
}

/**
 * Process image data: validate magic bytes, strip EXIF if JPEG.
 * Returns { data, mimeType } or throws on invalid.
 */
export function processAvatarImage(
  data: Buffer,
  declaredMime: string,
): { data: Buffer; mimeType: string } {
  const detectedMime = detectMimeFromMagicBytes(data);
  if (!detectedMime) {
    throw new Error("Could not detect image format from file contents");
  }

  // Detected MIME must match declared (prevent content-type spoofing)
  if (detectedMime !== declaredMime) {
    throw new Error(
      `MIME mismatch: header says ${declaredMime}, content is ${detectedMime}`,
    );
  }

  // Strip EXIF from JPEG
  const processed =
    detectedMime === "image/jpeg" ? stripExifFromJpeg(data) : data;

  return { data: processed, mimeType: detectedMime };
}
