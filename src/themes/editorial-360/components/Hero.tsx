import React from "react";
import type { SectionProps } from "../../types";
import {
    Linkedin, Mail, Twitter, Globe, Calendar, AtSign, Cloud,
    Hash, Github, Music, Activity,
} from "lucide-react";
import { SOCIAL_PLATFORMS } from "@/lib/social-links";

type HeroContent = {
    name: string;
    tagline: string;
    avatarUrl?: string;
    socialLinks?: { platform: string; url: string; label?: string }[];
    cta?: { label: string; url: string };
    contactEmail?: string;
    languages?: { language: string; proficiency?: string; canonicalProficiency?: string }[];
    location?: string;
    availability?: string;
    yearsExp?: number;
};

type HeroProps = SectionProps<HeroContent> & {
    onAvatarClick?: () => void;
};

// Canonical high-proficiency tokens (language-independent).
// page-composer.ts stores canonicalProficiency = raw fact value (pre-localization).
// We filter on canonical tokens only — safe across all locales.
const HIGH_PROFICIENCY_CANONICAL = new Set(["native", "bilingual", "fluent", "c1", "c2"]);

const PROFICIENCY_ALIAS: Record<string, string> = {
    // Italian
    "madrelingua": "native",
    // German
    "muttersprachler": "native",
    "muttersprachlerin": "native",
    "fließend": "fluent",
    "fliessend": "fluent",
    // French
    "natif": "native",
    "native": "native",
    "courant": "fluent",
    "couramment": "fluent",
    // Spanish/Portuguese
    "nativo": "native",
    "nativa": "native",
    "fluente": "fluent",
    // Common
    "bilingual": "bilingual",
    "bilingue": "bilingual",
    "near-native": "native",
    "proficient": "fluent",
};

function isHighProficiency(l: { proficiency?: string; canonicalProficiency?: string }): boolean {
    if (l.canonicalProficiency) {
        return HIGH_PROFICIENCY_CANONICAL.has(l.canonicalProficiency.toLowerCase().trim());
    }
    const prof = (l.proficiency ?? "").toLowerCase().trim();
    const normalized = PROFICIENCY_ALIAS[prof] ?? prof;
    return HIGH_PROFICIENCY_CANONICAL.has(normalized);
}

// Map platform icon names (from SOCIAL_PLATFORMS) to lucide-react components
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    Linkedin,
    Mail,
    Twitter,
    Globe,
    Calendar,
    AtSign,
    Cloud,
    Hash,
    Github,
    Music,
    Activity,
};

function SocialIcon({ platform, size = 20 }: { platform: string; size?: number }) {
    const def = SOCIAL_PLATFORMS[platform.toLowerCase()];
    const iconName = def?.icon ?? "Globe";
    const IconComponent = ICON_MAP[iconName] ?? Globe;
    return <IconComponent size={size} />;
}

function HeroChips({ content }: { content: HeroContent }) {
    const chips: string[] = [];

    if (content.location) chips.push(content.location);
    if (content.availability) chips.push(content.availability);
    if (content.yearsExp && content.yearsExp > 0) chips.push(`${content.yearsExp} yrs exp.`);

    const langs = (content.languages ?? [])
        .filter(l => (l.proficiency || l.canonicalProficiency) && isHighProficiency(l))
        .slice(0, 2)
        .map(l => l.language);
    if (langs.length > 0) chips.push(langs.join(" · "));

    if (chips.length === 0) return null;

    const chipStyle: React.CSSProperties = {
        fontSize: 12, color: "var(--page-fg-secondary)",
        background: "var(--page-muted)", padding: "5px 12px",
        borderRadius: 20, border: "1px solid var(--page-border)",
        whiteSpace: "nowrap",
    };

    return (
        <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
            {chips.map((chip, i) => <span key={i} style={chipStyle}>{chip}</span>)}
        </div>
    );
}

