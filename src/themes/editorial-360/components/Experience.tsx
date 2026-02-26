import React from "react";
import type { SectionProps } from "../../types";

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
};

export function Experience({ content }: SectionProps<ExperienceContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[var(--page-footer-fg)] font-medium mb-12 border-b border-[var(--page-border)] pb-4">
                {title || "Experience"}
            </h2>

            <div className="space-y-12">
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        <article className="group">
                            <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-2">
                                <h3 className="text-2xl md:text-3xl font-[var(--page-font-heading)] font-medium group-hover:text-[var(--page-accent)] transition-colors">
                                    {item.title}
                                </h3>
                                <span className="text-sm font-mono tracking-tight text-[var(--page-fg-secondary)] mt-2 md:mt-0">
                                    {item.period}
                                    {item.current && (
                                        <span className="ml-2 text-xs uppercase tracking-widest text-[var(--page-accent)]">
                                            Current
                                        </span>
                                    )}
                                </span>
                            </div>
                            {item.company && (
                                <div className="text-lg font-medium text-[var(--page-fg)] mt-1">
                                    {item.company}
                                </div>
                            )}
                            {item.description && (
                                <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-2xl text-lg mt-3">
                                    {item.description}
                                </p>
                            )}
                        </article>

                        {index < items.length - 1 && (
                            <div className="h-px w-full bg-[var(--page-border)] my-8"></div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
