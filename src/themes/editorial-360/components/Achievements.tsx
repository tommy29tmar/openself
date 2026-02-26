import React from "react";
import type { SectionProps } from "../../types";

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

export function Achievements({ content }: SectionProps<AchievementsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-12 border-b border-black/15 pb-4">
                {title || "Achievements"}
            </h2>

            <div className="space-y-12">
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        <article className="group">
                            <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-2">
                                <h3 className="text-2xl md:text-3xl font-serif font-medium group-hover:text-amber-700 transition-colors">
                                    {item.title}
                                </h3>
                                {item.date && (
                                    <span className="text-sm font-mono tracking-tight text-[#666666] mt-2 md:mt-0">
                                        {item.date}
                                    </span>
                                )}
                            </div>
                            {item.issuer && (
                                <div className="text-lg font-medium text-[#111111] mt-1">
                                    {item.issuer}
                                </div>
                            )}
                            {item.description && (
                                <p className="text-[#666666] leading-relaxed max-w-2xl text-lg mt-3">
                                    {item.description}
                                </p>
                            )}
                        </article>

                        {index < items.length - 1 && (
                            <div className="h-px w-full bg-[#111111] opacity-15 my-8"></div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
