import { vi } from "vitest";

/**
 * Creates a mock for Drizzle's `db.select()` chain that returns `value` from `.get()`.
 * Replaces the deeply nested one-liner: `vi.fn(() => ({ from: vi.fn(() => ({ ... })) }))`.
 */
export function mockDrizzleSelect(value: unknown = undefined) {
  return vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(() => value),
          })),
        })),
        get: vi.fn(() => value),
        all: vi.fn(() => (Array.isArray(value) ? value : [])),
      })),
    })),
  }));
}
