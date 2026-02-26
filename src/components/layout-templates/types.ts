import type { Section } from "@/lib/page-config/schema";

export type LayoutComponentProps = {
  slots: Record<string, Section[]>;
  renderSection: (section: Section) => React.ReactNode;
  className?: string;
};
