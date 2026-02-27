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
            <section className="mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.25s' }}>
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-8 border-b border-[var(--page-border)] pb-4">
                    {title || "Capabilities"}
                </h2>

                <div className="flex flex-col gap-10">
                    {groups.map((group, i) => (
                        <div key={i} className="flex flex-col md:flex-row gap-4 items-baseline">
                            <h3 className="text-[10px] uppercase tracking-wider md:w-1/4 shrink-0 font-bold text-[var(--page-fg)]">{group.label || group.name}</h3>
                            <ul className="flex flex-wrap gap-2 md:w-3/4">
                                {(group.items || group.skills || []).map((item, j) => {
                                    const name = typeof item === 'string' ? item : item.name;
                                    return (
                                        <li key={j} className="px-3 py-1 rounded-full border border-[var(--page-border)] bg-[var(--page-bg)] hover:bg-[var(--page-fg)] hover:text-[var(--page-bg)] transition-colors duration-300 text-xs cursor-default">
                                            {name}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    // Default: skills-list
    return (
        <section className="mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.25s' }}>
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-12 border-b border-[var(--page-border)] pb-4">
                {title || groups[0]?.label || groups[0]?.name || "Expertise"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12">
                {groups.map((group, i) => (
                    <div key={i} className="group">
                        <h3 className="text-xl font-bold mb-4 text-[var(--page-fg)] leading-tight relative inline-block">
                            {group.label || group.name}
                            <span className="absolute -bottom-1 left-0 w-8 h-px bg-[var(--page-accent)] group-hover:w-full transition-all duration-500"></span>
                        </h3>
                        <ul className="space-y-2 text-sm font-light">
                            {(group.items || group.skills || []).map((item, j) => {
                                const name = typeof item === 'string' ? item : item.name;
                                return (
                                    <li key={j} className="flex items-center gap-3 text-[var(--page-fg-secondary)]">
                                        <span className="w-1 h-1 rounded-none rotate-45 bg-[var(--page-border)] group-hover:bg-[var(--page-accent)] transition-colors duration-500"></span>
                                        <span className="hover:text-[var(--page-fg)] transition-colors duration-300 cursor-default">{name}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}
