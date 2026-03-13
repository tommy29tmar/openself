"use client";
import React, { useState } from "react";
import type { SectionProps } from "../../types";

type ActivityItem = {
    name: string;
    activityType?: string;
    frequency?: string;
    description?: string;
};

type ActivitiesContent = {
    items: ActivityItem[];
    title?: string;
    collapseLabel?: string;
    moreLabel?: string;
};

export function Activities({ content, variant }: SectionProps<ActivitiesContent>) {
    const { items = [], title, collapseLabel, moreLabel } = content;
    const [expanded, setExpanded] = useState(false);

    if (!items.length) return null;

    if (variant === "monolith") {
        const cardStyle: React.CSSProperties = {
            padding: "10px 16px", borderRadius: 12,
            border: "1px solid var(--page-border)",
            background: "var(--page-muted)", minWidth: 140, flex: "1 1 auto",
        };
        const nameStyle: React.CSSProperties = {
            fontSize: 14, fontWeight: 600, color: "var(--page-fg)",
        };
        const descStyle: React.CSSProperties = {
            fontSize: 12, color: "var(--page-fg-secondary)", marginTop: 4, opacity: 0.8,
        };
        const typeStyle: React.CSSProperties = {
            fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.08em",
            color: "var(--page-fg-secondary)", opacity: 0.6, marginTop: 4,
        };
        const VISIBLE = 6;
        const visible = items.slice(0, VISIBLE);
        const hidden = items.slice(VISIBLE);
        return (
            <section className="theme-reveal">
                <h2 className="section-label">{title || "Activities"}</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(expanded ? items : visible).map((item, i) => (
                        <div key={i} style={cardStyle}>
                            <div style={nameStyle}>{item.name}</div>
                            {item.description && <div style={descStyle}>{item.description}</div>}
                            {item.activityType && <div style={typeStyle}>{item.activityType}</div>}
                        </div>
                    ))}
                </div>
                {hidden.length > 0 && (
                    <button type="button" onClick={() => setExpanded(!expanded)}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                            color: "var(--page-fg-secondary)", opacity: 0.6, background: "none",
                            border: "none", cursor: "pointer", padding: "8px 0", marginTop: 8,
                            letterSpacing: "0.05em",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                    >
                        <span>{expanded ? "▴" : "▾"}</span>
                        <span>{expanded ? (collapseLabel || "collapse") : `${hidden.length} ${moreLabel || "more"}`}</span>
                    </button>
                )}
            </section>
        );
    }

    const isCompact = variant === "compact";

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Activities"}
            </h2>

            {isCompact ? (
                <div className="flex flex-wrap gap-4">
                    {items.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <span className="text-lg font-[var(--page-font-heading)] text-[var(--page-fg)]">
                                {item.name}
                            </span>
                            {item.activityType && (
                                <span className="px-3 py-1 text-xs uppercase tracking-widest font-medium text-[var(--page-fg-secondary)] bg-[var(--page-badge-bg)] border border-[var(--page-card-border)] rounded-full">
                                    {item.activityType}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-12">
                    {items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group">
                                <div className="flex items-baseline gap-4 mb-2">
                                    <h3 className="text-2xl md:text-3xl font-[var(--page-font-heading)] font-medium group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.name}
                                    </h3>
                                    {item.activityType && (
                                        <span className="px-3 py-1 text-xs uppercase tracking-widest font-medium text-[var(--page-fg-secondary)] bg-[var(--page-badge-bg)] border border-[var(--page-card-border)] rounded-full">
                                            {item.activityType}
                                        </span>
                                    )}
                                </div>
                                {item.frequency && (
                                    <div className="text-sm font-mono tracking-tight text-[var(--page-fg-secondary)] mt-1">
                                        {item.frequency}
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
            )}
        </section>
    );
}
