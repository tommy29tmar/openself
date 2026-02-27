import React from "react";
import type { SectionProps } from "../../types";

type CustomContent = {
    title?: string;
    body?: string;
    items?: { label: string; value: string }[];
};

export function Custom({ content }: SectionProps<CustomContent>) {
    const { title, body, items = [] } = content;

    if (!title && !body && !items.length) return null;

    return (
        <section className="theme-reveal">
            {title && (
                <h2 className="section-label">
                    {title}
                </h2>
            )}

            {body && (
                <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-2xl text-lg mb-8">
                    {body}
                </p>
            )}

            {items.length > 0 && (
                <div className="space-y-4">
                    {items.map((item, index) => (
                        <div
                            key={index}
                            className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-6"
                        >
                            <span className="text-xs uppercase tracking-widest text-[var(--page-footer-fg)] font-medium min-w-[120px]">
                                {item.label}
                            </span>
                            <span className="text-xl font-[var(--page-font-heading)] text-[var(--page-fg)]">
                                {item.value}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
