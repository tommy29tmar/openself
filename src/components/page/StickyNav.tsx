"use client";

import React, { useEffect, useState } from "react";
import type { Section } from "@/lib/page-config/schema";

// Returns true when section count warrants a sticky nav
export function shouldShowStickyNav(sections: Section[]): boolean {
  return sections.length >= 8;
}

// Returns sections that get nav links (exclude hero + footer)
export function extractNavSections(sections: Section[]): Section[] {
  return sections.filter(s => s.type !== "hero" && s.type !== "footer");
}

type StickyNavProps = {
  sections: Section[];
  name: string;
  avatarUrl?: string;
};

export function StickyNav({ sections, name, avatarUrl }: StickyNavProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navSections = extractNavSections(sections);
  const initials = name ? name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?";

  return (
    <nav
      className={`fixed top-9 left-0 right-0 z-40 backdrop-blur-md transition-opacity duration-300 ${visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      style={{ backgroundColor: "color-mix(in srgb, var(--page-bg) 92%, transparent)", borderBottom: "1px solid var(--page-border)" }}
    >
      <div className="flex items-center gap-4 px-6 py-2 max-w-4xl mx-auto">
        {/* Avatar / initials */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold overflow-hidden"
          style={avatarUrl ? {} : { backgroundColor: "var(--page-accent)", color: "var(--page-accent-fg, var(--page-bg))", fontFamily: "var(--h-font)" }}
        >
          {avatarUrl ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" /> : initials}
        </div>
        {/* Name */}
        <span className="font-semibold text-sm flex-shrink-0" style={{ fontFamily: "var(--h-font)", color: "var(--page-fg)" }}>
          {name}
        </span>
        {/* Section anchors */}
        <div className="flex items-center gap-4 overflow-x-auto">
          {navSections.map(s => (
            <a
              key={s.id}
              href={`#section-${s.id}`}
              className="text-xs capitalize whitespace-nowrap hover-underline-grow"
              style={{ color: "var(--page-fg-secondary)" }}
            >
              {s.type.replace(/-/g, " ")}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
