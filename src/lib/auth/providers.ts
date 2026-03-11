/**
 * OAuth provider registry.
 * Server-only — checks env vars to determine which providers are configured.
 * To add a new provider: add one entry to PROVIDER_REGISTRY.
 *
 * NOTE: This registry is intentionally stricter than the route handlers.
 * Routes fall back to localhost for NEXT_PUBLIC_BASE_URL (dev convenience),
 * but the registry requires it to be set — we don't want UI buttons that
 * redirect to localhost:3000 in production. The registry controls UI
 * visibility; routes control runtime behavior.
 */

export type OAuthProviderInfo = {
  id: string;
  label: string;
  authUrl: string;
};

const PROVIDER_REGISTRY: Array<{
  id: string;
  label: string;
  envVars: string[];
}> = [
  { id: "google", label: "Google", envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL"] },
  { id: "github", label: "GitHub", envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] },
  { id: "discord", label: "Discord", envVars: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL"] },
  { id: "linkedin", label: "LinkedIn", envVars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL"] },
  { id: "twitter", label: "X (Twitter)", envVars: ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET", "NEXT_PUBLIC_BASE_URL"] },
  { id: "apple", label: "Apple", envVars: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "NEXT_PUBLIC_BASE_URL"] },
];

export function getConfiguredProviders(): OAuthProviderInfo[] {
  return PROVIDER_REGISTRY
    .filter((p) => p.envVars.every((v) => !!process.env[v]))
    .map((p) => ({ id: p.id, label: p.label, authUrl: `/api/auth/${p.id}` }));
}
