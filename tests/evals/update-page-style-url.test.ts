import { describe, it, expect } from "vitest";

describe("update_page_style URL construction", () => {
  it("constructs absolute URL for server-side fetch", () => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = new URL("/api/draft/style", baseUrl);
    expect(url.href).toMatch(/^https?:\/\/.+\/api\/draft\/style$/);
  });

  it("falls back to localhost:3000 when no env var set", () => {
    const saved = process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = new URL("/api/draft/style", baseUrl);
    expect(url.href).toBe("http://localhost:3000/api/draft/style");
    if (saved) process.env.NEXT_PUBLIC_BASE_URL = saved;
  });
});
