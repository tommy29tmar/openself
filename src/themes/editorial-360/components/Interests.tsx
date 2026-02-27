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
