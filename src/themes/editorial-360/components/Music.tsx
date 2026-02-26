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
        <section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-12 border-b border-black/15 pb-4">
                {title || "Music"}
            </h2>

            <div className="space-y-12">
                {items.map((item, index) => (
                    <React.Fragment key={index}>
                        <article className="group">
                            <h3 className="text-2xl md:text-3xl font-serif font-medium group-hover:text-amber-700 transition-colors">
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
                                <div className="text-lg font-medium text-[#111111] mt-1">
                                    {item.artist}
                                </div>
                            )}
                            {item.note && (
                                <p className="text-[#666666] leading-relaxed max-w-2xl text-lg mt-3">
                                    {item.note}
                                </p>
                            )}
                        </article>

                        {index < items.length - 1 && (
                            <div className="h-px w-full bg-[#111111] opacity-15 my-8"></div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
