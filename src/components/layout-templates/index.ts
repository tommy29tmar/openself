import type { LayoutTemplateId } from "@/lib/layout/contracts";
import type { LayoutComponentProps } from "./types";
import { MonolithLayout } from "./MonolithLayout";
import { CinematicLayout } from "./CinematicLayout";
import { CuratorLayout } from "./CuratorLayout";
import { ArchitectLayout } from "./ArchitectLayout";

type LayoutComponent = React.ComponentType<LayoutComponentProps>;

const LAYOUT_COMPONENTS: Record<LayoutTemplateId, LayoutComponent> = {
  monolith: MonolithLayout,
  cinematic: CinematicLayout,
  curator: CuratorLayout,
  architect: ArchitectLayout,
};

export function getLayoutComponent(id: LayoutTemplateId): LayoutComponent {
  return LAYOUT_COMPONENTS[id] ?? MonolithLayout;
}

export { MonolithLayout, CinematicLayout, CuratorLayout, ArchitectLayout };
export type { LayoutComponentProps } from "./types";
