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
import { Experience } from "./components/Experience";
import { Education } from "./components/Education";
import { Achievements } from "./components/Achievements";
import { Stats } from "./components/Stats";
import { Reading } from "./components/Reading";
import { Music } from "./components/Music";
import { Languages } from "./components/Languages";
import { Activities } from "./components/Activities";
import { Contact } from "./components/Contact";
import { Custom } from "./components/Custom";
import { AtAGlance } from "./components/AtAGlance";

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
    experience: Experience,
    education: Education,
    achievements: Achievements,
    stats: Stats,
    reading: Reading,
    music: Music,
    languages: Languages,
    activities: Activities,
    contact: Contact,
    custom: Custom,
    "at-a-glance": AtAGlance,
};

export const Editorial360Theme: ThemeRegistryItem = {
    id: "editorial-360",
    name: "Editorial 360",
    Layout: EditorialLayout,
    components,
};
