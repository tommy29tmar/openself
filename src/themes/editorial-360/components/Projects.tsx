"use client";
import React, { useState } from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

type ProjectItem = {
    title: string;
    description?: string;
    url?: string;
    year?: string;
    role?: string;
    tags?: string[];
};

function ProjectCard({ item }: { item: ProjectItem }) {
    return (
        <div style={{
            background: "var(--page-card-bg, var(--page-muted))",
            border: "1px solid var(--page-border)",
            borderRadius: 10,
            padding: 20,
        }}>
            <h3 style={{ fontWeight: 600, fontSize: 16, color: "var(--page-fg)", margin: "0 0 8px" }}>
                {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: "inherit", textDecoration: "none" }}>
                        {item.title}
                    </a>
                ) : item.title}
            </h3>
            {item.description && (
                <p style={{ fontSize: 13, color: "var(--page-fg-secondary)", lineHeight: 1.6, margin: 0 }}>
                    {item.description}
                </p>
            )}
            {item.tags && item.tags.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                    {item.tags.map((tag, i) => (
                        <span key={i} style={{
                            fontSize: 11, color: "var(--page-accent)",
                            background: "var(--page-muted)", padding: "3px 9px",
                            borderRadius: 10, border: "1px solid var(--page-border)",
                        }}>{tag}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

type ProjectsContent = {
    title?: string;
    items: ProjectItem[];
};

export function Projects({ content, variant = "projects-list" }: SectionProps<ProjectsContent>) {
    const { items = [], title } = content;
    const [gridExpanded, setGridExpanded] = useState(false);

    if (!items.length) return null;

    if (variant === "projects-grid") {
        const VISIBLE = 4;
        const visibleItems = items.slice(0, VISIBLE);
        const hiddenItems = items.slice(VISIBLE);

        return (
            <section className="theme-reveal">
                <h2 className="section-label">{title || "Projects"}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {visibleItems.map((item, i) => <ProjectCard key={i} item={item} />)}
                    {gridExpanded && hiddenItems.map((item, i) => <ProjectCard key={`h${i}`} item={item} />)}
                </div>
                {hiddenItems.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setGridExpanded(!gridExpanded)}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                            color: "var(--page-fg-secondary)", opacity: 0.6, background: "none",
                            border: "none", cursor: "pointer", padding: "8px 0", marginTop: 8,
                            letterSpacing: "0.05em",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                    >
                        <span>{gridExpanded ? "▴" : "▾"}</span>
                        <span>{gridExpanded ? "collapse" : `${hiddenItems.length} more projects`}</span>
                    </button>
                )}
            </section>
        );
    }

    if (variant === "projects-bento") {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">
                    {title || "Selected Works"}
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
                        visibleCount={1}
                        moreLabel="more projects"
                    />
                </div>
            </section>
        );
    }

    if (variant === "projects-minimal") {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">
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
                        visibleCount={1}
                        moreLabel="more projects"
                    />
                    <div className="border-t border-[var(--page-border)]"></div>
                </div>
            </section>
        );
    }

    // Default: projects-list (Classic Editorial)
    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Projects"}
            </h2>

            <div>
                <CollapsibleList
                    items={items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group relative">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.url ? (
                                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover-underline-grow">{item.title}</a>
                                        ) : (
                                            item.title
                                        )}
                                    </h3>
                                    <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                        {item.year || item.role}
                                    </span>
                                </div>
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
                    summaryLine={summaryLine}
                />
            </div>
        </section>
    );
}
