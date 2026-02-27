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
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Contact"}
            </h2>

            <div className="space-y-6">
                {methods.map((method, index) => (
                    <div
                        key={index}
                        className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-6"
                    >
                        <span className="text-xs uppercase tracking-widest text-[var(--page-footer-fg)] font-medium min-w-[100px]">
                            {method.label || method.type}
                        </span>
                        <span className="text-xl font-[var(--page-font-heading)] text-[var(--page-fg)]">
                            {method.value}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}
