import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const KEY_VERSION = 1;

/**
 * Encrypt a credentials object using AES-256-GCM.
 * Returns a base64-encoded JSON envelope: { v, iv, data, tag }
 */
export function encryptCredentials(
  data: Record<string, unknown>,
  hexKey: string,
): string {
  const key = Buffer.from(hexKey, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const envelope = {
    v: KEY_VERSION,
    iv: iv.toString("base64"),
    data: encrypted.toString("base64"),
    tag: tag.toString("base64"),
  };

  return Buffer.from(JSON.stringify(envelope), "utf-8").toString("base64");
}

/**
 * Decrypt AES-256-GCM encrypted credentials.
 * Expects a base64-encoded JSON envelope from encryptCredentials().
 */
export function decryptCredentials(
  encrypted: string,
  hexKey: string,
): Record<string, unknown> {
  const envelope = JSON.parse(
    Buffer.from(encrypted, "base64").toString("utf-8"),
  );

  const key = Buffer.from(hexKey, "hex");
  const iv = Buffer.from(envelope.iv, "base64");
  const data = Buffer.from(envelope.data, "base64");
  const tag = Buffer.from(envelope.tag, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString("utf-8"));
}
