import React from "react";
import type { SectionProps } from "../../types";

type HeroContent = {
    name: string;
    tagline: string;
    avatarUrl?: string;
    socialLinks?: { platform: string; url: string }[];
    contactEmail?: string;
    languages?: { language: string; proficiency?: string }[];
};

export function Hero({ content, variant = "hero-split" }: SectionProps<HeroContent>) {
    const { name = "Unknown", tagline = "", avatarUrl } = content;

    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    if (variant === "hero-centered") {
        return (
            <header className="mb-32 mt-16 theme-reveal flex flex-col items-center text-center relative">
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
            <header className="mb-32 mt-8 theme-reveal">
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

    // Default: hero-split — Magazine editorial
    return (
        <header className="py-24 theme-reveal">
            <div className="border-b border-[var(--page-border)] pb-10">
                <h1
                    className="hero-stagger-name font-[var(--page-font-heading)] font-medium tracking-[-0.03em] leading-[0.95]"
                    style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)" }}
                >
                    {name}
                </h1>
                {tagline && (
                    <p className="hero-stagger-tagline text-[var(--text-xl)] font-light text-[var(--page-fg-secondary)] leading-relaxed max-w-xl mt-4">
                        {tagline}
                    </p>
                )}
            </div>
            {/* Contact bar */}
            {(content.socialLinks?.length || content.contactEmail || content.languages?.length) && (
                <div className="hero-stagger-social mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
                    {content.socialLinks && content.socialLinks.length > 0 && (
                        <>
                            {content.socialLinks.map((link, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && <span className="text-[var(--page-fg-secondary)] opacity-20 select-none">&middot;</span>}
                                    <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover-underline-grow text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors uppercase tracking-[0.05em] text-xs font-medium"
                                    >
                                        {link.label ?? link.platform}
                                    </a>
                                </React.Fragment>
                            ))}
                        </>
                    )}
                    {content.contactEmail && (
                        <>
                            {content.socialLinks?.length ? <span className="text-[var(--page-fg-secondary)] opacity-20 select-none">&middot;</span> : null}
                            <span className="text-[var(--page-fg-secondary)] text-xs tracking-wide">
                                {content.contactEmail}
                            </span>
                        </>
                    )}
                    {content.languages && content.languages.length > 0 && (
                        <>
                            {(content.socialLinks?.length || content.contactEmail) && <span className="text-[var(--page-fg-secondary)] opacity-20 select-none">&middot;</span>}
                            <span className="text-[var(--page-fg-secondary)] text-xs tracking-wide">
                                {content.languages
                                    .map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ""}`)
                                    .join(" · ")}
                            </span>
                        </>
                    )}
                </div>
            )}
        </header>
    );
}
