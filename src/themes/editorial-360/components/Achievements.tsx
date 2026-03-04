import React from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

type AchievementItem = {
    title: string;
    description?: string;
    date?: string;
    issuer?: string;
};

type AchievementsContent = {
    items: AchievementItem[];
    title?: string;
};

export function Achievements({ content, variant }: SectionProps<AchievementsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const isCompact = variant === "compact";
    const maxItems = isCompact ? 3 : items.length;
    const visible = items.slice(0, maxItems);
    const remaining = items.length - visible.length;

    if (isCompact) {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">
                    {title || "Achievements"}
                </h2>
                <div className="space-y-3">
                    {visible.map((item, index) => (
                        <div key={index} className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-semibold text-[var(--page-fg)]">
                                {item.title}
                            </span>
                            {item.date && (
                                <span className="text-sm text-[var(--page-fg-secondary)]">
                                    {item.date}
                                </span>
                            )}
                        </div>
                    ))}
                    {remaining > 0 && (
                        <div className="text-sm text-[var(--page-fg-secondary)] italic">
                            +{remaining} more
                        </div>
                    )}
                </div>
            </section>
        );
    }

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Achievements"}
            </h2>

            <div>
                <CollapsibleList
                    visibleCount={3}
                    moreLabel="more"
                    items={items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group max-w-2xl">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.title}
                                    </h3>
                                    {item.date && (
                                        <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                            {item.date}
                                        </span>
                                    )}
                                </div>
                                {item.issuer && (
                                    <div className="text-sm text-[var(--page-fg-secondary)] mt-1">
                                        {item.issuer}
                                    </div>
                                )}
                                {item.description && (
                                    <p className="text-sm text-[var(--page-fg-secondary)] leading-relaxed max-w-prose mt-2">
                                        {item.description}
                                    </p>
                                )}
                            </article>

                            {index < items.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                />
            </div>
        </section>
    );
}
