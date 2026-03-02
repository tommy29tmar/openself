import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";

export function CuratorLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("curator");
  
  // Group sections
  const heroSections = slots["hero"] || [];
  const sidebarSections = slots["sidebar"] || [];
  const mainSections = slots["main"] || [];
  const footerSections = slots["footer"] || [];

  return (
    <div className={`layout-curator flex flex-col lg:flex-row gap-12 lg:gap-24 max-w-[1400px] mx-auto ${className ?? ""}`}>
      {/* Left Sidebar: Fixed / Sticky */}
      <aside className="w-full lg:w-[400px] lg:sticky lg:top-16 lg:max-h-[calc(100vh-8rem)] flex flex-col gap-12 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex flex-col gap-12">
          {heroSections.length > 0 && (
            <div className="flex flex-col gap-8">
              {heroSections.map(renderSection)}
            </div>
          )}
          
          {sidebarSections.length > 0 && (
            <div className="flex flex-col gap-10">
              {sidebarSections.map(renderSection)}
            </div>
          )}
        </div>
      </aside>

      {/* Right Content: Scrollable */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-col gap-24 lg:pt-4">
          {mainSections.length > 0 ? (
            mainSections.map(renderSection)
          ) : (
            <div className="text-[var(--page-fg-secondary)] text-sm italic">Nothing here yet.</div>
          )}
        </div>
        
        {footerSections.length > 0 && (
          <div className="mt-32 pt-12 border-t border-[var(--page-border)]">
            {footerSections.map(renderSection)}
          </div>
        )}
      </main>
    </div>
  );
}
