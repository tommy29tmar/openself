import type { GitHubProfile, GitHubRepo } from "./client";

export type FactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
};

export function mapProfile(profile: GitHubProfile): FactInput[] {
  const facts: FactInput[] = [];

  facts.push({
    category: "social",
    key: "gh-profile",
    value: { platform: "github", url: profile.html_url, username: profile.login },
  });

  if (profile.bio) {
    facts.push({ category: "identity", key: "gh-bio", value: { text: profile.bio } });
  }
  if (profile.company) {
    facts.push({ category: "identity", key: "gh-company", value: { value: profile.company } });
  }
  if (profile.location) {
    facts.push({ category: "identity", key: "gh-location", value: { city: profile.location } });
  }
  if (profile.blog) {
    const url = profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`;
    facts.push({ category: "social", key: "gh-website", value: { url } });
  }
  if (profile.twitter_username) {
    facts.push({
      category: "social",
      key: "gh-twitter",
      value: { platform: "twitter", username: profile.twitter_username },
    });
  }

  return facts;
}

export function mapRepos(
  repos: GitHubRepo[],
  languagesByRepo: Map<string, Record<string, number>>,
): FactInput[] {
  const facts: FactInput[] = [];
  const nonForkRepos = repos.filter((r) => !r.fork);

  // Per-repo project facts
  for (const repo of nonForkRepos) {
    const languages = languagesByRepo.get(repo.full_name);
    const tags = languages ? Object.keys(languages) : repo.language ? [repo.language] : [];

    facts.push({
      category: "project",
      key: `gh-${repo.node_id}`,
      value: {
        name: repo.name,
        description: repo.description ?? "",
        url: repo.html_url,
        tags,
        status: repo.archived ? "archived" : "active",
      },
    });
  }

  // Aggregated language skills
  const langTotals = new Map<string, number>();
  for (const repo of nonForkRepos) {
    const langs = languagesByRepo.get(repo.full_name) ?? {};
    for (const lang of Object.keys(langs)) {
      langTotals.set(lang, (langTotals.get(lang) ?? 0) + 1);
    }
  }
  for (const [lang, count] of langTotals) {
    facts.push({
      category: "skill",
      key: `gh-${lang.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      value: { name: lang, evidence: `${count} repositories` },
    });
  }

  // Repo count stat
  facts.push({
    category: "stat",
    key: "github-repos",
    value: { label: "GitHub repositories", value: String(nonForkRepos.length) },
  });

  return facts;
}
