import React from "react";
import type { SectionProps } from "../../types";

type BioContent = {
    text: string;
    title?: string;
};

export function Bio({ content }: SectionProps<BioContent>) {
    const { text = "", title } = content;

    return (
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-24 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <div className="md:col-span-4">
                <h2 className="text-xs uppercase tracking-widest text-[#888888] font-medium mb-4">{title || "About"}</h2>
            </div>
            <div className="md:col-span-8">
                <p className="font-serif text-3xl md:text-4xl leading-tight text-[#111111] first-letter:text-7xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:mt-1">
                    {text}
                </p>
            </div>
        </section>
    );
}
