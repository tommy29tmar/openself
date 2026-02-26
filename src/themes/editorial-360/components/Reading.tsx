import React from "react";
import type { SectionProps } from "../../types";

type ReadingItem = {
    title: string;
    author?: string;
    rating?: number;
    note?: string;
    url?: string;
};

type ReadingContent = {
    items: ReadingItem[];
    title?: string;
};

function StarRating({ rating }: { rating: number }) {
    const stars = Math.min(Math.max(Math.round(rating), 0), 5);
    return (
        <span className="text-[var(--page-accent)] text-sm tracking-wider">
            {"★".repeat(stars)}
            {"☆".repeat(5 - stars)}
        </span>
    );
}

export function Reading({ content }: SectionProps<ReadingContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[var(--page-footer-fg)] font-medium mb-12 border-b border-[var(--page-border)] pb-4">
                {title || "Reading"}
            </h2>

            <div className="space-y-12">
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        <article className="group">
                            <h3 className="text-2xl md:text-3xl font-[var(--page-font-heading)] font-medium group-hover:text-[var(--page-accent)] transition-colors">
                                {item.url ? (
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline underline-offset-4"
                                    >
                                        {item.title}
                                    </a>
                                ) : (
                                    item.title
                                )}
                            </h3>
                            {item.author && (
                                <div className="text-lg font-medium text-[var(--page-fg)] mt-1">
                                    {item.author}
                                </div>
                            )}
                            {item.rating != null && (
                                <div className="mt-2">
                                    <StarRating rating={item.rating} />
                                </div>
                            )}
                            {item.note && (
                                <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-2xl text-lg mt-3">
                                    {item.note}
                                </p>
                            )}
                        </article>

                        {index < items.length - 1 && (
                            <div className="h-px w-full bg-[var(--page-border)] my-8"></div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
