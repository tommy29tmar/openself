import React, { useEffect } from "react";
import type { ThemeLayoutProps } from "../types";

export function EditorialLayout({ config, children }: ThemeLayoutProps) {
    // Basic scroll reveal effect
    useEffect(() => {
        const reveals = document.querySelectorAll('.theme-reveal');
        const revealOnScroll = () => {
            const windowHeight = window.innerHeight;
            reveals.forEach(reveal => {
                const rect = reveal.getBoundingClientRect();
                if (rect.top < windowHeight - 100) {
                    reveal.classList.add('opacity-100', 'translate-y-0');
                    reveal.classList.remove('opacity-0', 'translate-y-4');
                }
            });
        };
        revealOnScroll();
        window.addEventListener('scroll', revealOnScroll);
        return () => window.removeEventListener('scroll', revealOnScroll);
    }, []);

    return (
        <div className="min-h-screen bg-[#fafafa] text-[#111111] font-light antialiased selection:bg-black selection:text-white">
            <main className="max-w-4xl mx-auto px-6 py-24 md:py-32 flex flex-col gap-12">
                {children}
            </main>
        </div>
    );
}
