/**
 * Social link platform registry — maps URL patterns to platform identifiers
 * and display metadata (icon name for lucide-react, label for aria/display).
 *
 * Used by:
 * - page-composer.ts: detectPlatform() to enrich hero social links
 * - Hero.tsx: icon rendering in social link row
 */

export type SocialPlatformDef = {
  readonly icon: string;
  readonly label: string;
  readonly urlPattern: RegExp | null;
};

export const SOCIAL_PLATFORMS: Record<string, SocialPlatformDef> = {
  linkedin: { icon: "Linkedin", label: "LinkedIn", urlPattern: /linkedin\.com/ },
  email: { icon: "Mail", label: "Email", urlPattern: /^mailto:/ },
  twitter: { icon: "Twitter", label: "X / Twitter", urlPattern: /x\.com|twitter\.com/ },
  website: { icon: "Globe", label: "Website", urlPattern: null },
  calendly: { icon: "Calendar", label: "Calendly", urlPattern: /calendly\.com/ },
  mastodon: { icon: "AtSign", label: "Mastodon", urlPattern: /mastodon/ },
  bluesky: { icon: "Cloud", label: "Bluesky", urlPattern: /bsky\.app/ },
  threads: { icon: "Hash", label: "Threads", urlPattern: /threads\.net/ },
  github: { icon: "Github", label: "GitHub", urlPattern: /github\.com/ },
  spotify: { icon: "Music", label: "Spotify", urlPattern: /spotify\.com/ },
  strava: { icon: "Activity", label: "Strava", urlPattern: /strava\.com/ },
} as const;

/**
 * Detect platform from a URL string.
 * Returns the platform key (e.g. "linkedin") or "website" as fallback.
 */
export function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  for (const [key, def] of Object.entries(SOCIAL_PLATFORMS)) {
    if (key === "website") continue; // skip fallback entry
    if (def.urlPattern && def.urlPattern.test(lower)) return key;
  }
  return "website";
}

/**
 * Get the display label for a platform key.
 */
export function getPlatformLabel(platform: string): string {
  return SOCIAL_PLATFORMS[platform.toLowerCase()]?.label ?? platform;
}
