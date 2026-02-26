"use client";

import Link from "next/link";

export function VisitorBanner() {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Link
        href="/"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        OpenSelf
      </Link>
      <Link
        href="/login"
        className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
      >
        Log in
      </Link>
    </div>
  );
}
