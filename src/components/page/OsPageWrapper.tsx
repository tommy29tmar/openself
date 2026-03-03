"use client";

import React, { useEffect, useRef } from "react";
import type { PageConfig } from "@/lib/page-config/schema";

type OsPageWrapperProps = {
  config: PageConfig;
  previewMode?: boolean;
  children: React.ReactNode;
};

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function OsPageWrapper({ config, previewMode = false, children }: OsPageWrapperProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const surface = config.surface ?? "canvas";
  const voice = config.voice ?? "signal";
  const light = config.light ?? "day";

  const presenceClasses = [
    "os-page",
    surface !== "canvas" ? `surface-${surface}` : "",
    voice !== "signal" ? `voice-${voice}` : "",
    light === "night" ? "light-night" : "",
    previewMode ? "preview-mode" : "",
  ].filter(Boolean).join(" ");

  // Scroll reveal — skip entirely in preview mode
  useEffect(() => {
    if (previewMode) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scrollParent = findScrollParent(wrapper);
    const reveals = wrapper.querySelectorAll(".theme-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, root: scrollParent },
    );
    reveals.forEach(el => observer.observe(el));
    requestAnimationFrame(() => {
      reveals.forEach(el => {
        const rect = el.getBoundingClientRect();
        const rootRect = scrollParent
          ? scrollParent.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight };
        if (rect.top < rootRect.bottom && rect.bottom > rootRect.top) {
          el.classList.add("revealed");
          observer.unobserve(el);
        }
      });
    });
    return () => observer.disconnect();
  }, [previewMode]);

  return (
    <div
      ref={wrapperRef}
      className={presenceClasses}
      style={{ minHeight: "100%", position: "relative", overflowX: "hidden" }}
    >
      <main style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
        {children}
      </main>
    </div>
  );
}
