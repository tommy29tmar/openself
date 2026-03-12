/**
 * Thin GitHub API client.
 * Wraps fetch with auth headers, pagination, 401 detection, and rate-limit awareness.
 * No project-internal imports — this is a standalone HTTP client.
 */

export class GitHubAuthError extends Error {
  constructor() {
    super("GitHub token expired or revoked");
    this.name = "GitHubAuthError";
  }
}

// ── Types ────────────────────────────────────────────────────────────

export type GitHubProfile = {
  login: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter_username: string | null;
  name: string | null;
};

export type GitHubRepo = {
  node_id: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string;
  stargazers_count: number;
};

// ── Internal fetch wrapper ───────────────────────────────────────────

async function ghFetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (res.status === 401) throw new GitHubAuthError();

  const remaining = res.headers.get("X-RateLimit-Remaining");
  if (remaining && parseInt(remaining, 10) < 100) {
    console.warn(`[github-client] Rate limit low: ${remaining} remaining`);
  }

  return res;
}

// ── Public API ───────────────────────────────────────────────────────

export async function fetchProfile(token: string): Promise<GitHubProfile> {
  const res = await ghFetch("https://api.github.com/user", token);
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

export async function fetchRepos(token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let url: string | null =
    "https://api.github.com/user/repos?type=public&per_page=100&sort=pushed";

  while (url) {
    const res = await ghFetch(url, token);
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const page: GitHubRepo[] = await res.json();
    repos.push(...page);

    // Parse Link header for next page
    const link = res.headers.get("Link");
    url = null;
    if (link) {
      const next = link.split(",").find((s) => s.includes('rel="next"'));
      if (next) {
        const match = next.match(/<([^>]+)>/);
        if (match) url = match[1];
      }
    }
  }

  return repos;
}

export async function fetchRepoLanguages(
  token: string,
  owner: string,
  repo: string,
): Promise<Record<string, number>> {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/languages`,
    token,
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

// ── Event types ─────────────────────────────────────────────────────

export type GitHubEvent = {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: Record<string, unknown>;
};

/**
 * Fetch recent events for a user with incremental pagination.
 * Paginates until: (a) we hit a previously-seen event, (b) 5 pages max, or (c) no more pages.
 * Rate-limit aware: returns partial results on 403.
 * NOTE: ghFetch is a module-private function with signature ghFetch(url, token).
 */
export async function fetchUserEvents(
  token: string,
  username: string,
  lastSeenEventId?: string | null,
): Promise<GitHubEvent[]> {
  const MAX_PAGES = 5;
  const allEvents: GitHubEvent[] = [];
  let url: string | null = `https://api.github.com/users/${username}/events?per_page=100`;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await ghFetch(url, token);
    if (res.status === 403) {
      console.warn("[github] rate limited on events API");
      return allEvents;
    }
    if (!res.ok) return allEvents;

    const pageEvents = (await res.json()) as GitHubEvent[];
    if (pageEvents.length === 0) break;

    let hitBoundary = false;
    for (const event of pageEvents) {
      if (lastSeenEventId && event.id === lastSeenEventId) {
        hitBoundary = true;
        break;
      }
      allEvents.push(event);
    }
    if (hitBoundary) break;

    url = null;
    const link = res.headers.get("Link");
    if (link) {
      const next = link.split(",").find((s) => s.includes('rel="next"'));
      if (next) {
        const match = next.match(/<([^>]+)>/);
        if (match) url = match[1];
      }
    }
  }

  return allEvents;
}
