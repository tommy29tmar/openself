import React from "react";
import type { SectionProps } from "../../types";

type MusicItem = {
    title: string;
    artist?: string;
    note?: string;
    url?: string;
};

type MusicContent = {
    items: MusicItem[];
    title?: string;
};

export function Music({ content }: SectionProps<MusicContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Music"}
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
                            {item.artist && (
                                <div className="text-lg font-medium text-[var(--page-fg)] mt-1">
                                    {item.artist}
                                </div>
                            )}
                            {item.note && (
                                <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-2xl text-lg mt-3">
                                    {item.note}
                                </p>
                            )}
                        </article>

                        {index < items.length - 1 && (
                            <div className="entry-dot-separator" />
                        )}
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
