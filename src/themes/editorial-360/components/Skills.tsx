import React from "react";
import type { SectionProps } from "../../types";

type SkillGroup = {
    name?: string;
    label?: string;
    items?: ({ name: string; level?: string } | string)[];
    skills?: string[];
};

type SkillsContent = {
    title?: string;
    groups: SkillGroup[];
};

export function Skills({ content, variant = "skills-list" }: SectionProps<SkillsContent>) {
    const { groups = [], title } = content;

    if (!groups.length) return null;

    if (variant === "skills-chips") {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">
                    {title || "Capabilities"}
                </h2>

                <div className="flex flex-col gap-8">
                    {groups.map((group, i) => (
                        <div key={i}>
                            {groups.length > 1 && (
                                <h3 className="text-xs uppercase tracking-[0.1em] font-medium text-[var(--page-fg-secondary)] mb-3">{group.label || group.name}</h3>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {(group.items || group.skills || []).map((item, j) => {
                                    const name = typeof item === 'string' ? item : item.name;
                                    return (
                                        <span key={j} className="px-3 py-1 rounded-md border border-[var(--page-border)] text-xs font-medium text-[var(--page-fg-secondary)] hover:border-[var(--page-accent)] hover:text-[var(--page-fg)] hover:-translate-y-px transition-all duration-200 cursor-default">
                                            {name}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    // Default: skills-list — text-only editorial
    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || groups[0]?.label || groups[0]?.name || "Expertise"}
            </h2>

            <div className="flex flex-col gap-8">
                {groups.map((group, i) => (
                    <div key={i}>
                        {groups.length > 1 && (
                            <h3 className="text-xs uppercase tracking-[0.1em] font-medium text-[var(--page-fg-secondary)] mb-3">{group.label || group.name}</h3>
                        )}
                        <div className="flex flex-wrap gap-x-6 gap-y-3">
                            {(group.items || group.skills || []).map((item, j) => {
                                const name = typeof item === 'string' ? item : item.name;
                                return (
                                    <span key={j} className="hover-underline-grow text-sm font-medium text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] hover:-translate-y-px transition-all duration-200 cursor-default">
                                        {name}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
