import React from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

type EducationItem = {
    institution: string;
    degree?: string;
    field?: string;
    period?: string;
    description?: string;
};

type EducationContent = {
    items: EducationItem[];
    title?: string;
};

export function Education({ content }: SectionProps<EducationContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const summaryLine = items
        .slice(1)
        .map((item) => item.institution)
        .join(", ");

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Education"}
            </h2>

            <div>
                <CollapsibleList
                    items={items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.institution}
                                    </h3>
                                    {item.period && (
                                        <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                            {item.period}
                                        </span>
                                    )}
                                </div>
                                {(item.degree || item.field) && (
                                    <div className="text-sm text-[var(--page-fg-secondary)] mt-1">
                                        {[item.degree, item.field].filter(Boolean).join(" — ")}
                                    </div>
                                )}
                            </article>

                            {index < items.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                    summaryLine={summaryLine}
                />
            </div>
        </section>
    );
}
