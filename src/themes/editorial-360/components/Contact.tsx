import React from "react";
import type { SectionProps } from "../../types";

type ContactMethod = {
    type: string;
    value: string;
    label?: string;
};

type ContactContent = {
    methods: ContactMethod[];
    title?: string;
};

export function Contact({ content }: SectionProps<ContactContent>) {
    const { methods = [], title } = content;

    if (!methods.length) return null;

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-12 border-b border-black/15 pb-4">
                {title || "Contact"}
            </h2>

            <div className="space-y-6">
                {methods.map((method, index) => (
                    <div
                        key={index}
                        className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-6"
                    >
                        <span className="text-xs uppercase tracking-widest text-[#888888] font-medium min-w-[100px]">
                            {method.label || method.type}
                        </span>
                        <span className="text-xl font-serif text-[#111111]">
                            {method.value}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}
