import type { PageConfig } from "@/lib/page-config/schema";

export const mockPageConfig: PageConfig = {
  version: 1,
  username: "tommaso",
  surface: "canvas",
  voice: "signal",
  light: "day",
  style: {
    primaryColor: "#6366f1",
    layout: "centered",
  },
  sections: [
    {
      id: "hero-1",
      type: "hero",
      variant: "large",
      content: {
        name: "Tommaso Rossi",
        tagline: "Building tools that put people in control of their digital identity",
        avatarUrl: undefined,
      },
    },
    {
      id: "bio-1",
      type: "bio",
      variant: "full",
      content: {
        text: "I'm a software engineer and open-source enthusiast based in Milan. I spend my days building products that respect user privacy and autonomy. When I'm not coding, you'll find me trail running in the Alps, reading about distributed systems, or experimenting with sourdough recipes that my friends pretend to enjoy.",
      },
    },
    {
      id: "skills-1",
      type: "skills",
      variant: "chips",
      content: {
        groups: [
          {
            label: "Languages",
            skills: ["TypeScript", "Python", "Rust", "Go"],
          },
          {
            label: "Frontend",
            skills: ["React", "Next.js", "Tailwind CSS", "Framer Motion"],
          },
          {
            label: "Backend & Infra",
            skills: ["Node.js", "PostgreSQL", "SQLite", "Docker", "AWS"],
          },
          {
            label: "Interests",
            skills: ["AI/ML", "Privacy Tech", "Open Source", "Distributed Systems"],
          },
        ],
      },
    },
    {
      id: "projects-1",
      type: "projects",
      variant: "grid",
      content: {
        items: [
          {
            title: "OpenSelf",
            description:
              "AI-powered personal page builder. Talk for 5 minutes, get a living page.",
            url: "https://github.com/tommasorossi/openself",
            tags: ["TypeScript", "Next.js", "AI"],
          },
          {
            title: "LocalVault",
            description:
              "End-to-end encrypted local-first password manager with sync.",
            url: "https://github.com/tommasorossi/localvault",
            tags: ["Rust", "SQLite", "Crypto"],
          },
          {
            title: "TrailLog",
            description:
              "GPS trail tracker with offline maps and elevation profiles.",
            url: "https://github.com/tommasorossi/traillog",
            tags: ["React Native", "MapboxGL"],
          },
          {
            title: "Pane",
            description:
              "Minimal tiling window manager for creative workflows.",
            tags: ["Rust", "Wayland"],
          },
        ],
      },
    },
    {
      id: "social-1",
      type: "social",
      variant: "icons",
      content: {
        links: [
          { platform: "github", url: "https://github.com/tommasorossi", label: "GitHub" },
          { platform: "linkedin", url: "https://linkedin.com/in/tommasorossi", label: "LinkedIn" },
          { platform: "twitter", url: "https://x.com/tommasorossi", label: "X" },
          { platform: "website", url: "https://tommasorossi.dev", label: "Website" },
          { platform: "email", url: "mailto:hi@tommasorossi.dev", label: "Email" },
        ],
      },
    },
  ],
};
