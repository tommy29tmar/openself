import React from "react";
import type { SectionProps } from "../../types";

type InterestItem = {
    name: string;
    description?: string;
};

type InterestsContent = {
    title?: string;
    items: InterestItem[];
};

export function Interests({ content }: SectionProps<InterestsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-8 border-b border-[var(--page-border)] pb-4">
                {title || "Interests"}
            </h2>

            <div className="flex flex-wrap gap-2 mt-6">
                {items.map((item, index) => (
                    <span
                        key={index}
                        className="px-3 py-1 rounded-none border border-[var(--page-border)] text-xs font-medium text-[var(--page-fg-secondary)] hover:bg-[var(--page-fg)] hover:text-[var(--page-bg)] transition-colors cursor-default uppercase tracking-wider"
                    >
                        {item.name}
                    </span>
                ))}
            </div>
        </section>
    );
}
