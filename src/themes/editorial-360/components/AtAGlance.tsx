import React from "react";
import type { SectionProps } from "../../types";

type StatItem = {
    label: string;
    value: string;
    unit?: string;
};

type SkillGroup = {
    domain: string;
    skills: string[];
    showLabel?: boolean;
};

type AtAGlanceContent = {
    title?: string;
    interestsInto?: string;
    stats?: StatItem[];
    skillGroups?: SkillGroup[];
    interests?: { name: string }[];
};

export function AtAGlance({ content }: SectionProps<AtAGlanceContent>) {
    const { title, interestsInto, stats, skillGroups, interests } = content;

    if (!stats?.length && !skillGroups?.length && !interests?.length) return null;

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "At a Glance"}
            </h2>

            {/* Stats row */}
            {stats && stats.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                    {stats.map((stat, i) => (
                        <div key={i} className="text-center md:text-left">
                            <p className="text-2xl font-bold text-[var(--page-fg)]">{stat.value}</p>
                            <p className="text-xs uppercase tracking-wide text-[var(--page-fg-secondary)] leading-tight break-words">
                                {stat.unit ?? stat.label}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Separator */}
            {stats && stats.length > 0 && (skillGroups?.length || interests?.length) && (
                <hr className="border-[var(--page-border)] mb-8" />
            )}

            {/* Skill groups */}
            {skillGroups && skillGroups.length > 0 && (
                <div className="flex flex-col gap-4 mb-8">
                    {skillGroups.map((group, i) => (
                        <div key={i} className="flex flex-col md:flex-row gap-2 md:gap-4 items-baseline">
                            {group.showLabel !== false && (
                                <span className="text-xs uppercase tracking-widest text-[var(--page-fg-secondary)] md:w-24 shrink-0">
                                    {group.domain}
                                </span>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {group.skills.map((skill, j) => (
                                    <span
                                        key={j}
                                        className="inline-flex rounded-full border border-[var(--page-border)] px-3 py-1 text-sm text-[var(--page-fg)] hover:bg-[var(--page-fg)] hover:text-[var(--page-bg)] transition-colors duration-300 cursor-default"
                                    >
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Separator */}
            {skillGroups && skillGroups.length > 0 && interests?.length && (
                <hr className="border-[var(--page-border)] mb-8" />
            )}

            {/* Interests */}
            {interests && interests.length > 0 && (
                <p className="text-base font-light text-[var(--page-fg)]">
                    <span className="text-[var(--page-accent)] font-medium">{interestsInto ?? "Into"}</span>{" "}
                    {interests.map((i) => i.name).join(" · ")}
                </p>
            )}
        </section>
    );
}
