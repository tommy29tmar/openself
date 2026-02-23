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
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-8 border-b border-black/15 pb-4">
                {title || "Interests"}
            </h2>

            <div className="flex flex-wrap gap-3 mt-6">
                {items.map((item, index) => (
                    <span
                        key={index}
                        className="px-4 py-2 rounded-full border border-black/20 text-sm text-[#444444] hover:bg-black hover:text-white transition-colors cursor-default"
                    >
                        {item.name}
                    </span>
                ))}
            </div>
        </section>
    );
}
