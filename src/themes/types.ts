import type { PageConfig } from "@/lib/page-config/schema";

export type SectionProps<T = Record<string, unknown>> = {
    content: T;
    variant?: string;
};

export type ThemeLayoutProps = {
    config: PageConfig;
    previewMode?: boolean;
    children: React.ReactNode;
};

export type ThemeRegistryItem = {
    id: string;
    name: string;
    Layout: React.ComponentType<ThemeLayoutProps>;
    components: Record<string, React.ComponentType<any>>;
};
