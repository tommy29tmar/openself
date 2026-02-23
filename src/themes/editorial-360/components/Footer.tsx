import React from "react";
import type { SectionProps } from "../../types";

type FooterContent = {
    text?: string;
};

export function Footer({ content }: SectionProps<FooterContent>) {
    return (
        <footer className="text-center pt-16 border-t border-black/15 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <p className="text-sm tracking-widest uppercase text-[#888888]">
                {content.text || `© ${new Date().getFullYear()} — Built with OpenSelf`}
            </p>
        </footer>
    );
}
