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

export function Skills({ content }: SectionProps<SkillsContent>) {
    const { groups = [], title } = content;

    if (!groups.length) return null;

    return (
        <section className="mb-24 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[var(--page-footer-fg)] font-medium mb-16 border-b border-[var(--page-border)] pb-4">
                {title || groups[0]?.label || groups[0]?.name || "Skills"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24">
                {groups.map((group, i) => (
                    <div key={i}>
                        <h3 className="text-2xl font-[var(--page-font-heading)] mb-8 text-[var(--page-fg)] leading-tight">{group.label || group.name}</h3>
                        <ul className="space-y-5 text-xl font-light">
                            {(group.items || group.skills || []).map((item, j) => {
                                const name = typeof item === 'string' ? item : item.name;
                                return (
                                    <li key={j} className="flex items-center gap-4 text-[var(--page-fg-secondary)]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--page-fg)] opacity-40"></span>
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
