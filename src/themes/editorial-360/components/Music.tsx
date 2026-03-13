import React from "react";
import type { SectionProps } from "../../types";
import { CollapsibleList } from "@/components/page/CollapsibleList";

type MusicItem = {
    title: string;
    artist?: string;
    note?: string;
    album?: string;
    url?: string;
};

type MusicContent = {
    items: MusicItem[];
    title?: string;
};

export function Music({ content, variant }: SectionProps<MusicContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    if (variant === "monolith") {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">{title || "Music"}</h2>
                <CollapsibleList
                    visibleCount={3}
                    moreLabel="more tracks"
                    items={items.map((item, index) => (
                        <div key={index} style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.3 }}>
                                {item.title}
                            </div>
                            {(item.artist || item.album) && (
                                <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 2 }}>
                                    {[item.artist, item.album].filter(Boolean).join(" — ")}
                                </div>
                            )}
                            {item.note && (
                                <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 6, lineHeight: 1.5, opacity: 0.8 }}>
                                    {item.note}
                                </div>
                            )}
                        </div>
                    ))}
                />
            </section>
        );
    }

    const isCompact = variant === "compact";
    const maxItems = isCompact ? 5 : items.length;
    const visible = items.slice(0, maxItems);
    const remaining = items.length - visible.length;

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Music"}
            </h2>

            {isCompact ? (
                <div className="space-y-3">
                    {visible.map((item, index) => (
                        <div key={index} className="flex items-baseline gap-2">
                            {item.artist && (
                                <span className="text-sm text-[var(--page-fg-secondary)]">
                                    {item.artist}
                                </span>
                            )}
                            <span className="text-lg font-[var(--page-font-heading)] font-medium text-[var(--page-fg)]">
                                {item.title}
                            </span>
                            {item.album && (
                                <span className="text-sm text-[var(--page-fg-secondary)] italic">
                                    — {item.album}
                                </span>
                            )}
                        </div>
                    ))}
                    {remaining > 0 && (
                        <div className="text-sm text-[var(--page-fg-secondary)] italic">
                            +{remaining} more
                        </div>
                    )}
                </div>
            ) : (
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
                                {item.album && (
                                    <div className="text-base text-[var(--page-fg-secondary)] mt-1 italic">
                                        {item.album}
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
            )}
        </section>
    );
}
