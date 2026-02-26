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

export function Languages({ content }: SectionProps<LanguagesContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[var(--page-footer-fg)] font-medium mb-12 border-b border-[var(--page-border)] pb-4">
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
