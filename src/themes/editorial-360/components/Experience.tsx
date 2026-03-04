import React from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

type ExperienceItem = {
    title: string;
    company?: string;
    period?: string;
    description?: string;
    current?: boolean;
};

type ExperienceContent = {
    items: ExperienceItem[];
    title?: string;
    currentLabel?: string;
};

export function Experience({ content }: SectionProps<ExperienceContent>) {
    const { items = [], title, currentLabel } = content;

    if (!items.length) return null;

    // Sort: current first
    const sortedItems = [...items].sort((a, b) => {
        if (a.current && !b.current) return -1;
        if (!a.current && b.current) return 1;
        return 0;
    });

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Experience"}
            </h2>

            <div>
                <CollapsibleList
                    visibleCount={2}
                    moreLabel="more roles"
                    items={sortedItems.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group max-w-2xl">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.title}
                                    </h3>
                                    <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                        {item.period}
                                        {item.current && (
                                            <span className="ml-2 text-xs uppercase tracking-widest text-[var(--page-accent)]">
                                                {currentLabel || "Current"}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                {item.company && (
                                    <div className="text-sm text-[var(--page-fg-secondary)] mt-1">
                                        {item.company}
                                    </div>
                                )}
                                {item.description && (
                                    <p className="text-sm text-[var(--page-fg-secondary)] leading-relaxed max-w-prose mt-2">
                                        {item.description}
                                    </p>
                                )}
                            </article>

                            {index < sortedItems.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                />
            </div>
        </section>
    );
}
