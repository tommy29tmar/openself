import React, { useEffect, useRef } from "react";
import type { ThemeLayoutProps } from "../types";

/** Walk up the DOM to find the nearest scrollable ancestor (overflow-y: auto|scroll). */
function findScrollParent(el: HTMLElement): HTMLElement | null {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if (overflow === "auto" || overflow === "scroll") return node;
        node = node.parentElement;
    }
    return null; // viewport
}

export function EditorialLayout({ config, children, previewMode }: ThemeLayoutProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Scroll reveal using IntersectionObserver — skip entirely in builder preview
    // where sections must be immediately visible for content review.
    useEffect(() => {
        if (previewMode) return;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        // Use nearest scrollable ancestor as root so sections inside builder
        // preview (overflow-y: auto div) trigger correctly instead of never
        // intersecting the viewport.
        const scrollParent = findScrollParent(wrapper);
        const reveals = wrapper.querySelectorAll('.theme-reveal');
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.08, root: scrollParent },
        );
        reveals.forEach(el => observer.observe(el));
        // Reveal sections already in viewport on initial load
        requestAnimationFrame(() => {
            reveals.forEach(el => {
                const rect = el.getBoundingClientRect();
                const rootRect = scrollParent
                    ? scrollParent.getBoundingClientRect()
                    : { top: 0, bottom: window.innerHeight };
                if (rect.top < rootRect.bottom && rect.bottom > rootRect.top) {
                    el.classList.add('revealed');
                    observer.unobserve(el);
                }
            });
        });
        return () => observer.disconnect();
    }, [previewMode]);

    return (
        <div ref={wrapperRef} className={`min-h-screen bg-[var(--page-bg)] text-[var(--page-fg)] font-light antialiased selection:bg-[var(--page-fg)] selection:text-[var(--page-bg)] relative overflow-x-hidden${previewMode ? " preview-mode" : ""}`}>
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
