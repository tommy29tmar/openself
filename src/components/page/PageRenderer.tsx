"use client";

import React from "react";
import type { PageConfig } from "@/lib/page-config/schema";
import { getTheme } from "@/themes";
import { OwnerBanner } from "@/components/page/OwnerBanner";

export type PageRendererProps = {
  config: PageConfig;
  previewMode?: boolean;
  isOwner?: boolean;
};

export function PageRenderer({ config, previewMode = false, isOwner = false }: PageRendererProps) {
  // 1. Resolve active theme
  const activeTheme = getTheme(config.theme || "editorial-360");
  const ThemeLayout = activeTheme.Layout;

  // 2. Render sections using theme-specific components
  return (
    <>
      {isOwner && !previewMode && <OwnerBanner username={config.username} />}
      <ThemeLayout config={config} previewMode={previewMode}>
        {config.sections.map((section) => {
          const SectionComponent = activeTheme.components[section.type];

          if (!SectionComponent) {
            if (previewMode) {
              return (
                <div key={section.id} className="p-4 border border-dashed border-red-500 text-red-500 text-sm mb-4">
                  Unsupported section type in theme '{activeTheme.name}': {section.type}
                </div>
              );
            }
            return null;
          }

          return (
            <SectionComponent
              key={section.id}
              content={section.content}
              variant={section.variant}
            />
          );
        })}
      </ThemeLayout>
    </>
  );
}
