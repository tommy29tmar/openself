import { describe, it, expect } from "vitest";
import { mapProfile, mapRepos } from "@/lib/connectors/github/mapper";
import type { GitHubProfile, GitHubRepo } from "@/lib/connectors/github/client";

const sampleProfile: GitHubProfile = {
  login: "octocat",
  html_url: "https://github.com/octocat",
  bio: "I love coding",
  company: "@github",
  location: "San Francisco",
  blog: "octocat.dev",
  twitter_username: "octocat",
  name: "The Octocat",
};

const sampleRepos: GitHubRepo[] = [
  {
    node_id: "MDEwOlJlcG9zaXRvcnkx",
    name: "hello-world",
    full_name: "octocat/hello-world",
    description: "My first repo",
    html_url: "https://github.com/octocat/hello-world",
    language: "JavaScript",
    archived: false,
    fork: false,
    pushed_at: "2024-01-15T00:00:00Z",
    stargazers_count: 42,
  },
  {
    node_id: "MDEwOlJlcG9zaXRvcnky",
    name: "forked-repo",
    full_name: "octocat/forked-repo",
    description: "A fork",
    html_url: "https://github.com/octocat/forked-repo",
    language: "Python",
    archived: false,
    fork: true,
    pushed_at: "2024-02-01T00:00:00Z",
    stargazers_count: 5,
  },
  {
    node_id: "MDEwOlJlcG9zaXRvcnkz",
    name: "old-project",
    full_name: "octocat/old-project",
    description: "An archived project",
    html_url: "https://github.com/octocat/old-project",
    language: "TypeScript",
    archived: true,
    fork: false,
    pushed_at: "2023-06-01T00:00:00Z",
    stargazers_count: 10,
  },
  {
    node_id: "MDEwOlJlcG9zaXRvcnk0",
    name: "multi-lang",
    full_name: "octocat/multi-lang",
    description: null,
    html_url: "https://github.com/octocat/multi-lang",
    language: "Rust",
    archived: false,
    fork: false,
    pushed_at: "2024-03-01T00:00:00Z",
    stargazers_count: 100,
  },
];

