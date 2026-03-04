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
};

export function Activities({ content, variant }: SectionProps<ActivitiesContent>) {
    const { items = [], title } = content;
    const [expanded, setExpanded] = useState(false);

    if (!items.length) return null;

    if (variant === "monolith") {
        const pillStyle: React.CSSProperties = {
            fontSize: 12, padding: "6px 14px", borderRadius: 20,
            border: "1px solid var(--page-border)",
            background: "var(--page-muted)", color: "var(--page-fg)", cursor: "default",
        };
        const VISIBLE = 6;
        const visible = items.slice(0, VISIBLE);
        const hidden = items.slice(VISIBLE);
        return (
            <section className="theme-reveal">
                <h2 className="section-label">{title || "Activities"}</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {visible.map((item, i) => (
                        <span key={i} style={pillStyle}
                            title={[item.activityType, item.frequency, item.description].filter(Boolean).join(" · ")}>
                            {item.name}
                        </span>
                    ))}
                    {expanded && hidden.map((item, i) => (
                        <span key={`h${i}`} style={pillStyle}
                            title={[item.activityType, item.frequency, item.description].filter(Boolean).join(" · ")}>
                            {item.name}
                        </span>
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
                        <span>{expanded ? "collapse" : `${hidden.length} more`}</span>
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
