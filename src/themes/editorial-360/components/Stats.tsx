import React from "react";
import type { SectionProps } from "../../types";

type StatItem = {
    label: string;
    value: string;
    unit?: string;
};

type StatsContent = {
    items: StatItem[];
    title?: string;
};

export function Stats({ content }: SectionProps<StatsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="section-label">
                {title || "Stats"}
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="text-center p-6 border border-[var(--page-card-border)] rounded-[var(--page-radius-base)] hover:border-[var(--page-fg-secondary)] transition-colors"
                    >
                        <div className="text-4xl md:text-5xl font-[var(--page-font-heading)] font-medium text-[var(--page-fg)] mb-2">
                            {item.value}
                            {item.unit && (
                                <span className="text-xl text-[var(--page-footer-fg)] ml-1">
                                    {item.unit}
                                </span>
                            )}
                        </div>
                        <div className="text-sm uppercase tracking-widest text-[var(--page-footer-fg)] font-medium">
                            {item.label}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
