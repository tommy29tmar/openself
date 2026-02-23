import type { ThemeRegistryItem } from "../types";
import { EditorialLayout } from "./Layout";
import { Hero } from "./components/Hero";
import { Bio } from "./components/Bio";
import { Projects } from "./components/Projects";
import { Skills } from "./components/Skills";
import { Interests } from "./components/Interests";
import { Social } from "./components/Social";
import { Timeline } from "./components/Timeline";
import { Footer } from "./components/Footer";

// Components map connects schema component types to React components
const components: Record<string, React.ComponentType<any>> = {
    hero: Hero,
    bio: Bio,
    projects: Projects,
    skills: Skills,
    interests: Interests,
    social: Social,
    timeline: Timeline,
    footer: Footer,
};

export const Editorial360Theme: ThemeRegistryItem = {
    id: "editorial-360",
    name: "Editorial 360",
    Layout: EditorialLayout,
    components,
};
