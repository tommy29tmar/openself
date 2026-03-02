"use client";

import React, { useEffect, useRef } from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";

export function CinematicLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("cinematic");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('opacity-100', 'translate-y-0');
          entry.target.classList.remove('opacity-0', 'translate-y-12');
        }
      });
    }, { threshold: 0.15 });

    const slides = containerRef.current?.querySelectorAll('.cinematic-slide');
    slides?.forEach(el => observer.observe(el));
    
    return () => observer.disconnect();
  }, [slots]);

  return (
    <div 
      ref={containerRef}
      className={`layout-cinematic max-w-5xl mx-auto flex flex-col ${className ?? ""}`}
    >
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        
        return (
          <div key={slot.id} className="w-full flex flex-col">
            {sections.map((section, idx) => (
              <div 
                key={`${slot.id}-${idx}`} 
                className="cinematic-slide min-h-[80vh] md:min-h-screen w-full flex flex-col justify-center border-b border-[var(--page-border)] opacity-0 translate-y-12 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] py-16 last:border-b-0"
              >
                {renderSection(section)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
