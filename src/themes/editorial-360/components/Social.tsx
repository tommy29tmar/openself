import React from "react";
import type { SectionProps } from "../../types";

type SocialLink = {
    platform: string;
    url: string;
    username?: string;
};

type SocialContent = {
    links: SocialLink[];
};

export function Social({ content }: SectionProps<SocialContent>) {
    const { links = [] } = content;

    if (!links.length) return null;

    return (
        <footer className="text-center pt-12 border-t border-[var(--page-border)] theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4">
            <h2 className="font-bold text-xl mb-6 text-[var(--page-fg)] uppercase tracking-tighter">Get in touch.</h2>

            <div className="flex justify-center gap-6 mb-12 flex-wrap">
                {links.map((link, index) => (
                    <a
                        key={index}
                        href={link.url}
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
