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

type HeroProps = SectionProps<HeroContent> & {
    onAvatarClick?: () => void;
};

export function Hero({ content, variant = "hero-split", onAvatarClick }: HeroProps) {
    const { name = "Unknown", tagline = "", avatarUrl } = content;

    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    const avatarStyle = {
        backgroundColor: "var(--page-accent)",
        fontFamily: "var(--h-font)",
        color: "var(--page-accent-fg, var(--page-bg))",
    };

    const renderAvatar = (sizeClass: string, textSizeClass: string) => {
        const wrapperClass = `${sizeClass} rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden`;
        const inner = avatarUrl ? (
            <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
            <span className={`${textSizeClass} font-semibold uppercase`} style={avatarStyle}>
                {initials}
            </span>
        );

        if (onAvatarClick) {
            return (
                <button
                    type="button"
                    className={`${wrapperClass} cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--page-accent)]`}
                    style={avatarUrl ? {} : avatarStyle}
                    onClick={onAvatarClick}
                    aria-label="Change avatar"
                >
                    {inner}
                </button>
            );
        }

        return (
            <div
                className={wrapperClass}
                style={avatarUrl ? {} : avatarStyle}
            >
                {inner}
            </div>
        );
    };

    if (variant === "hero-centered") {
        return (
            <header className="mb-32 mt-16 theme-reveal flex flex-col items-center text-center relative">
                {/* Avatar: 120px centered */}
                <div className="mb-8 z-10">
                    {renderAvatar("w-[120px] h-[120px]", "text-4xl")}
                </div>
                <h1 className="font-[var(--h-font)] text-6xl md:text-8xl lg:text-[9rem] leading-[0.9] tracking-tighter mb-6 whitespace-pre-wrap font-medium relative z-10">
                    {name}
                </h1>
                <p className="text-xl md:text-3xl font-[var(--h-font)] text-[var(--page-fg-secondary)] max-w-2xl mx-auto italic leading-relaxed relative z-10">
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
                            <h1 className="font-[var(--h-font)] text-5xl md:text-7xl lg:text-8xl leading-tight tracking-tighter mb-6 font-semibold">
                                {name}
                            </h1>
                            <p className="text-xl md:text-2xl text-[var(--page-fg-secondary)] max-w-xl leading-relaxed font-light">
                                {tagline}
                            </p>
                        </div>
                        <div className="md:col-span-4 flex justify-start md:justify-end">
                            <div className="rounded-2xl shadow-lg rotate-3 hover:rotate-0 transition-transform duration-500">
                                {renderAvatar("w-48 h-48 md:w-64 md:h-64 !rounded-2xl", "text-6xl")}
                            </div>
                        </div>
                    </div>
                </div>
            </header>
        );
    }

    // Default: hero-split — Magazine editorial with 80px avatar, flex row
    return (
        <header className="py-24 theme-reveal">
            <div className="border-b border-[var(--page-border)] pb-10">
                <div className="flex items-center gap-6 mb-4">
                    {/* Avatar: 80px left-aligned */}
                    {renderAvatar("w-20 h-20", "text-2xl")}
                    <div className="flex-1 min-w-0">
                        <h1
                            className="hero-stagger-name font-[var(--h-font)] font-medium tracking-[-0.03em] leading-[0.95]"
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
                </div>
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
                                        {(link as { platform: string; url: string; label?: string }).label ?? link.platform}
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
