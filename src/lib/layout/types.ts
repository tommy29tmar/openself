import type { ComponentType } from "@/lib/page-config/schema";
import type { SlotSize } from "./quality";
import type { LayoutTemplateId } from "./contracts";

export type FullSlotDefinition = {
  id: string;
  size: SlotSize;
  required?: boolean;
  maxSections?: number;
  accepts: ComponentType[];
  order: number;
  mobileOrder: number;
  affinity?: Partial<Record<ComponentType, number>>;
};

export type LayoutTemplateDefinition = {
  id: LayoutTemplateId;
  name: string;
  description: string;
  slots: FullSlotDefinition[];
  heroSlot: string;
  footerSlot: string;
};

// Re-export for convenience
export type { LayoutTemplateId } from "./contracts";
export type { SlotSize } from "./quality";
