import React, { useEffect } from "react";
import type { ThemeLayoutProps } from "../types";

export function EditorialLayout({ config, children }: ThemeLayoutProps) {
    // Scroll reveal using IntersectionObserver — works in any scroll container (builder preview, full page)
    useEffect(() => {
        const reveals = document.querySelectorAll('.theme-reveal');
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('opacity-100', 'translate-y-0');
                        entry.target.classList.remove('opacity-0', 'translate-y-4', 'translate-y-8');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.05 },
        );
        reveals.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    return (
        <div className="min-h-screen bg-[var(--page-bg)] text-[var(--page-fg)] font-light antialiased selection:bg-[var(--page-fg)] selection:text-[var(--page-bg)] relative overflow-x-hidden">
            {/* Subtle grain texture overlay */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
            
            {/* ThemeLayout is a visual wrapper only — no flex/grid flow control.
                Layout components (Vertical, Sidebar, Bento) handle structure. */}
            <main className="px-4 md:px-8 py-8 md:py-16">
                {children}
            </main>
            
            <div className="fixed top-0 left-0 w-1 h-full bg-[var(--page-border)] opacity-30 z-40 hidden md:block" />
            <div className="fixed top-0 right-0 w-1 h-full bg-[var(--page-border)] opacity-30 z-40 hidden md:block" />
        </div>
    );
}
