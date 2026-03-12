import React from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

type ExperienceItem = {
    title: string;
    company?: string;
    period?: string;
    description?: string;
    current?: boolean;
};

type ExperienceContent = {
    items: ExperienceItem[];
    title?: string;
    currentLabel?: string;
};

const dotStyle: React.CSSProperties = {
    width: 8, height: 8, borderRadius: "50%",
    background: "var(--page-accent)", opacity: 0.5,
    marginTop: 7, flexShrink: 0,
};

export function Experience({ content, variant }: SectionProps<ExperienceContent>) {
    const { items = [], title, currentLabel } = content;
    const badgeLabel = currentLabel || "Current";

    if (!items.length) return null;

    // Sort: current first
    const sortedItems = [...items].sort((a, b) => {
        if (a.current && !b.current) return -1;
        if (!a.current && b.current) return 1;
        return 0;
    });

    if (variant === "monolith") {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">{title || "Experience"}</h2>
                <CollapsibleList
                    visibleCount={2}
                    moreLabel="more roles"
                    items={sortedItems.map((item, index) => (
                        <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
                            <div style={dotStyle} />
                            <article style={{ flex: 1 }}>
                                <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.25, margin: 0 }}>
                                    {item.title}{item.company ? ` — ${item.company}` : ""}
                                </h3>
                                {(item.period || item.current) && (
                                    <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>
                                        {item.period}
                                        {item.current && !(item.period?.trimEnd().endsWith(badgeLabel)) && (
                                            <span style={{ marginLeft: 8, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--page-accent)" }}>
                                                {badgeLabel}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {item.description && (
                                    <p style={{ fontSize: 14, color: "var(--page-fg-secondary)", lineHeight: 1.6, marginTop: 8, maxWidth: "60ch" }}>
                                        {item.description}
                                    </p>
                                )}
                            </article>
                        </div>
                    ))}
                />
            </section>
        );
    }

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Experience"}
            </h2>

            <div>
                <CollapsibleList
                    visibleCount={2}
                    moreLabel="more roles"
                    items={sortedItems.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group max-w-2xl">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.title}
                                    </h3>
                                    <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                        {item.period}
                                        {item.current && !(item.period?.trimEnd().endsWith(badgeLabel)) && (
                                            <span className="ml-2 text-xs uppercase tracking-widest text-[var(--page-accent)]">
                                                {badgeLabel}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                {item.company && (
                                    <div className="text-sm text-[var(--page-fg-secondary)] mt-1">
                                        {item.company}
                                    </div>
                                )}
                                {item.description && (
                                    <p className="text-sm text-[var(--page-fg-secondary)] leading-relaxed max-w-prose mt-2">
                                        {item.description}
                                    </p>
                                )}
                            </article>

                            {index < sortedItems.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                />
            </div>
        </section>
    );
}
