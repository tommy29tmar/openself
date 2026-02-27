import React from "react";
import type { SectionProps } from "../../types";

type HeroContent = {
    name: string;
    tagline: string;
    avatarUrl?: string;
};

export function Hero({ content, variant = "hero-split" }: SectionProps<HeroContent>) {
    const { name = "Unknown", tagline = "", avatarUrl } = content;

    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    if (variant === "hero-centered") {
        return (
            <header className="mb-32 mt-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-8 flex flex-col items-center text-center relative" style={{ transitionDelay: '0.1s' }}>
                {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover mb-8 shadow-2xl border-4 border-[var(--page-bg)] z-10" />
                ) : (
                    <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-[var(--page-accent)] text-[var(--page-bg)] flex items-center justify-center text-4xl font-medium mb-8 shadow-2xl z-10 font-[var(--page-font-heading)]">
                        {initials}
                    </div>
                )}
                <h1 className="font-[var(--page-font-heading)] text-6xl md:text-8xl lg:text-[9rem] leading-[0.9] tracking-tighter mb-6 whitespace-pre-wrap font-medium relative z-10">
                    {name}
                </h1>
                <p className="text-xl md:text-3xl font-[var(--page-font-heading)] text-[var(--page-fg-secondary)] max-w-2xl mx-auto italic leading-relaxed relative z-10">
                    {tagline}
                </p>
                
                {/* Decorative background element */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(ellipse_at_center,var(--page-accent)_0%,transparent_50%)] opacity-5 pointer-events-none blur-3xl rounded-full"></div>
            </header>
        );
    }

    if (variant === "hero-glass") {
        return (
            <header className="mb-32 mt-8 theme-reveal transition-all duration-1000 ease-out opacity-0" style={{ transitionDelay: '0.1s' }}>
                <div className="relative overflow-hidden rounded-[2rem] p-8 md:p-16 border border-[var(--page-border)] bg-[var(--page-bg)]/40 backdrop-blur-xl shadow-sm">
                    {/* Abstract background shapes */}
                    <div className="absolute -top-24 -right-24 w-96 h-96 bg-[var(--page-accent)]/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-[var(--page-fg)]/5 rounded-full blur-3xl pointer-events-none"></div>
                    
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
                        <div className="md:col-span-8">
                            <h1 className="font-[var(--page-font-heading)] text-5xl md:text-7xl lg:text-8xl leading-tight tracking-tighter mb-6 font-semibold">
                                {name}
                            </h1>
                            <p className="text-xl md:text-2xl text-[var(--page-fg-secondary)] max-w-xl leading-relaxed font-light">
                                {tagline}
                            </p>
                        </div>
                        <div className="md:col-span-4 flex justify-start md:justify-end">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt={name} className="w-48 h-48 md:w-64 md:h-64 object-cover rounded-2xl shadow-lg rotate-3 hover:rotate-0 transition-transform duration-500" />
                            ) : (
                                <div className="w-48 h-48 md:w-64 md:h-64 rounded-2xl bg-[var(--page-fg)] text-[var(--page-bg)] flex items-center justify-center text-6xl font-medium shadow-lg rotate-3 font-[var(--page-font-heading)]">
                                    {initials}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>
        );
    }

    // Default: hero-split (Classic Editorial, two-column)
    return (
        <header className="mb-8 mt-4 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.1s' }}>
            <div className="md:grid md:grid-cols-2 md:gap-8 md:items-end border-b border-[var(--page-border)] pb-8">
                <div className="min-w-0">
                    <h1
                        className="font-[var(--page-font-heading)] uppercase font-bold tracking-[0.05em] leading-tight"
                        style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}
                    >
                        {name}
                    </h1>
                </div>
                {tagline && (
                    <div className="mt-4 md:mt-0 md:text-right">
                        <p
                            className="font-[var(--page-font-heading)] font-light text-[var(--page-fg-secondary)] leading-snug"
                            style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)" }}
                        >
                            {tagline}
                        </p>
                    </div>
                )}
            </div>
        </header>
    );
}
