import type React from "react";
import type { SectionProps } from "@/themes/types";
import { Hero } from "@/themes/editorial-360/components/Hero";
import { Bio } from "@/themes/editorial-360/components/Bio";
import { Projects } from "@/themes/editorial-360/components/Projects";
import { Skills } from "@/themes/editorial-360/components/Skills";
import { Interests } from "@/themes/editorial-360/components/Interests";
import { Social } from "@/themes/editorial-360/components/Social";
import { Footer } from "@/themes/editorial-360/components/Footer";
import { Experience } from "@/themes/editorial-360/components/Experience";
import { Education } from "@/themes/editorial-360/components/Education";
import { Achievements } from "@/themes/editorial-360/components/Achievements";
import { Stats } from "@/themes/editorial-360/components/Stats";
import { Reading } from "@/themes/editorial-360/components/Reading";
import { Music } from "@/themes/editorial-360/components/Music";
import { Languages } from "@/themes/editorial-360/components/Languages";
import { Activities } from "@/themes/editorial-360/components/Activities";
import { Contact } from "@/themes/editorial-360/components/Contact";
import { Custom } from "@/themes/editorial-360/components/Custom";
import { Timeline } from "@/themes/editorial-360/components/Timeline";
import { AtAGlance } from "@/themes/editorial-360/components/AtAGlance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_COMPONENTS: Record<string, React.ComponentType<SectionProps<any>>> = {
  hero: Hero,
  bio: Bio,
  projects: Projects,
  skills: Skills,
  interests: Interests,
  social: Social,
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
  timeline: Timeline,
  "at-a-glance": AtAGlance,
};
