import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockResolveOwnerScope = vi.fn();
const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: (...args: unknown[]) => mockResolveOwnerScope(...args),
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockImportLinkedInZip = vi.fn().mockResolvedValue({
  factsWritten: 5,
  factsSkipped: 0,
  errors: [],
});
vi.mock("@/lib/connectors/linkedin-zip/import", () => ({
  importLinkedInZip: (...args: unknown[]) => mockImportLinkedInZip(...args),
}));

const mockGetFactLanguage = vi.fn().mockReturnValue("en");
vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: (...args: unknown[]) => mockGetFactLanguage(...args),
}));

vi.mock("@/lib/db", () => ({ db: {}, sqlite: {} }));

const mockWriteImportEvent = vi.fn();
vi.mock("@/lib/connectors/import-event", () => ({
  writeImportEvent: (...args: unknown[]) => mockWriteImportEvent(...args),
}));

const ownerScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgePrimaryKey: "sess-1",
  knowledgeReadKeys: ["sess-1"],
  currentSessionId: "sess-1",
};

function createUploadRequest(file?: File): Request {
  const formData = new FormData();
  if (file) formData.append("file", file);

  return new Request("http://localhost/api/connectors/linkedin-zip/import", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/connectors/linkedin-zip/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockImportLinkedInZip.mockResolvedValue({
      factsWritten: 5,
      factsSkipped: 0,
      errors: [],
    });
  });

  it("returns 403 when no auth", async () => {
    mockResolveOwnerScope.mockReturnValue(null);

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    const res = await POST(createUploadRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("returns 400 when no file uploaded", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    const res = await POST(createUploadRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("NO_FILE");
  });

  it("returns 400 when file is not a ZIP", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });

    const file = new File(["hello"], "readme.txt", {
      type: "text/plain",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    const res = await POST(createUploadRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("INVALID_FORMAT");
  });

  it("returns 200 with report for valid ZIP upload", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });

    const file = new File([new Uint8Array(100)], "export.zip", {
      type: "application/zip",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    const res = await POST(createUploadRequest(file));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report).toEqual({
      factsWritten: 5,
      factsSkipped: 0,
      errors: [],
    });
    expect(mockImportLinkedInZip).toHaveBeenCalledOnce();
    expect(mockImportLinkedInZip).toHaveBeenCalledWith(
      expect.any(Buffer),
      ownerScope,
      "alice",
      "en",
    );
  });

  it("uses authCtx.username when available", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "bob" });

    const file = new File([new Uint8Array(50)], "data.zip", {
      type: "application/zip",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    await POST(createUploadRequest(file));

    expect(mockImportLinkedInZip).toHaveBeenCalledWith(
      expect.any(Buffer),
      ownerScope,
      "bob",
      "en",
    );
  });

  it("falls back to __default__ when no authCtx", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue(null);

    const file = new File([new Uint8Array(50)], "data.zip", {
      type: "application/zip",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    await POST(createUploadRequest(file));

    expect(mockImportLinkedInZip).toHaveBeenCalledWith(
      expect.any(Buffer),
      ownerScope,
      "__default__",
      "en",
    );
  });

  it("uses stored factLanguage from preferences", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });
    mockGetFactLanguage.mockReturnValue("it");

    const file = new File([new Uint8Array(50)], "data.zip", {
      type: "application/zip",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    await POST(createUploadRequest(file));

    expect(mockImportLinkedInZip).toHaveBeenCalledWith(
      expect.any(Buffer),
      ownerScope,
      "alice",
      "it",
    );
  });

  it("falls back to en when getFactLanguage returns null", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });
    mockGetFactLanguage.mockReturnValue(null);

    const file = new File([new Uint8Array(50)], "data.zip", {
      type: "application/zip",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    await POST(createUploadRequest(file));

    expect(mockImportLinkedInZip).toHaveBeenCalledWith(
      expect.any(Buffer),
      ownerScope,
      "alice",
      "en",
    );
  });

  it("returns 500 when importLinkedInZip throws", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });
    mockImportLinkedInZip.mockRejectedValue(new Error("corrupt data"));

    const file = new File([new Uint8Array(50)], "data.zip", {
      type: "application/zip",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    const res = await POST(createUploadRequest(file));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("IMPORT_FAILED");
    expect(body.error).toBe("corrupt data");
  });

  it("accepts file with .zip extension even without application/zip mime", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });

    // File with .zip extension but octet-stream type
    const file = new File([new Uint8Array(50)], "linkedin-export.zip", {
      type: "application/octet-stream",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    const res = await POST(createUploadRequest(file));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("accepts file with application/zip mime even without .zip extension", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });

    // File without .zip extension but with correct mime type
    const file = new File([new Uint8Array(50)], "archive", {
      type: "application/zip",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    const res = await POST(createUploadRequest(file));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("writes import event flag on successful import", async () => {
    mockResolveOwnerScope.mockReturnValue(ownerScope);
    mockGetAuthContext.mockReturnValue({ username: "alice" });

    const file = new File([new Uint8Array(100)], "export.zip", {
      type: "application/zip",
    });

    const { POST } = await import(
      "@/app/api/connectors/linkedin-zip/import/route"
    );
    await POST(createUploadRequest(file));
    expect(mockWriteImportEvent).toHaveBeenCalledWith("sess-1", 5);
  });
});
