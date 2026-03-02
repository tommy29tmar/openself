import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, sqlite } from "@/lib/db";
import { connectors } from "@/lib/db/schema";
import {
  encryptCredentials,
  decryptCredentials,
} from "@/lib/services/connector-encryption";
import type { ConnectorStatus } from "./types";

function getEncryptionKey(): string {
  const key = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "CONNECTOR_ENCRYPTION_KEY env var is required for connector credential operations",
    );
  }
  return key;
}

/**
 * Create or reconnect a connector.
 * Wrapped in sqlite.transaction for atomicity (UPDATE-first/INSERT-fallback).
 * Cannot use ON CONFLICT because the unique index is PARTIAL (WHERE owner_key IS NOT NULL).
 */
export function createConnector(
  ownerKey: string,
  connectorType: string,
  rawCredentials: Record<string, unknown>,
  config?: Record<string, unknown>,
) {
  const key = getEncryptionKey();
  const encrypted = encryptCredentials(rawCredentials, key);
  const now = new Date().toISOString();

  return sqlite.transaction(() => {
    // Try to reactivate existing row (handles reconnect after disconnect)
    const existing = db
      .select()
      .from(connectors)
      .where(
        and(
          eq(connectors.ownerKey, ownerKey),
          eq(connectors.connectorType, connectorType),
        ),
      )
      .get();

    if (existing) {
      db.update(connectors)
        .set({
          credentials: encrypted,
          status: "connected",
          enabled: true,
          lastError: null,
          updatedAt: now,
          ...(config !== undefined ? { config } : {}),
        })
        .where(eq(connectors.id, existing.id))
        .run();

      return db
        .select()
        .from(connectors)
        .where(eq(connectors.id, existing.id))
        .get()!;
    }

    // No existing row → insert new
    const id = randomUUID();
    db.insert(connectors)
      .values({
        id,
        ownerKey,
        connectorType,
        credentials: encrypted,
        config: config ?? null,
        status: "connected",
        enabled: true,
        updatedAt: now,
      })
      .run();

    return db.select().from(connectors).where(eq(connectors.id, id)).get()!;
  })();
}

/**
 * Get a connector by ID (for ownership verification). Returns null if not found.
 */
export function getConnectorById(connectorId: string) {
  return db.select().from(connectors).where(eq(connectors.id, connectorId)).get() ?? null;
}

/**
 * Disconnect a connector: set status to "disconnected" and clear credentials.
 * Facts are NOT deleted (they belong to the user).
 */
export function disconnectConnector(connectorId: string): void {
  db.update(connectors)
    .set({
      status: "disconnected",
      credentials: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(connectors.id, connectorId))
    .run();
}

/**
 * Get all connectors for an owner (WITHOUT decrypted credentials).
 */
export function getConnectorStatus(ownerKey: string) {
  return db
    .select({
      id: connectors.id,
      connectorType: connectors.connectorType,
      status: connectors.status,
      enabled: connectors.enabled,
      lastSync: connectors.lastSync,
      lastError: connectors.lastError,
      createdAt: connectors.createdAt,
      updatedAt: connectors.updatedAt,
    })
    .from(connectors)
    .where(eq(connectors.ownerKey, ownerKey))
    .all();
}

/**
 * Get active connectors: status IN ("connected", "error") AND enabled = true.
 * "error" connectors are still active (will retry on next sync).
 */
export function getActiveConnectors(ownerKey: string) {
  return db
    .select()
    .from(connectors)
    .where(
      and(
        eq(connectors.ownerKey, ownerKey),
        inArray(connectors.status, ["connected", "error"]),
        eq(connectors.enabled, true),
      ),
    )
    .all();
}

/**
 * Get a single connector WITH decrypted credentials (for sync handler only).
 */
export function getConnectorWithCredentials(connectorId: string) {
  const row = db
    .select()
    .from(connectors)
    .where(eq(connectors.id, connectorId))
    .get();

  if (!row || !row.credentials) return null;

  const key = getEncryptionKey();
  return {
    ...row,
    decryptedCredentials: decryptCredentials(
      row.credentials as string,
      key,
    ),
  };
}

/**
 * Update connector status and optional last_error.
 */
export function updateConnectorStatus(
  connectorId: string,
  status: ConnectorStatus,
  lastError?: string,
): void {
  db.update(connectors)
    .set({
      status,
      lastError: lastError ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(connectors.id, connectorId))
    .run();
}
