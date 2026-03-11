"use client";

import type { OAuthProviderInfo } from "@/lib/auth/providers";

type OAuthButtonsProps = {
  providers: OAuthProviderInfo[];
};

export function OAuthButtons({ providers }: OAuthButtonsProps) {
  if (providers.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-2">
      {providers.map((p) => (
        <a
          key={p.id}
          href={p.authUrl}
          className="flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with {p.label}
        </a>
      ))}
    </div>
  );
}
