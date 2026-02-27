import React from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

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

export function Projects({ content, variant = "projects-list" }: SectionProps<ProjectsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const summaryLine = items
        .slice(1)
        .map((item) => item.title)
        .join(", ");

    if (variant === "projects-bento") {
        return (
            <section className="mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.2s' }}>
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-8 flex items-center gap-4">
                    <span>{title || "Selected Works"}</span>
                    <div className="h-px bg-[var(--page-border)] flex-1"></div>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <CollapsibleList
                        items={items.map((item, index) => {
                            // Make the first item larger if it's the first in the grid
                            const isFeatured = index === 0;
                            return (
                                <article
                                    key={index}
                                    className={`group p-6 md:p-8 rounded-2xl border border-[var(--page-border)] bg-[var(--page-bg)] hover:bg-[var(--page-fg)]/5 transition-all duration-500 relative overflow-hidden flex flex-col justify-between min-h-[250px] ${isFeatured ? 'md:col-span-2' : ''}`}
                                >
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--page-accent)]"></span>
                                                <span className="text-[9px] font-bold tracking-widest text-[var(--page-fg-secondary)] uppercase">
                                                    {item.year || item.role || 'Project'}
                                                </span>
                                            </div>
                                        </div>
                                        <h3 className={`font-[var(--page-font-heading)] font-semibold text-[var(--page-fg)] leading-tight mb-2 ${isFeatured ? 'text-3xl md:text-4xl' : 'text-xl md:text-2xl'}`}>
                                            {item.url ? (
                                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10"><span className="sr-only">{item.title}</span></a>
                                            ) : null}
                                            {item.title}
                                        </h3>
                                    </div>

                                    {item.description && (
                                        <p className={`text-[var(--page-fg-secondary)] leading-relaxed font-light ${isFeatured ? 'text-lg max-w-xl mt-4' : 'text-sm mt-2'}`}>
                                            {item.description}
                                        </p>
                                    )}
                                </article>
                            );
                        })}
                        summaryLine={summaryLine}
                    />
                </div>
            </section>
        );
    }

    if (variant === "projects-minimal") {
        return (
            <section className="mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.2s' }}>
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-6">
                    {title || "Index"}
                </h2>

                <div className="w-full">
                    <CollapsibleList
                        items={items.map((item, index) => (
                            <div key={index} className="group flex flex-col sm:flex-row sm:items-center justify-between py-4 border-t border-[var(--page-border)] hover:bg-[var(--page-fg)]/[0.02] transition-colors px-2">
                                <h3 className="text-lg md:text-xl font-medium text-[var(--page-fg)]">
                                    {item.url ? (
                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">{item.title}</a>
                                    ) : (
                                        item.title
                                    )}
                                </h3>
                                <div className="flex items-center gap-4 mt-1 sm:mt-0 text-xs text-[var(--page-fg-secondary)] uppercase tracking-widest">
                                    {item.role && <span>{item.role}</span>}
                                    {item.year && <span className="font-mono">{item.year}</span>}
                                </div>
                            </div>
                        ))}
                        summaryLine={summaryLine}
                    />
                    <div className="border-t border-[var(--page-border)]"></div>
                </div>
            </section>
        );
    }

    // Default: projects-list (Classic Editorial)
    return (
        <section className="mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.2s' }}>
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-12 border-b border-[var(--page-border)] pb-4 flex justify-between items-end">
                <span>{title || "Projects"}</span>
                <span className="text-[9px] opacity-50">{items.length} Works</span>
            </h2>

            <div className="space-y-12">
                <CollapsibleList
                    items={items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group relative">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-2 gap-4">
                                    <h3 className="text-3xl md:text-4xl font-[var(--page-font-heading)] font-semibold text-[var(--page-fg)] leading-none hover:italic transition-all">
                                        {item.url ? (
                                            <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                                        ) : (
                                            item.title
                                        )}
                                    </h3>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--page-fg-secondary)] md:ml-6 shrink-0">
                                        {item.year || item.role}
                                    </span>
                                </div>
                                {item.description && (
                                    <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-3xl text-lg font-light">
                                        {item.description}
                                    </p>
                                )}
                            </article>
                        </React.Fragment>
                    ))}
                    summaryLine={summaryLine}
                />
            </div>
        </section>
    );
}
