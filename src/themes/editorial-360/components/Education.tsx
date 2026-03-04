import React from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

type EducationItem = {
    institution: string;
    degree?: string;
    field?: string;
    period?: string;
    description?: string;
};

type EducationContent = {
    items: EducationItem[];
    title?: string;
};

export function Education({ content, variant }: SectionProps<EducationContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const isCompact = variant === "compact";
    const maxItems = isCompact ? 3 : items.length;
    const visible = items.slice(0, maxItems);
    const remaining = items.length - visible.length;

    const dotStyle: React.CSSProperties = {
        width: 8, height: 8, borderRadius: "50%",
        background: "var(--page-accent)", opacity: 0.5,
        marginTop: 7, flexShrink: 0,
    };

    if (isCompact) {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">
                    {title || "Education"}
                </h2>
                <div className="space-y-3">
                    {visible.map((item, index) => (
                        <div key={index} className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-semibold text-[var(--page-fg)]">
                                {[item.degree, item.field].filter(Boolean).join(" — ")}
                            </span>
                            <span className="text-sm text-[var(--page-fg-secondary)]">
                                {item.institution}
                            </span>
                        </div>
                    ))}
                    {remaining > 0 && (
                        <div className="text-sm text-[var(--page-fg-secondary)] italic">
                            +{remaining} more
                        </div>
                    )}
                </div>
            </section>
        );
    }

    if (variant === "monolith") {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">{title || "Education"}</h2>
                <CollapsibleList
                    visibleCount={2}
                    moreLabel="more degrees"
                    items={items.map((item, index) => {
                        const primary = item.degree ?? item.field ?? "";
                        const secondary = item.institution ?? "";
                        const heading = primary && secondary ? `${primary} — ${secondary}` : primary || secondary;
                        return (
                            <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
                                <div style={dotStyle} />
                                <article style={{ flex: 1 }}>
                                    <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.25, margin: 0 }}>
                                        {heading}
                                    </h3>
                                    {item.period && (
                                        <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>{item.period}</div>
                                    )}
                                    {item.description && (
                                        <p style={{ fontSize: 14, color: "var(--page-fg-secondary)", lineHeight: 1.6, marginTop: 8, maxWidth: "60ch" }}>
                                            {item.description}
                                        </p>
                                    )}
                                </article>
                            </div>
                        );
                    })}
                />
            </section>
        );
    }

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Education"}
            </h2>

            <div>
                <CollapsibleList
                    visibleCount={2}
                    moreLabel="more degrees"
                    items={items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group max-w-2xl">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.institution}
                                    </h3>
                                    {item.period && (
                                        <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                            {item.period}
                                        </span>
                                    )}
                                </div>
                                {(item.degree || item.field) && (
                                    <div className="text-sm text-[var(--page-fg-secondary)] mt-1">
                                        {[item.degree, item.field].filter(Boolean).join(" — ")}
                                    </div>
                                )}
                            </article>

                            {index < items.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                />
            </div>
        </section>
    );
}
