import React from "react";
import type { SectionProps } from "../../types";

type StatItem = {
    label: string;
    value: string;
    unit?: string;
};

type StatsContent = {
    items: StatItem[];
    title?: string;
};

export function Stats({ content }: SectionProps<StatsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-12 border-b border-black/15 pb-4">
                {title || "Stats"}
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="text-center p-6 border border-black/10 rounded-sm hover:border-black/25 transition-colors"
                    >
                        <div className="text-4xl md:text-5xl font-serif font-medium text-[#111111] mb-2">
                            {item.value}
                            {item.unit && (
                                <span className="text-xl text-[#888888] ml-1">
                                    {item.unit}
                                </span>
                            )}
                        </div>
                        <div className="text-sm uppercase tracking-widest text-[#888888] font-medium">
                            {item.label}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
