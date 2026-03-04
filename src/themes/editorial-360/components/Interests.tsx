"use client";
import React, { useState } from "react";
import type { SectionProps } from "../../types";

type InterestItem = {
    name: string;
    description?: string;
};

type InterestsContent = {
    title?: string;
    items: InterestItem[];
};

export function Interests({ content, variant }: SectionProps<InterestsContent>) {
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
                <h2 className="section-label">{title || "Interests"}</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {visible.map((item, i) => (
                        <span key={i} style={pillStyle} title={item.description}>
                            {item.name}
                        </span>
                    ))}
                    {expanded && hidden.map((item, i) => (
                        <span key={`h${i}`} style={pillStyle} title={item.description}>
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

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Interests"}
            </h2>

            <div className="flex flex-wrap gap-x-6 gap-y-3">
                {items.map((item, index) => (
                    <span
                        key={index}
                        className="text-sm font-medium text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors cursor-default"
                    >
                        {item.name}
                    </span>
                ))}
            </div>
        </section>
    );
}
