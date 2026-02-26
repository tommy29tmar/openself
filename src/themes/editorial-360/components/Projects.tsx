import React from "react";
import type { SectionProps } from "../../types";

type ProjectItem = {
    title: string;
    description?: string;
    url?: string;
    year?: string;
    role?: string;
};

type ProjectsContent = {
    title?: string;
    items: ProjectItem[];
};

export function Projects({ content }: SectionProps<ProjectsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-24 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[var(--page-footer-fg)] font-medium mb-16 border-b border-[var(--page-border)] pb-4">
                {title || "Projects"}
            </h2>

            <div className="space-y-16">
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        <article className="group">
                            <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-4">
                                <h3 className="text-3xl md:text-4xl font-[var(--page-font-heading)] font-medium group-hover:text-[var(--page-accent)] transition-colors text-[var(--page-fg)] leading-tight">
                                    {item.url ? (
                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline decoration-1 underline-offset-4">{item.title}</a>
                                    ) : (
                                        item.title
                                    )}
                                </h3>
                                <span className="text-sm font-[var(--page-font-heading)] italic text-[var(--page-fg-secondary)] mt-3 md:mt-0 md:ml-6">
                                    {item.year || item.role}
                                </span>
                            </div>
                            {item.description && (
                                <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-3xl text-xl font-light">
                                    {item.description}
                                </p>
                            )}
                        </article>

                        {index < items.length - 1 && (
                            <div className="h-px w-full bg-[var(--page-border)] my-10"></div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
