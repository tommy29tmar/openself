"use client";

import Link from "next/link";

type OwnerBannerProps = {
  username: string;
};

export function OwnerBanner({ username }: OwnerBannerProps) {
  const handleShare = () => {
    const url = `${window.location.origin}/${username}`;
    if (navigator.share) {
      navigator.share({ title: "My OpenSelf page", url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Link
        href="/builder"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Edit your page
      </Link>
      <button
        onClick={handleShare}
        className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
      >
        Share
      </button>
    </div>
  );
}
