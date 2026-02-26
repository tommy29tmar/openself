import React from "react";
import type { SectionProps } from "../../types";

type LanguageItem = {
    language: string;
    proficiency?: string;
};

type LanguagesContent = {
    items: LanguageItem[];
    title?: string;
};

export function Languages({ content }: SectionProps<LanguagesContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-12 border-b border-black/15 pb-4">
                {title || "Languages"}
            </h2>

            <div className="space-y-4">
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-4"
                    >
                        <span className="text-xl font-serif text-[#111111]">
                            {item.language}
                        </span>
                        {item.proficiency && (
                            <span className="px-3 py-1 text-xs uppercase tracking-widest font-medium text-[#666666] bg-[#f5f5f5] border border-black/10 rounded-full">
                                {item.proficiency}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
