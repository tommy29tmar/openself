import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchProfile,
  fetchRepos,
  fetchRepoLanguages,
  GitHubAuthError,
} from "@/lib/connectors/github/client";

// ── Helpers ──────────────────────────────────────────────────────────

const TOKEN = "ghp_test_token_123";

function mockResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(headers),
  } as unknown as Response;
}

function sampleProfile() {
  return {
    login: "octocat",
    html_url: "https://github.com/octocat",
    bio: "I love coding",
    company: "GitHub",
    location: "San Francisco",
    blog: "https://octocat.dev",
    twitter_username: "octocat",
    name: "The Octocat",
  };
}

function sampleRepo(overrides: Record<string, unknown> = {}) {
  return {
    node_id: "MDEwOlJlcG9zaXRvcnkx",
    name: "hello-world",
    full_name: "octocat/hello-world",
    description: "A hello-world repo",
    html_url: "https://github.com/octocat/hello-world",
    language: "TypeScript",
    archived: false,
    fork: false,
    pushed_at: "2025-01-15T10:30:00Z",
    stargazers_count: 42,
    ...overrides,
  };
}

// ── Setup / Teardown ─────────────────────────────────────────────────

const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("github-client", () => {
  describe("fetchProfile", () => {
    it("returns parsed user data from GitHub /user endpoint", async () => {
      const profile = sampleProfile();
      mockFetch.mockResolvedValueOnce(mockResponse(profile));

      const result = await fetchProfile(TOKEN);

      expect(result).toEqual(profile);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.github.com/user");
      expect((init as RequestInit).headers).toEqual(
        expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github+json",
        }),
      );
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 500));

      await expect(fetchProfile(TOKEN)).rejects.toThrow("GitHub API error: 500");
    });
  });

  describe("fetchRepos", () => {
    it("returns array of repos from a single page (no Link header)", async () => {
      const repos = [sampleRepo(), sampleRepo({ name: "repo-2", node_id: "node2" })];
      mockFetch.mockResolvedValueOnce(mockResponse(repos));

      const result = await fetchRepos(TOKEN);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("hello-world");
      expect(result[1].name).toBe("repo-2");
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("paginates when Link header contains rel=\"next\"", async () => {
      const page1 = [sampleRepo({ name: "repo-1", node_id: "n1" })];
      const page2 = [sampleRepo({ name: "repo-2", node_id: "n2" })];

      // Page 1 — has next link
      mockFetch.mockResolvedValueOnce(
        mockResponse(page1, 200, {
          Link: '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=2>; rel="last"',
        }),
      );
      // Page 2 — no next link
      mockFetch.mockResolvedValueOnce(mockResponse(page2));

      const result = await fetchRepos(TOKEN);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("repo-1");
      expect(result[1].name).toBe("repo-2");
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify second call used the URL from Link header
      const [secondUrl] = mockFetch.mock.calls[1];
      expect(secondUrl).toBe("https://api.github.com/user/repos?page=2");
    });

    it("stops pagination when Link header has no rel=\"next\"", async () => {
      const page1 = [sampleRepo()];
      mockFetch.mockResolvedValueOnce(
        mockResponse(page1, 200, {
          Link: '<https://api.github.com/user/repos?page=1>; rel="last"',
        }),
      );

      const result = await fetchRepos(TOKEN);

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe("fetchRepoLanguages", () => {
    it("returns language map for a specific repo", async () => {
      const languages = { TypeScript: 50000, JavaScript: 12000, CSS: 3000 };
      mockFetch.mockResolvedValueOnce(mockResponse(languages));

      const result = await fetchRepoLanguages(TOKEN, "octocat", "hello-world");

      expect(result).toEqual(languages);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.github.com/repos/octocat/hello-world/languages");
    });
  });

  describe("GitHubAuthError", () => {
    it("throws GitHubAuthError on 401 response", async () => {
      mockFetch.mockResolvedValue(mockResponse({}, 401));

      await expect(fetchProfile(TOKEN)).rejects.toThrow(GitHubAuthError);
      await expect(fetchProfile(TOKEN)).rejects.toThrow(
        "GitHub token expired or revoked",
      );
    });

    it("throws GitHubAuthError on 401 during fetchRepos", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 401));

      await expect(fetchRepos(TOKEN)).rejects.toThrow(GitHubAuthError);
    });

    it("throws GitHubAuthError on 401 during fetchRepoLanguages", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 401));

      await expect(
        fetchRepoLanguages(TOKEN, "octocat", "hello-world"),
      ).rejects.toThrow(GitHubAuthError);
    });
  });

  describe("rate limit warning", () => {
    it("logs warning when X-RateLimit-Remaining is below 100", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const profile = sampleProfile();

      mockFetch.mockResolvedValueOnce(
        mockResponse(profile, 200, { "X-RateLimit-Remaining": "42" }),
      );

      await fetchProfile(TOKEN);

      expect(warnSpy).toHaveBeenCalledWith(
        "[github-client] Rate limit low: 42 remaining",
      );
    });

    it("does not warn when X-RateLimit-Remaining is 100 or above", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const profile = sampleProfile();

      mockFetch.mockResolvedValueOnce(
        mockResponse(profile, 200, { "X-RateLimit-Remaining": "100" }),
      );

      await fetchProfile(TOKEN);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does not warn when no rate limit header is present", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const profile = sampleProfile();

      mockFetch.mockResolvedValueOnce(mockResponse(profile));

      await fetchProfile(TOKEN);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
