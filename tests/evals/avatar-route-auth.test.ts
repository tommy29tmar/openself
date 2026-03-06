import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveOwnerScope = vi.fn();
const mockGetAuthContext = vi.fn();
const mockIsMultiUserEnabled = vi.fn();
const mockUploadAvatar = vi.fn();
const mockProcessAvatarImage = vi.fn();
const mockDeleteRun = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: (...args: any[]) => mockResolveOwnerScope(...args),
  getAuthContext: (...args: any[]) => mockGetAuthContext(...args),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: (...args: any[]) => mockIsMultiUserEnabled(...args),
}));

vi.mock("@/lib/services/media-service", () => ({
  uploadAvatar: (...args: any[]) => mockUploadAvatar(...args),
}));

vi.mock("@/lib/services/image-utils", () => ({
  processAvatarImage: (...args: any[]) => mockProcessAvatarImage(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        run: (...args: any[]) => mockDeleteRun(...args),
      })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  mediaAssets: { profileId: "profileId", kind: "kind" },
}));

function makeImageFormRequest(method: "POST" | "DELETE" = "POST") {
  const form = new FormData();
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  form.append("file", new File([jpegBytes], "avatar.jpg", { type: "image/jpeg" }));

  return new Request("http://localhost/api/media/avatar", {
    method,
    body: method === "POST" ? form : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsMultiUserEnabled.mockReturnValue(true);
  mockResolveOwnerScope.mockReturnValue({
    cognitiveOwnerKey: "profile-1",
    knowledgeReadKeys: ["sess-1"],
    knowledgePrimaryKey: "sess-1",
    currentSessionId: "sess-1",
  });
  mockGetAuthContext.mockReturnValue({
    sessionId: "sess-1",
    profileId: "profile-1",
    userId: null,
    username: null,
  });
  mockProcessAvatarImage.mockReturnValue({
    data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    mimeType: "image/jpeg",
  });
  mockUploadAvatar.mockReturnValue("media-1");
  mockDeleteRun.mockReturnValue(undefined);
});

describe("avatar route auth gating", () => {
  it("rejects anonymous multi-user sessions even when owner scope exists", async () => {
    const { POST, DELETE } = await import("@/app/api/media/avatar/route");

    const postRes = await POST(makeImageFormRequest("POST"));
    expect(postRes.status).toBe(403);
    expect(await postRes.json()).toEqual(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );

    const deleteRes = await DELETE(makeImageFormRequest("DELETE"));
    expect(deleteRes.status).toBe(403);
    expect(await deleteRes.json()).toEqual(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );

    expect(mockUploadAvatar).not.toHaveBeenCalled();
  });

  it("accepts legacy username-only sessions and writes avatar to the authenticated profile", async () => {
    mockGetAuthContext.mockReturnValue({
      sessionId: "sess-1",
      profileId: "profile-legacy",
      userId: null,
      username: "tommaso",
    });

    const { POST } = await import("@/app/api/media/avatar/route");
    const res = await POST(makeImageFormRequest("POST"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        id: "media-1",
      }),
    );
    expect(mockUploadAvatar).toHaveBeenCalledWith(
      "profile-legacy",
      expect.any(Buffer),
      "image/jpeg",
    );
  });
});
