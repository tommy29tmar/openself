import React from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

type TimelineItem = {
    title: string;
    subtitle?: string;
    date?: string;
    description?: string;
};

type TimelineContent = {
    title?: string;
    items: TimelineItem[];
};

const dotStyle: React.CSSProperties = {
    width: 8, height: 8, borderRadius: "50%",
    background: "var(--page-accent)", opacity: 0.5,
    marginTop: 7, flexShrink: 0,
};

export function Timeline({ content, variant }: SectionProps<TimelineContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    if (variant === "monolith") {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">{title || "Timeline"}</h2>
                <CollapsibleList
                    visibleCount={2}
                    moreLabel="more"
                    items={items.map((item, index) => (
                        <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
                            <div style={dotStyle} />
                            <article style={{ flex: 1 }}>
                                <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.25, margin: 0 }}>
                                    {item.subtitle ? `${item.title} — ${item.subtitle}` : item.title}
                                </h3>
                                {item.date && (
                                    <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>{item.date}</div>
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

            <div className="space-y-12">
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        <article className="group">
                            <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-2">
                                <h3 className="text-2xl md:text-3xl font-[var(--page-font-heading)] font-medium group-hover:text-[var(--page-accent)] transition-colors">
                                    {item.title}
                                </h3>
                                <span className="text-sm font-mono tracking-tight text-[var(--page-fg-secondary)] mt-2 md:mt-0">
                                    {item.date}
                                </span>
                            </div>
                            {item.subtitle && (
                                <div className="text-lg font-medium text-[var(--page-fg)] mt-1">
                                    {item.subtitle}
                                </div>
                            )}
                            {item.description && (
                                <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-2xl text-lg mt-3">
                                    {item.description}
                                </p>
                            )}
                        </article>

                        {index < items.length - 1 && (
                            <div className="entry-dot-separator" />
                        )}
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
