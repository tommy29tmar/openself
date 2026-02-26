import type { LayoutTemplateId } from "@/lib/layout/contracts";
import type { LayoutComponentProps } from "./types";
import { VerticalLayout } from "./VerticalLayout";
import { SidebarLayout } from "./SidebarLayout";
import { BentoLayout } from "./BentoLayout";

type LayoutComponent = React.ComponentType<LayoutComponentProps>;

const LAYOUT_COMPONENTS: Record<LayoutTemplateId, LayoutComponent> = {
  vertical: VerticalLayout,
  "sidebar-left": SidebarLayout,
  "bento-standard": BentoLayout,
};

export function getLayoutComponent(id: LayoutTemplateId): LayoutComponent {
  return LAYOUT_COMPONENTS[id] ?? VerticalLayout;
}

export { VerticalLayout, SidebarLayout, BentoLayout };
export type { LayoutComponentProps } from "./types";
