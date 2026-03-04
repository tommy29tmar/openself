"use client";

import React from "react";
import type { PageConfig, Section } from "@/lib/page-config/schema";
import { resolveLayoutTemplate } from "@/lib/layout/registry";
import { resolveVariant } from "@/lib/layout/widgets";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { getLayoutComponent } from "@/components/layout-templates";
import { OwnerBanner } from "@/components/page/OwnerBanner";
import { VisitorBanner } from "@/components/page/VisitorBanner";
import { StickyNav, shouldShowStickyNav } from "@/components/page/StickyNav";
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
  const rawSections = previewMode ? config.sections : filterCompleteSections(config.sections);
  const MONOLITH_HIDDEN = new Set(["social", "contact", "at-a-glance"]);
  const sections = template.id === "monolith"
    ? rawSections.filter(s => !MONOLITH_HIDDEN.has(s.type))
    : rawSections;
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

  const stickyNav = !previewMode && shouldShowStickyNav(sections) ? (
    <StickyNav
      sections={sections}
      name={(config.sections.find(s => s.type === "hero")?.content?.name as string | undefined) ?? config.username}
      avatarUrl={config.sections.find(s => s.type === "hero")?.content?.avatarUrl as string | undefined}
    />
  ) : null;

  return (
    <>
      {isOwner && !previewMode && <OwnerBanner username={config.username} />}
      {!isOwner && !previewMode && <VisitorBanner />}
      <OsPageWrapper config={config} previewMode={previewMode} stickyNav={stickyNav}>
        <LayoutComponent slots={slots} renderSection={renderSection} />
      </OsPageWrapper>
    </>
  );
}
