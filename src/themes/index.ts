import type { ThemeRegistryItem } from "./types";
import { Editorial360Theme } from "./editorial-360";

export const THEMES: Record<string, ThemeRegistryItem> = {
    "editorial-360": Editorial360Theme,
    // Map legacy themes to the new default for now to prevent breaking existing profiles
    "minimal": Editorial360Theme,
    "warm": Editorial360Theme,
};

export function getTheme(themeId: string): ThemeRegistryItem {
    return THEMES[themeId] || THEMES["editorial-360"];
}
