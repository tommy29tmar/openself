import React from "react";
import type { SectionProps } from "../../types";

type HeroContent = {
    name: string;
    tagline: string;
    avatarUrl?: string;
};

export function Hero({ content }: SectionProps<HeroContent>) {
    const { name = "Unknown", tagline = "" } = content;

    return (
        <header className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.1s' }}>
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 border-b border-black/15 pb-12">
                <div>
                    <h1 className="font-serif text-6xl md:text-[6rem] leading-[0.9] tracking-tight mb-2 whitespace-pre-wrap">
                        {name.replace(' ', '\n')}
                    </h1>
                </div>
                <div className="md:text-right max-w-sm">
                    <p className="text-xl md:text-2xl font-serif text-[#666666] italic">
                        {tagline}
                    </p>
                </div>
            </div>
        </header>
    );
}
