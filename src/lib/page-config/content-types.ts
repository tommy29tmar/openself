export type HeroContent = {
  name: string;
  tagline: string;
  avatarUrl?: string;
  socialLinks?: SocialLink[];
  contactEmail?: string;
  languages?: { language: string; proficiency?: string }[];
};

export type BioContent = {
  text: string;
};

export type SkillGroup = {
  label: string;
  skills: string[];
};

export type SkillsContent = {
  groups: SkillGroup[];
};

export type ProjectItem = {
  title: string;
  description?: string;
  url?: string;
  tags?: string[];
};

export type ProjectsContent = {
  items: ProjectItem[];
  title?: string;
};

export type SocialLink = {
  platform: string;
  url: string;
  label?: string;
};

export type SocialContent = {
  links: SocialLink[];
};

// Experience
export type ExperienceItem = {
  title: string;
  company?: string;
  period?: string;
  description?: string;
  current?: boolean;
};
export type ExperienceContent = { items: ExperienceItem[]; title?: string; currentLabel?: string };

// Education
export type EducationItem = {
  institution: string;
  degree?: string;
  field?: string;
  period?: string;
  description?: string;
};
export type EducationContent = { items: EducationItem[]; title?: string };

// Languages
export type LanguageItem = {
  language: string;
  proficiency?: string; // English keys: native/fluent/advanced/intermediate/beginner — localized at composition time
};
export type LanguagesContent = { items: LanguageItem[]; title?: string };

// Achievements
export type AchievementItem = {
  title: string;
  description?: string;
  date?: string;
  issuer?: string;
};
export type AchievementsContent = { items: AchievementItem[]; title?: string };

// Stats
export type StatItem = {
  label: string;
  value: string;
  unit?: string;
};
export type StatsContent = { items: StatItem[]; title?: string };

// Reading
export type ReadingItem = {
  title: string;
  author?: string;
  rating?: number;
  note?: string;
  url?: string;
};
export type ReadingContent = { items: ReadingItem[]; title?: string };

// Music
export type MusicItem = {
  title: string;
  artist?: string;
  note?: string;
  url?: string;
};
export type MusicContent = { items: MusicItem[]; title?: string };

// Contact
export type ContactMethod = {
  type: "email" | "phone" | "location" | "website" | "other";
  value: string;
  label?: string;
};
export type ContactContent = { methods: ContactMethod[]; title?: string };

// Activities
export type ActivityItem = {
  name: string;
  activityType?: "sport" | "volunteering" | "event" | "club" | "other";
  frequency?: string;
  description?: string;
};
export type ActivitiesContent = { items: ActivityItem[]; title?: string };

// Custom
export type CustomContent = {
  title?: string;
  body?: string;
  items?: { label: string; value: string }[];
};
