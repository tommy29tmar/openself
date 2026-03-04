import React from "react";
import type { SectionProps } from "../../types";

type LanguageItem = {
    language: string;
    proficiency?: string;
};

type LanguagesContent = {
    items: LanguageItem[];
    title?: string;
};

export function Languages({ content, variant }: SectionProps<LanguagesContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    if (variant === "monolith") {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">{title || "Languages"}</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {items.map((item, i) => (
                        <span key={i} style={{
                            fontSize: 12, padding: "6px 14px", borderRadius: 20,
                            border: "1px solid var(--page-border)",
                            background: "var(--page-muted)", color: "var(--page-fg)",
                        }}>
                            {item.language}{item.proficiency ? ` · ${item.proficiency}` : ""}
                        </span>
                    ))}
                </div>
            </section>
        );
    }

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Languages"}
            </h2>

            <div className="space-y-4">
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-4"
                    >
                        <span className="text-xl font-[var(--page-font-heading)] text-[var(--page-fg)]">
                            {item.language}
                        </span>
                        {item.proficiency && (
                            <span className="px-3 py-1 text-xs uppercase tracking-widest font-medium text-[var(--page-fg-secondary)] bg-[var(--page-badge-bg)] border border-[var(--page-card-border)] rounded-full">
                                {item.proficiency}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
