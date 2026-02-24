import React from "react";
import type { SectionProps } from "../../types";

type SocialLink = {
    platform: string;
    url: string;
    username?: string;
};

type SocialContent = {
    links: SocialLink[];
};

export function Social({ content }: SectionProps<SocialContent>) {
    const { links = [] } = content;

    if (!links.length) return null;

    return (
        <footer className="text-center pt-20 border-t border-black/15 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="font-serif text-4xl mb-8">Start a conversation.</h2>

            <div className="flex justify-center gap-8 mb-16 flex-wrap">
                {links.map((link, index) => (
                    <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg text-[#111111] hover:text-amber-700 transition-colors border-b border-black/20 pb-0.5"
                    >
                        {link.platform}
                    </a>
                ))}
            </div>

            <p className="text-sm tracking-widest uppercase text-[#888888]">
                © {new Date().getFullYear()} OpenSelf. Constructed with precision.
            </p>
        </footer>
    );
}
