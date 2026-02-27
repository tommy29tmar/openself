import React from "react";
import type { SectionProps } from "../../types";

type FooterContent = {
    text?: string;
};

export function Footer({ content }: SectionProps<FooterContent>) {
    return (
        <footer className="text-center py-16 theme-reveal">
            <div className="mx-auto mb-8" style={{ width: '64px', height: '0.5px', background: 'var(--page-fg-secondary)', opacity: 0.15 }} />
            <a
                href="https://openself.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="hover-underline-grow text-xs tracking-[0.15em] uppercase text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors"
            >
                openself.dev
            </a>
        </footer>
    );
}
