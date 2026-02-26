import React from "react";
import type { SectionProps } from "../../types";

type HeroContent = {
    name: string;
    tagline: string;
    avatarUrl?: string;
};

export function Hero({ content }: SectionProps<HeroContent>) {
    const { name = "Unknown", tagline = "" } = content;

    return (
        <header className="mb-24 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.1s' }}>
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-12 border-b border-[var(--page-border)] pb-24 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5 pointer-events-none">
                    <svg viewBox="0 0 100 100" fill="currentColor">
                        <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="1" fill="none" />
                        <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeWidth="0.5" />
                        <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="0.5" />
                    </svg>
                </div>
                
                <div>
                    <h1 className="font-[var(--page-font-heading)] text-7xl md:text-[10rem] leading-[0.85] tracking-tighter mb-4 whitespace-pre-wrap font-medium">
                        {name.replace(' ', '\n')}
                    </h1>
                </div>
                {tagline && (
                <div className="md:text-right max-w-sm">
                    <p className="text-2xl md:text-3xl font-[var(--page-font-heading)] text-[var(--page-fg-secondary)] italic leading-snug">
                        {tagline}
                    </p>
                </div>
                )}
            </div>
        </header>
    );
}
