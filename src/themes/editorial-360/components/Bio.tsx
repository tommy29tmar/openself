import React from "react";
import type { SectionProps } from "../../types";

type BioContent = {
    text: string;
    title?: string;
};

export function Bio({ content, variant = "bio-dropcap" }: SectionProps<BioContent>) {
    const { text = "", title } = content;

    if (variant === "bio-elegant") {
        return (
            <section className="mb-32 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-8" style={{ transitionDelay: '0.15s' }}>
                <div className="relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[var(--page-accent)] opacity-50"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[var(--page-accent)] opacity-50"></div>
                    
                    <div className="p-8 md:p-12">
                        <h2 className="text-sm font-[var(--page-font-heading)] uppercase tracking-widest text-[var(--page-fg-secondary)] mb-8 flex items-center gap-4">
                            <span className="w-8 h-px bg-[var(--page-fg-secondary)]"></span>
                            {title || "About"}
                        </h2>
                        <p className="font-light text-2xl md:text-3xl leading-relaxed text-[var(--page-fg)]">
                            {text}
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    // Default: bio-dropcap
    return (
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-16 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.15s' }}>
            <div className="md:col-span-4">
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-2">{title || "About"}</h2>
            </div>
            <div className="md:col-span-8 relative">
                <p className="font-light text-xl md:text-2xl leading-relaxed text-[var(--page-fg)] relative z-10">
                    {text}
                </p>
            </div>
        </section>
    );
}
