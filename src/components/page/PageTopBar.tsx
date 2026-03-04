"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { Section } from "@/lib/page-config/schema";

type PageTopBarProps = {
  sections: Section[];
  name: string;
  avatarUrl?: string;
  showStickyNav: boolean;
};

export function PageTopBar({ sections, name, avatarUrl, showStickyNav }: PageTopBarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 200);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const shouldSplit = showStickyNav && scrolled;
  const navSections = sections.filter(s => s.type !== "hero" && s.type !== "footer");
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  // Logo and login both start at left:50%, then use transform to:
  //   - not scrolled: sit adjacent around the center
  //   - scrolled (shouldSplit): slide to their respective edges (24px inset)
  //
  // translateX(calc(-50vw + 24px)) for logo:
  //   left:50% + translateX(-50vw + 24px) = 50vw - 50vw + 24px = 24px from left ✓
  //
  // translateX(calc(50vw - 24px - 100%)) for login:
  //   left:50% + translateX(50vw - 24px - loginWidth) = 100vw - 24px - loginWidth → right edge at 24px ✓

  const logoTransform = shouldSplit
    ? "translateX(calc(-50vw + 24px))"
    : "translateX(calc(-100% - 8px))";

  const loginTransform = shouldSplit
    ? "translateX(calc(50vw - 24px - 100%))"
    : "translateX(8px)";

  const transition = "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
      style={{
        height: 36,
        backgroundColor: "color-mix(in srgb, var(--page-bg, white) 85%, transparent)",
        borderBottom: "1px solid var(--page-border, rgba(0,0,0,0.08))",
      }}
    >
      <div className="relative h-full flex items-center">

        {/* Logo — slides from center-left to left edge */}
        <Link
          href="/"
          className="absolute text-sm font-medium"
          style={{
            left: "50%",
            color: "var(--page-fg, inherit)",
            transform: logoTransform,
            transition,
          }}
        >
          openself
        </Link>

        {/* Center nav content — fades in when scrolled (only if page has enough sections) */}
        {showStickyNav && (
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3"
            style={{
              opacity: shouldSplit ? 1 : 0,
              pointerEvents: shouldSplit ? "auto" : "none",
              transition: "opacity 0.3s ease-in-out",
            }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-[10px] font-semibold"
              style={{
                backgroundColor: "var(--page-accent)",
                color: "var(--page-accent-fg, var(--page-bg))",
                fontFamily: "var(--h-font)",
              }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                : initials}
            </div>
            <span
              className="text-xs font-semibold flex-shrink-0"
              style={{ color: "var(--page-fg)", fontFamily: "var(--h-font)" }}
            >
              {name}
            </span>
            <div
              className="flex items-center gap-3 overflow-x-auto"
              style={{ maxWidth: "40vw" }}
            >
              {navSections.map(s => (
                <a
                  key={s.id}
                  href={`#section-${s.id}`}
                  className="text-xs capitalize whitespace-nowrap"
                  style={{ color: "var(--page-fg-secondary)" }}
                >
                  {s.type.replace(/-/g, " ")}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Login — slides from center-right to right edge */}
        <Link
          href="/login"
          className="absolute text-sm"
          style={{
            left: "50%",
            color: "var(--page-fg-secondary, inherit)",
            transform: loginTransform,
            transition,
          }}
        >
          Log in
        </Link>

      </div>
    </div>
  );
}
