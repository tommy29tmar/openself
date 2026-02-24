import React from "react";
import type { SectionProps } from "../../types";

type InterestItem = {
    name: string;
    description?: string;
};

type InterestsContent = {
    title?: string;
    items: InterestItem[];
};

export function Interests({ content }: SectionProps<InterestsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-24 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-12 border-b border-black/15 pb-4">
                {title || "Interests"}
            </h2>

            <div className="flex flex-wrap gap-4 mt-8">
                {items.map((item, index) => (
                    <span
                        key={index}
                        className="px-5 py-2.5 rounded-full border border-black/15 text-lg font-serif italic text-[#444444] hover:bg-black hover:text-white transition-colors cursor-default"
                    >
                        {item.name}
                    </span>
                ))}
            </div>
        </section>
    );
}