function HeroSocialLinks({ content }: { content: HeroContent }) {
    const socialLinks = (content.socialLinks ?? []).filter(l => l.url);
    const hasEmail = !!content.contactEmail;
    const cta = content.cta;

    if (!hasEmail && socialLinks.length === 0 && !cta) return null;

    // Combine email + social links into one array for icon rendering
    const allLinks: { platform: string; url: string; label: string }[] = [];
    if (hasEmail) {
        allLinks.push({ platform: "email", url: `mailto:${content.contactEmail}`, label: "Email" });
    }
    for (const link of socialLinks) {
        const def = SOCIAL_PLATFORMS[link.platform?.toLowerCase()];
        allLinks.push({
            platform: link.platform,
            url: link.url,
            label: link.label ?? def?.label ?? link.platform ?? "Link",
        });
    }

    return (
        <div style={{ marginTop: 16 }}>
            {/* Social icon row — horizontal scroll on mobile, 44px touch targets */}
            {allLinks.length > 0 && (
                <div className="flex gap-3 overflow-x-auto py-2 -mx-2 px-2 scrollbar-hide">
                    {allLinks.map((link, i) => (
                        <a
                            key={i}
                            href={link.url}
                            target={link.platform === "email" ? undefined : "_blank"}
                            rel={link.platform === "email" ? undefined : "noopener noreferrer"}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--page-fg,#333)]/20 text-[var(--page-fg-secondary)] transition-colors hover:bg-[var(--page-fg,#333)]/10 hover:text-[var(--page-fg)]"
                            aria-label={link.label}
                        >
                            <SocialIcon platform={link.platform} size={20} />
                        </a>
                    ))}
                </div>
            )}
            {/* Optional CTA button */}
            {cta && cta.url && cta.label && (
                <a
                    href={cta.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex h-11 items-center rounded-full border border-[var(--page-accent)] bg-[var(--page-accent)] px-6 text-sm font-medium text-[var(--page-accent-fg,var(--page-bg))] transition-opacity hover:opacity-90"
                >
                    {cta.label}
                </a>
            )}
        </div>
    );
}

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
                <div className="mb-8 z-10">
                    {renderAvatar("w-[120px] h-[120px]", "text-4xl")}
                </div>
                <h1 className="font-[var(--h-font)] text-6xl md:text-8xl lg:text-[9rem] leading-[0.9] tracking-tighter mb-6 whitespace-pre-wrap font-medium relative z-10">
                    {name}
                </h1>
                <p className="text-xl md:text-3xl font-[var(--h-font)] text-[var(--page-fg-secondary)] max-w-2xl mx-auto italic leading-relaxed relative z-10">
                    {tagline}
                </p>
                <div className="relative z-10">
                    <HeroSocialLinks content={content} />
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(ellipse_at_center,var(--page-accent)_0%,transparent_50%)] opacity-5 pointer-events-none blur-3xl rounded-full"></div>
            </header>
        );
    }

    if (variant === "hero-glass") {
        return (
            <header className="mb-32 mt-8 theme-reveal">
                <div className="relative overflow-hidden rounded-[2rem] p-8 md:p-16 border border-[var(--page-border)] bg-[var(--page-bg)]/40 backdrop-blur-xl shadow-sm">
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
                            <HeroSocialLinks content={content} />
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

    // Default: hero-split — content pinned to bottom (min-height 480px, flex-end)
    // The MonolithLayout wrapper supplies the section borderBottom separator.
    return (
        <header
            className="theme-reveal"
            style={{ minHeight: 480, display: "flex", alignItems: "flex-end", paddingBottom: 56 }}
        >
            <div>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                    {renderAvatar("w-20 h-20", "text-2xl")}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1
                            className="hero-stagger-name font-[var(--h-font)] font-medium tracking-[-0.03em] leading-[0.95]"
                            style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)" }}
                        >
                            {name}
                        </h1>
                        {tagline && (
                            <p className="hero-stagger-tagline"
                                style={{ fontSize: 17, fontWeight: 300, color: "var(--page-fg-secondary)", lineHeight: 1.5, maxWidth: "50ch", marginTop: 12 }}>
                                &#x201C;{tagline}&#x201D;
                            </p>
                        )}
                    </div>
                </div>
                <HeroChips content={content} />
                <HeroSocialLinks content={content} />
            </div>
        </header>
    );
}
