"use client";

import React from "react";
import type { PageConfig, Section } from "@/lib/page-config/schema";
import { resolveLayoutTemplate } from "@/lib/layout/registry";
import { resolveVariant } from "@/lib/layout/widgets";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { getLayoutComponent } from "@/components/layout-templates";
import { OwnerBanner } from "@/components/page/OwnerBanner";
import { StickyNav, shouldShowStickyNav } from "@/components/page/StickyNav";
import { PageTopBar } from "@/components/page/PageTopBar";
import { filterCompleteSections } from "@/lib/page-config/section-completeness";
import { OsPageWrapper } from "@/components/page/OsPageWrapper";
import { SECTION_COMPONENTS } from "@/components/sections";
import { HiddenSectionCard } from "@/components/page/HiddenSectionCard";
import { SectionInteractionWrapper } from "@/components/page/SectionInteractionWrapper";
import type { SectionAction } from "@/components/page/SectionInteractionWrapper";

export type { SectionAction };

export type PageRendererProps = {
  config: PageConfig;
  previewMode?: boolean;
  isOwner?: boolean;
  /** Section types that are hidden from visitors. In preview mode, shown as ghost cards. */
  hiddenSections?: string[];
  /** Callback when user clicks "Show" on a hidden section ghost card (preview only). */
  onShowSection?: (sectionType: string) => void;
  /** Callback for canvas-style section interactions (edit, hide, move). Only active in preview mode. */
  onSectionAction?: (action: SectionAction) => void;
  /** Desktop action bar factory — receives section metadata, returns a React node positioned by SectionInteractionWrapper. */
  renderActionBar?: (props: { sectionType: string; sectionIndex: number; totalSections: number }) => React.ReactNode;
  /** Localized label for the "Show" button on hidden-section ghost cards. */
  showLabel?: string;
};

export function PageRenderer({
  config,
  previewMode = false,
  isOwner = false,
  hiddenSections = [],
  onShowSection,
  onSectionAction,
  renderActionBar,
  showLabel,
}: PageRendererProps) {
  const template = resolveLayoutTemplate(config);
  const LayoutComponent = getLayoutComponent(template.id);
  const rawSections = previewMode ? config.sections : filterCompleteSections(config.sections);
  const MONOLITH_HIDDEN = new Set(["social", "contact", "at-a-glance"]);

  const hiddenSet = new Set(hiddenSections);

  // In non-preview (public) mode, filter out hidden sections completely.
  // In preview mode, keep them for ghost card rendering.
  const visibleSections = previewMode
    ? (template.id === "monolith"
        ? rawSections.filter(s => !MONOLITH_HIDDEN.has(s.type))
        : rawSections)
    : (template.id === "monolith"
        ? rawSections.filter(s => !MONOLITH_HIDDEN.has(s.type) && !hiddenSet.has(s.type))
        : rawSections.filter(s => !hiddenSet.has(s.type)));

  const slots = groupSectionsBySlot(visibleSections, template);

  // Count of interactable (non-hidden) sections for move bounds
  const interactableSections = visibleSections.filter(s => !hiddenSet.has(s.type));
  const totalInteractable = interactableSections.length;

  const renderSection = (section: Section) => {
    // In preview mode, render hidden sections as ghost cards
    if (previewMode && hiddenSet.has(section.type)) {
      return (
        <div key={section.id} id={`section-${section.id}`} data-section={section.type}>
          <HiddenSectionCard
            sectionType={section.type}
            onShow={onShowSection ? () => onShowSection(section.type) : undefined}
            showLabel={showLabel}
          />
        </div>
      );
    }

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
    const sectionIndex = interactableSections.indexOf(section);

    const sectionContent = (
      <div id={`section-${section.id}`} data-section={section.type}>
        <SectionComponent content={section.content} variant={variant} />
      </div>
    );

    // Wrap with interaction handler only when onSectionAction is provided and in preview mode
    if (previewMode && onSectionAction) {
      return (
        <div key={section.id}>
          <SectionInteractionWrapper
            sectionType={section.type}
            sectionIndex={sectionIndex}
            totalSections={totalInteractable}
            onAction={onSectionAction}
            actionBar={renderActionBar?.({ sectionType: section.type, sectionIndex, totalSections: totalInteractable })}
          >
            {sectionContent}
          </SectionInteractionWrapper>
        </div>
      );
    }

    return (
      <div key={section.id}>
        {sectionContent}
      </div>
    );
  };

  const heroSection = config.sections.find(s => s.type === "hero");
  const heroName = (heroSection?.content?.name as string | undefined) ?? config.username;
  const heroAvatarUrl = heroSection?.content?.avatarUrl as string | undefined;

  // Owner view: keep OwnerBanner (sticky top) + StickyNav (fixed top-9) inside themed wrapper
  // Visitor view: unified PageTopBar (fixed top-0) — logo/login split on scroll, nav fades in center
  const navSections = visibleSections;
  const topBar = previewMode ? null : isOwner
    ? (shouldShowStickyNav(navSections)
        ? <StickyNav sections={navSections} name={heroName} avatarUrl={heroAvatarUrl} />
        : null)
    : <PageTopBar sections={navSections} name={heroName} avatarUrl={heroAvatarUrl} showStickyNav={shouldShowStickyNav(navSections)} />;

  return (
    <>
      {isOwner && !previewMode && <OwnerBanner username={config.username} />}
      <OsPageWrapper config={config} previewMode={previewMode} stickyNav={topBar}>
        <LayoutComponent slots={slots} renderSection={renderSection} />
      </OsPageWrapper>
    </>
  );
}
