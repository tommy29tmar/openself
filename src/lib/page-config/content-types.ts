export type HeroContent = {
  name: string;
  tagline: string;
  avatarUrl?: string;
  socialLinks?: SocialLink[];
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
};

export type SocialLink = {
  platform: string;
  url: string;
  label?: string;
};

export type SocialContent = {
  links: SocialLink[];
};
