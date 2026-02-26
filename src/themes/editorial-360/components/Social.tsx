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
        <footer className="text-center pt-20 border-t border-[var(--page-border)] theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="font-[var(--page-font-heading)] text-4xl mb-8">Start a conversation.</h2>

            <div className="flex justify-center gap-8 mb-16 flex-wrap">
                {links.map((link, index) => (
                    <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg text-[var(--page-fg)] hover:text-[var(--page-accent)] transition-colors border-b border-[var(--page-border)] pb-0.5"
                    >
                        {link.platform}
                    </a>
                ))}
            </div>

            <p className="text-sm tracking-widest uppercase text-[var(--page-footer-fg)]">
                © {new Date().getFullYear()} OpenSelf. Constructed with precision.
            </p>
        </footer>
    );
}
