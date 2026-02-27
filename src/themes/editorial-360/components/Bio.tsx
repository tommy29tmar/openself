import React from "react";
import type { SectionProps } from "../../types";

type BioContent = {
    text: string;
    title?: string;
};

export function Bio({ content, variant = "bio-dropcap" }: SectionProps<BioContent>) {
    const { text = "", title } = content;

    if (variant === "bio-elegant") {
        // Quote variant — typographic quotes
        return (
            <section className="theme-reveal">
                <h2 className="section-label">
                    {title || "About"}
                </h2>
                <div className="max-w-2xl">
                    <span className="text-4xl font-serif text-[var(--page-fg-secondary)] opacity-30 leading-none select-none" aria-hidden="true">{"\u201C"}</span>
                    <p className="text-xl font-light leading-loose text-[var(--page-fg-secondary)] -mt-4 ml-4">
                        {text}
                    </p>
                    <span className="text-4xl font-serif text-[var(--page-fg-secondary)] opacity-30 leading-none select-none block text-right -mt-2" aria-hidden="true">{"\u201D"}</span>
                </div>
            </section>
        );
    }

    // Default: bio-dropcap — clean editorial
    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "About"}
            </h2>
            <p className="text-xl font-light leading-loose text-[var(--page-fg-secondary)] max-w-2xl">
                {text}
            </p>
        </section>
    );
}
