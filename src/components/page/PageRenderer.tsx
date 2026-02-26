"use client";

import React from "react";
import type { PageConfig, Section } from "@/lib/page-config/schema";
import { getTheme } from "@/themes";
import { resolveLayoutTemplate } from "@/lib/layout/registry";
import { resolveVariant } from "@/lib/layout/widgets";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { getLayoutComponent } from "@/components/layout-templates";
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

  // 2. Resolve layout template
  const template = resolveLayoutTemplate(config);
  const LayoutComponent = getLayoutComponent(template.id);

  // 3. Group sections by slot
  const slots = groupSectionsBySlot(config.sections, template);

  // 4. Render section with variant resolution and data-section wrapper
  const renderSection = (section: Section) => {
    const SectionComponent = activeTheme.components[section.type];

    if (!SectionComponent) {
      if (previewMode) {
        return (
          <div key={section.id} className="p-4 border border-dashed border-red-500 text-red-500 text-sm mb-4">
            Unsupported section type in theme &apos;{activeTheme.name}&apos;: {section.type}
          </div>
        );
      }
      return null;
    }

    const variant = resolveVariant(section);

    return (
      <div key={section.id} data-section={section.type}>
        <SectionComponent
          content={section.content}
          variant={variant}
        />
      </div>
    );
  };

  return (
    <>
      {isOwner && !previewMode && <OwnerBanner username={config.username} />}
      <ThemeLayout config={config} previewMode={previewMode}>
        <LayoutComponent slots={slots} renderSection={renderSection} />
      </ThemeLayout>
    </>
  );
}
