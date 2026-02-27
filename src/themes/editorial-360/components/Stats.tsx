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
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "At a Glance"}
            </h2>

            <div className="flex flex-wrap justify-between max-w-xl mx-auto md:mx-0 gap-8">
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="text-center group"
                    >
                        <div className="text-5xl font-light tracking-[-0.02em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors duration-200 font-[var(--page-font-heading)]">
                            {item.value}
                            {item.unit && (
                                <span className="text-lg font-light text-[var(--page-fg-secondary)] ml-1">
                                    {item.unit}
                                </span>
                            )}
                        </div>
                        <div className="text-xs tracking-[0.1em] text-[var(--page-fg-secondary)] mt-2">
                            {item.label.toLowerCase()}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