describe("github-mapper", () => {
  describe("mapProfile", () => {
    it("maps login/bio/company/location/blog/twitter to correct fact categories and keys", () => {
      const facts = mapProfile(sampleProfile);

      const profile = facts.find((f) => f.key === "gh-profile");
      expect(profile).toEqual({
        category: "social",
        key: "gh-profile",
        value: { platform: "github", url: "https://github.com/octocat", username: "octocat" },
      });

      const bio = facts.find((f) => f.key === "gh-bio");
      expect(bio).toEqual({
        category: "identity",
        key: "gh-bio",
        value: { text: "I love coding" },
      });

      const company = facts.find((f) => f.key === "gh-company");
      expect(company).toEqual({
        category: "identity",
        key: "gh-company",
        value: { value: "@github" },
      });

      const location = facts.find((f) => f.key === "gh-location");
      expect(location).toEqual({
        category: "identity",
        key: "gh-location",
        value: { city: "San Francisco" },
      });

      const website = facts.find((f) => f.key === "gh-website");
      expect(website).toEqual({
        category: "social",
        key: "gh-website",
        value: { url: "https://octocat.dev" },
      });

      const twitter = facts.find((f) => f.key === "gh-twitter");
      expect(twitter).toEqual({
        category: "social",
        key: "gh-twitter",
        value: { platform: "twitter", username: "octocat" },
      });
    });

    it("skips null/empty fields — only gh-profile fact remains", () => {
      const minimal: GitHubProfile = {
        login: "ghost",
        html_url: "https://github.com/ghost",
        bio: null,
        company: null,
        location: null,
        blog: null,
        twitter_username: null,
        name: null,
      };

      const facts = mapProfile(minimal);
      expect(facts).toHaveLength(1);
      expect(facts[0].key).toBe("gh-profile");
    });

    it("prepends https:// to blog if missing scheme", () => {
      const withBlog: GitHubProfile = {
        ...sampleProfile,
        blog: "example.com/blog",
      };

      const facts = mapProfile(withBlog);
      const website = facts.find((f) => f.key === "gh-website");
      expect(website!.value.url).toBe("https://example.com/blog");
    });

    it("preserves blog URL if it already has http scheme", () => {
      const withHttp: GitHubProfile = {
        ...sampleProfile,
        blog: "http://example.com",
      };

      const facts = mapProfile(withHttp);
      const website = facts.find((f) => f.key === "gh-website");
      expect(website!.value.url).toBe("http://example.com");
    });

    it("preserves blog URL if it already has https scheme", () => {
      const withHttps: GitHubProfile = {
        ...sampleProfile,
        blog: "https://example.com",
      };

      const facts = mapProfile(withHttps);
      const website = facts.find((f) => f.key === "gh-website");
      expect(website!.value.url).toBe("https://example.com");
    });
  });

  describe("mapRepos", () => {
    it("maps each non-fork repo to project/gh-<node_id> fact", () => {
      const languagesByRepo = new Map<string, Record<string, number>>();
      const facts = mapRepos(sampleRepos, languagesByRepo);

      const projectFacts = facts.filter((f) => f.category === "project");
      // sampleRepos has 4 repos, 1 is a fork → 3 project facts
      expect(projectFacts).toHaveLength(3);

      const helloWorld = projectFacts.find((f) => f.key === "gh-MDEwOlJlcG9zaXRvcnkx");
      expect(helloWorld).toBeDefined();
      expect(helloWorld!.value.name).toBe("hello-world");
      expect(helloWorld!.value.description).toBe("My first repo");
      expect(helloWorld!.value.url).toBe("https://github.com/octocat/hello-world");
    });

    it("skips forks — forked-repo should not appear in project facts", () => {
      const languagesByRepo = new Map<string, Record<string, number>>();
      const facts = mapRepos(sampleRepos, languagesByRepo);

      const forkFact = facts.find((f) => f.key === "gh-MDEwOlJlcG9zaXRvcnky");
      expect(forkFact).toBeUndefined();
    });

    it("aggregates languages into skill/gh-<lang> facts with correct count", () => {
      const languagesByRepo = new Map<string, Record<string, number>>([
        ["octocat/hello-world", { JavaScript: 5000, TypeScript: 2000 }],
        ["octocat/old-project", { TypeScript: 8000 }],
        ["octocat/multi-lang", { Rust: 10000, TypeScript: 1000 }],
      ]);

      const facts = mapRepos(sampleRepos, languagesByRepo);
      const skillFacts = facts.filter((f) => f.category === "skill");

      const tsSkill = skillFacts.find((f) => f.key === "gh-typescript");
      expect(tsSkill).toBeDefined();
      // TypeScript appears in 3 non-fork repos (hello-world, old-project, multi-lang)
      expect(tsSkill!.value.evidence).toBe("3 repositories");
      expect(tsSkill!.value.name).toBe("TypeScript");

      const jsSkill = skillFacts.find((f) => f.key === "gh-javascript");
      expect(jsSkill).toBeDefined();
      expect(jsSkill!.value.evidence).toBe("1 repositories");

      const rustSkill = skillFacts.find((f) => f.key === "gh-rust");
      expect(rustSkill).toBeDefined();
      expect(rustSkill!.value.evidence).toBe("1 repositories");
    });

    it("creates stat/github-repos fact with count of non-fork repos", () => {
      const languagesByRepo = new Map<string, Record<string, number>>();
      const facts = mapRepos(sampleRepos, languagesByRepo);

      const stat = facts.find((f) => f.key === "github-repos");
      expect(stat).toEqual({
        category: "stat",
        key: "github-repos",
        value: { label: "GitHub repositories", value: "3" },
      });
    });

    it("marks archived repos with status 'archived', active with status 'active'", () => {
      const languagesByRepo = new Map<string, Record<string, number>>();
      const facts = mapRepos(sampleRepos, languagesByRepo);

      const helloWorld = facts.find((f) => f.key === "gh-MDEwOlJlcG9zaXRvcnkx");
      expect(helloWorld!.value.status).toBe("active");

      const oldProject = facts.find((f) => f.key === "gh-MDEwOlJlcG9zaXRvcnkz");
      expect(oldProject!.value.status).toBe("archived");
    });

    it("uses repo.language as fallback tag when no language data in map", () => {
      // No language data in the map for hello-world, but it has language: "JavaScript"
      const languagesByRepo = new Map<string, Record<string, number>>();
      const facts = mapRepos(sampleRepos, languagesByRepo);

      const helloWorld = facts.find((f) => f.key === "gh-MDEwOlJlcG9zaXRvcnkx");
      expect(helloWorld!.value.tags).toEqual(["JavaScript"]);

      // multi-lang has language: "Rust"
      const multiLang = facts.find((f) => f.key === "gh-MDEwOlJlcG9zaXRvcnk0");
      expect(multiLang!.value.tags).toEqual(["Rust"]);
    });

    it("uses language map keys as tags when language data is available", () => {
      const languagesByRepo = new Map<string, Record<string, number>>([
        ["octocat/hello-world", { JavaScript: 5000, TypeScript: 2000 }],
      ]);
      const facts = mapRepos(sampleRepos, languagesByRepo);

      const helloWorld = facts.find((f) => f.key === "gh-MDEwOlJlcG9zaXRvcnkx");
      expect(helloWorld!.value.tags).toEqual(["JavaScript", "TypeScript"]);
    });

    it("produces empty tags when repo has no language and no map entry", () => {
      const noLangRepo: GitHubRepo[] = [
        {
          node_id: "no-lang-1",
          name: "docs-only",
          full_name: "octocat/docs-only",
          description: "Documentation only",
          html_url: "https://github.com/octocat/docs-only",
          language: null,
          archived: false,
          fork: false,
          pushed_at: "2024-01-01T00:00:00Z",
          stargazers_count: 0,
        },
      ];
      const languagesByRepo = new Map<string, Record<string, number>>();
      const facts = mapRepos(noLangRepo, languagesByRepo);

      const project = facts.find((f) => f.key === "gh-no-lang-1");
      expect(project!.value.tags).toEqual([]);
    });

    it("empty repos array produces only stat fact with value '0'", () => {
      const languagesByRepo = new Map<string, Record<string, number>>();
      const facts = mapRepos([], languagesByRepo);

      expect(facts).toHaveLength(1);
      expect(facts[0]).toEqual({
        category: "stat",
        key: "github-repos",
        value: { label: "GitHub repositories", value: "0" },
      });
    });

    it("normalizes language keys to lowercase with non-alphanumeric replaced by hyphens", () => {
      const specialLangRepo: GitHubRepo[] = [
        {
          node_id: "special-1",
          name: "special",
          full_name: "octocat/special",
          description: null,
          html_url: "https://github.com/octocat/special",
          language: null,
          archived: false,
          fork: false,
          pushed_at: "2024-01-01T00:00:00Z",
          stargazers_count: 0,
        },
      ];
      const languagesByRepo = new Map<string, Record<string, number>>([
        ["octocat/special", { "C++": 5000, "C#": 3000, "Objective-C": 2000 }],
      ]);
      const facts = mapRepos(specialLangRepo, languagesByRepo);

      const skillFacts = facts.filter((f) => f.category === "skill");
      const keys = skillFacts.map((f) => f.key);

      expect(keys).toContain("gh-c--");
      expect(keys).toContain("gh-c-");
      expect(keys).toContain("gh-objective-c");
    });

    it("uses empty string for description when repo description is null", () => {
      const languagesByRepo = new Map<string, Record<string, number>>();
      const facts = mapRepos(sampleRepos, languagesByRepo);

      // multi-lang has description: null
      const multiLang = facts.find((f) => f.key === "gh-MDEwOlJlcG9zaXRvcnk0");
      expect(multiLang!.value.description).toBe("");
    });
  });
});
