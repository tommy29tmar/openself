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
        <div className="min-h-screen bg-[#fafafa] text-[#111111] font-light antialiased selection:bg-black selection:text-white relative overflow-x-hidden">
            {/* Subtle grain texture overlay */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
            
            <main className="max-w-5xl mx-auto px-8 py-32 md:py-48 flex flex-col gap-32">
                {children}
            </main>
            
            <div className="fixed top-0 left-0 w-1 h-full bg-black/5 z-40 hidden md:block" />
            <div className="fixed top-0 right-0 w-1 h-full bg-black/5 z-40 hidden md:block" />
        </div>
    );
}
