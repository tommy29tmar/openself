"use client";

import React from "react";
import type { PageConfig, Section } from "@/lib/page-config/schema";
import { resolveLayoutTemplate } from "@/lib/layout/registry";
import { resolveVariant } from "@/lib/layout/widgets";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { getLayoutComponent } from "@/components/layout-templates";
import { OwnerBanner } from "@/components/page/OwnerBanner";
import { VisitorBanner } from "@/components/page/VisitorBanner";
import { filterCompleteSections } from "@/lib/page-config/section-completeness";
import { OsPageWrapper } from "@/components/page/OsPageWrapper";
import { SECTION_COMPONENTS } from "@/components/sections";

export type PageRendererProps = {
  config: PageConfig;
  previewMode?: boolean;
  isOwner?: boolean;
};

export function PageRenderer({ config, previewMode = false, isOwner = false }: PageRendererProps) {
  const template = resolveLayoutTemplate(config);
  const LayoutComponent = getLayoutComponent(template.id);
  const sections = previewMode ? config.sections : filterCompleteSections(config.sections);
  const slots = groupSectionsBySlot(sections, template);

  const renderSection = (section: Section) => {
    const SectionComponent = SECTION_COMPONENTS[section.type];

    if (!SectionComponent) {
      if (previewMode) {
        return (
          <div key={section.id} className="p-4 border border-dashed border-red-500 text-red-500 text-sm mb-4">
            Unsupported section type: {section.type}
          </div>
        );
      }
      return null;
    }

    const variant = resolveVariant(section);

    return (
      <div key={section.id} id={`section-${section.id}`} data-section={section.type}>
        <SectionComponent content={section.content} variant={variant} />
      </div>
    );
  };

  return (
    <>
      {isOwner && !previewMode && <OwnerBanner username={config.username} />}
      {!isOwner && !previewMode && <VisitorBanner />}
      {/* StickyNav placeholder — added in Task 12 */}
      <OsPageWrapper config={config} previewMode={previewMode}>
        <LayoutComponent slots={slots} renderSection={renderSection} />
      </OsPageWrapper>
    </>
  );
}
