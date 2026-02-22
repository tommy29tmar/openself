"use client";

import type { PageConfig, ComponentType } from "@/lib/page-config/schema";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { HeroSection } from "./HeroSection";
import { BioSection } from "./BioSection";
import { SkillsSection } from "./SkillsSection";
import { ProjectsSection } from "./ProjectsSection";
import { SocialSection } from "./SocialSection";
import { InterestsSection } from "./InterestsSection";
import { FooterSection } from "./FooterSection";

import type { HeroContent } from "@/lib/page-config/content-types";
import type { BioContent } from "@/lib/page-config/content-types";
import type { SkillsContent } from "@/lib/page-config/content-types";
import type { ProjectsContent } from "@/lib/page-config/content-types";
import type { SocialContent } from "@/lib/page-config/content-types";

type SectionRendererProps = {
  content: Record<string, unknown>;
  variant?: string;
};

const COMPONENT_MAP: Partial<
  Record<ComponentType, React.ComponentType<SectionRendererProps>>
> = {
  hero: ({ content, variant }) => (
    <HeroSection content={content as unknown as HeroContent} variant={variant} />
  ),
  bio: ({ content, variant }) => (
    <BioSection content={content as unknown as BioContent} variant={variant} />
  ),
  skills: ({ content, variant }) => (
    <SkillsSection content={content as unknown as SkillsContent} variant={variant} />
  ),
  projects: ({ content, variant }) => (
    <ProjectsSection content={content as unknown as ProjectsContent} variant={variant} />
  ),
  social: ({ content, variant }) => (
    <SocialSection content={content as unknown as SocialContent} variant={variant} />
  ),
  interests: ({ content, variant }) => (
    <InterestsSection content={content as unknown as { items: { name: string; detail?: string }[] }} variant={variant} />
  ),
};

type PageRendererProps = {
  config: PageConfig;
  previewMode?: boolean;
};

export function PageRenderer({ config, previewMode = false }: PageRendererProps) {
  return (
    <ThemeProvider theme={config.theme} style={config.style}>
      <main
        className={previewMode ? "pointer-events-none select-none" : undefined}
      >
        {config.sections.map((section) => {
          const Component = COMPONENT_MAP[section.type as ComponentType];

          if (!Component) {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                `[PageRenderer] Unknown section type: "${section.type}", skipping.`
              );
            }
            return null;
          }

          return (
            <Component
              key={section.id}
              content={section.content}
              variant={section.variant}
            />
          );
        })}
      </main>
      <FooterSection />
    </ThemeProvider>
  );
}
