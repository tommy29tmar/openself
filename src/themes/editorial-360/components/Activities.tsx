import React from "react";
import type { SectionProps } from "../../types";

type ActivityItem = {
    name: string;
    activityType?: string;
    frequency?: string;
    description?: string;
};

type ActivitiesContent = {
    items: ActivityItem[];
    title?: string;
};

export function Activities({ content, variant }: SectionProps<ActivitiesContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const isCompact = variant === "compact";

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-12 border-b border-black/15 pb-4">
                {title || "Activities"}
            </h2>

            {isCompact ? (
                <div className="flex flex-wrap gap-4">
                    {items.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <span className="text-lg font-serif text-[#111111]">
                                {item.name}
                            </span>
                            {item.activityType && (
                                <span className="px-3 py-1 text-xs uppercase tracking-widest font-medium text-[#666666] bg-[#f5f5f5] border border-black/10 rounded-full">
                                    {item.activityType}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-12">
                    {items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group">
                                <div className="flex items-baseline gap-4 mb-2">
                                    <h3 className="text-2xl md:text-3xl font-serif font-medium group-hover:text-amber-700 transition-colors">
                                        {item.name}
                                    </h3>
                                    {item.activityType && (
                                        <span className="px-3 py-1 text-xs uppercase tracking-widest font-medium text-[#666666] bg-[#f5f5f5] border border-black/10 rounded-full">
                                            {item.activityType}
                                        </span>
                                    )}
                                </div>
                                {item.frequency && (
                                    <div className="text-sm font-mono tracking-tight text-[#666666] mt-1">
                                        {item.frequency}
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
            )}
        </section>
    );
}
