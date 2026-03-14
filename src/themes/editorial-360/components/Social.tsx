import React from "react";
import type { SectionProps } from "../../types";

function safeHref(url: string): string {
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return "#";
}

type SocialLink = {
    platform: string;
    url: string;
    username?: string;
};

type SocialContent = {
    title?: string;
    links: SocialLink[];
};

export function Social({ content }: SectionProps<SocialContent>) {
    const { title, links = [] } = content;

    if (!links.length) return null;

    return (
        <footer className="text-center pt-12 theme-reveal">
            <h2 className="section-label">{title || "Get in touch"}</h2>

            <div className="flex justify-center gap-6 flex-wrap">
                {links.map((link, index) => (
                    <a
                        key={index}
                        href={safeHref(link.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors border-b border-transparent hover:border-[var(--page-fg)] pb-0.5 uppercase tracking-widest"
                    >
                        {link.platform}
                    </a>
                ))}
            </div>
        </footer>
    );
}
