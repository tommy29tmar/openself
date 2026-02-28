import type { FactRow } from "@/lib/services/kb-service";
import type { PageConfig, Section, StyleConfig } from "@/lib/page-config/schema";
import { validatePageConfig } from "@/lib/page-config/schema";
import { logEvent } from "@/lib/services/event-service";
import { isDisplayableUsername } from "@/lib/page-config/usernames";
import type {
  HeroContent,
  BioContent,
  SkillsContent,
  ProjectItem,
  ProjectsContent,
  SocialLink,
  SocialContent,
  ExperienceItem,
  ExperienceContent,
  EducationItem,
  EducationContent,
  LanguageItem,
  LanguagesContent,
  AchievementItem,
  AchievementsContent,
  StatItem,
  StatsContent,
  ReadingItem,
  ReadingContent,
  MusicItem,
  MusicContent,
  ContactMethod,
  ContactContent,
  ActivityItem,
  ActivitiesContent,
} from "@/lib/page-config/content-types";
import type { LayoutTemplateId } from "@/lib/layout/contracts";
import { formatFactDate } from "@/lib/i18n/format-date";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";

const DEFAULT_STYLE: StyleConfig = {
  colorScheme: "light",
  primaryColor: "#111111",
  fontFamily: "inter",
  layout: "centered",
};

const DEFAULT_THEME = "minimal";

// --- Localized strings for page content ---

type L10nStrings = {
  welcomeTagline: (name: string) => string;
  bioRoleAt: (name: string, role: string, company: string) => string;
  bioRole: (name: string, role: string) => string;
  bioRoleAtFirstPerson: (role: string, company: string) => string;
  bioRoleFirstPerson: (role: string) => string;
  bioRoleFreelanceFirstPerson: (role: string) => string;
  passionateAbout: (items: string) => string;
  skillsLabel: string;
  interestsLabel: string;
  experienceLabel: string;
  educationLabel: string;
  achievementsLabel: string;
  languagesLabel: string;
  contactLabel: string;
  booksLabel: string;
  musicLabel: string;
  statsLabel: string;
  projectsLabel: string;
  activitiesLabel: string;
  currentLabel: string;
  atAGlanceLabel: string;
  profNative: string;
  profFluent: string;
  profAdvanced: string;
  profIntermediate: string;
  profBeginner: string;
  aboutLabel: string;
  interestsInto: string;
};

const L10N: Record<string, L10nStrings> = {
  en: {
    welcomeTagline: (name) => `Hello, I'm ${name}`,
    bioRoleAt: (name, role, company) => `${name} is a ${role} at ${company}.`,
    bioRole: (name, role) => `${name} is a ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `I am a ${role} at ${company}.`,
    bioRoleFirstPerson: (role) => `I am a ${role}.`,
    bioRoleFreelanceFirstPerson: (role) => `I am a freelance ${role}.`,
    passionateAbout: (items) => `Passionate about ${items}.`,
    skillsLabel: "Skills",
    interestsLabel: "Interests",
    experienceLabel: "Experience",
    educationLabel: "Education",
    achievementsLabel: "Achievements",
    languagesLabel: "Languages",
    contactLabel: "Contact",
    booksLabel: "Reading",
    musicLabel: "Music",
    statsLabel: "Stats",
    projectsLabel: "Projects",
    activitiesLabel: "Activities",
    currentLabel: "Current",
    atAGlanceLabel: "At a Glance",
    profNative: "native",
    profFluent: "fluent",
    profAdvanced: "advanced",
    profIntermediate: "intermediate",
    profBeginner: "beginner",
    aboutLabel: "About",
    interestsInto: "Into",
  },
  it: {
    welcomeTagline: (name) => `Ciao, sono ${name}`,
    bioRoleAt: (name, role, company) => `${name} è ${role} presso ${company}.`,
    bioRole: (name, role) => `${name} è ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Sono ${role} presso ${company}.`,
    bioRoleFirstPerson: (role) => `Sono ${role}.`,
    bioRoleFreelanceFirstPerson: (role) => `Sono ${role} freelance.`,
    passionateAbout: (items) => `Mi occupo di ${items}.`,
    skillsLabel: "Competenze",
    interestsLabel: "Interessi",
    experienceLabel: "Esperienza",
    educationLabel: "Formazione",
    achievementsLabel: "Traguardi",
    languagesLabel: "Lingue",
    contactLabel: "Contatti",
    booksLabel: "Letture",
    musicLabel: "Musica",
    statsLabel: "Statistiche",
    projectsLabel: "Progetti",
    activitiesLabel: "Attività",
    currentLabel: "Attuale",
    atAGlanceLabel: "Colpo d'Occhio",
    profNative: "madrelingua",
    profFluent: "fluente",
    profAdvanced: "avanzato",
    profIntermediate: "intermedio",
    profBeginner: "principiante",
    aboutLabel: "Chi Sono",
    interestsInto: "Appassionata di",
  },
  de: {
    welcomeTagline: (name) => `Willkommen auf ${name}s Seite`,
    bioRoleAt: (name, role, company) => `${name} ist ${role} bei ${company}.`,
    bioRole: (name, role) => `${name} ist ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Ich bin ${role} bei ${company}.`,
    bioRoleFirstPerson: (role) => `Ich bin ${role}.`,
    bioRoleFreelanceFirstPerson: (role) => `Ich bin freiberufliche/r ${role}.`,
    passionateAbout: (items) => `Begeistert von ${items}.`,
    skillsLabel: "Fähigkeiten",
    interestsLabel: "Interessen",
    experienceLabel: "Erfahrung",
    educationLabel: "Ausbildung",
    achievementsLabel: "Erfolge",
    languagesLabel: "Sprachen",
    contactLabel: "Kontakt",
    booksLabel: "Lektüre",
    musicLabel: "Musik",
    statsLabel: "Statistiken",
    projectsLabel: "Projekte",
    activitiesLabel: "Aktivitäten",
    currentLabel: "Aktuell",
    atAGlanceLabel: "Auf einen Blick",
    profNative: "Muttersprache",
    profFluent: "fließend",
    profAdvanced: "fortgeschritten",
    profIntermediate: "Mittelstufe",
    profBeginner: "Anfänger",
    aboutLabel: "Über Mich",
    interestsInto: "Begeistert von",
  },
  fr: {
    welcomeTagline: (name) => `Bienvenue sur la page de ${name}`,
    bioRoleAt: (name, role, company) => `${name} est ${role} chez ${company}.`,
    bioRole: (name, role) => `${name} est ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Je suis ${role} chez ${company}.`,
    bioRoleFirstPerson: (role) => `Je suis ${role}.`,
    bioRoleFreelanceFirstPerson: (role) => `Je suis ${role} freelance.`,
    passionateAbout: (items) => `Passionné(e) par ${items}.`,
    skillsLabel: "Compétences",
    interestsLabel: "Intérêts",
    experienceLabel: "Expérience",
    educationLabel: "Formation",
    achievementsLabel: "Réalisations",
    languagesLabel: "Langues",
    contactLabel: "Contact",
    booksLabel: "Lectures",
    musicLabel: "Musique",
    statsLabel: "Statistiques",
    projectsLabel: "Projets",
    activitiesLabel: "Activités",
    currentLabel: "En cours",
    atAGlanceLabel: "En un Coup d'Œil",
    profNative: "natif",
    profFluent: "courant",
    profAdvanced: "avancé",
    profIntermediate: "intermédiaire",
    profBeginner: "débutant",
    aboutLabel: "À Propos",
    interestsInto: "Passionné(e) de",
  },
  es: {
    welcomeTagline: (name) => `Bienvenido a la página de ${name}`,
    bioRoleAt: (name, role, company) => `${name} es ${role} en ${company}.`,
    bioRole: (name, role) => `${name} es ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Soy ${role} en ${company}.`,
    bioRoleFirstPerson: (role) => `Soy ${role}.`,
    bioRoleFreelanceFirstPerson: (role) => `Soy ${role} freelance.`,
    passionateAbout: (items) => `Apasionado/a por ${items}.`,
    skillsLabel: "Habilidades",
    interestsLabel: "Intereses",
    experienceLabel: "Experiencia",
    educationLabel: "Educación",
    achievementsLabel: "Logros",
    languagesLabel: "Idiomas",
    contactLabel: "Contacto",
    booksLabel: "Lecturas",
    musicLabel: "Música",
    statsLabel: "Estadísticas",
    projectsLabel: "Proyectos",
    activitiesLabel: "Actividades",
    currentLabel: "Actual",
    atAGlanceLabel: "De un Vistazo",
    profNative: "nativo",
    profFluent: "fluido",
    profAdvanced: "avanzado",
    profIntermediate: "intermedio",
    profBeginner: "principiante",
    aboutLabel: "Sobre Mí",
    interestsInto: "Apasionado/a de",
  },
  pt: {
    welcomeTagline: (name) => `Bem-vindo à página de ${name}`,
    bioRoleAt: (name, role, company) => `${name} é ${role} na ${company}.`,
    bioRole: (name, role) => `${name} é ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Sou ${role} na ${company}.`,
    bioRoleFirstPerson: (role) => `Sou ${role}.`,
    bioRoleFreelanceFirstPerson: (role) => `Sou ${role} freelancer.`,
    passionateAbout: (items) => `Apaixonado/a por ${items}.`,
    skillsLabel: "Competências",
    interestsLabel: "Interesses",
    experienceLabel: "Experiência",
    educationLabel: "Educação",
    achievementsLabel: "Conquistas",
    languagesLabel: "Idiomas",
    contactLabel: "Contacto",
    booksLabel: "Leituras",
    musicLabel: "Música",
    statsLabel: "Estatísticas",
    projectsLabel: "Projetos",
    activitiesLabel: "Atividades",
    currentLabel: "Atual",
    atAGlanceLabel: "Num Relance",
    profNative: "nativo",
    profFluent: "fluente",
    profAdvanced: "avançado",
    profIntermediate: "intermediário",
    profBeginner: "iniciante",
    aboutLabel: "Sobre Mim",
    interestsInto: "Apaixonado/a por",
  },
  ja: {
    welcomeTagline: (name) => `${name}のページへようこそ`,
    bioRoleAt: (name, role, company) => `${name}は${company}の${role}です。`,
    bioRole: (name, role) => `${name}は${role}です。`,
    bioRoleAtFirstPerson: (role, company) => `${company}で${role}をしています。`,
    bioRoleFirstPerson: (role) => `${role}をしています。`,
    bioRoleFreelanceFirstPerson: (role) => `フリーランスの${role}です。`,
    passionateAbout: (items) => `${items}に情熱を注いでいます。`,
    skillsLabel: "スキル",
    interestsLabel: "興味",
    experienceLabel: "経歴",
    educationLabel: "学歴",
    achievementsLabel: "実績",
    languagesLabel: "言語",
    contactLabel: "連絡先",
    booksLabel: "読書",
    musicLabel: "音楽",
    statsLabel: "統計",
    projectsLabel: "プロジェクト",
    activitiesLabel: "活動",
    currentLabel: "現在",
    atAGlanceLabel: "概要",
    profNative: "ネイティブ",
    profFluent: "流暢",
    profAdvanced: "上級",
    profIntermediate: "中級",
    profBeginner: "初級",
    aboutLabel: "自己紹介",
    interestsInto: "興味",
  },
  zh: {
    welcomeTagline: (name) => `欢迎来到${name}的页面`,
    bioRoleAt: (name, role, company) => `${name}是${company}的${role}。`,
    bioRole: (name, role) => `${name}是${role}。`,
    bioRoleAtFirstPerson: (role, company) => `我是${company}的${role}。`,
    bioRoleFirstPerson: (role) => `我是${role}。`,
    bioRoleFreelanceFirstPerson: (role) => `我是自由职业${role}。`,
    passionateAbout: (items) => `热衷于${items}。`,
    skillsLabel: "技能",
    interestsLabel: "兴趣",
    experienceLabel: "经历",
    educationLabel: "教育",
    achievementsLabel: "成就",
    languagesLabel: "语言",
    contactLabel: "联系方式",
    booksLabel: "阅读",
    musicLabel: "音乐",
    statsLabel: "统计",
    projectsLabel: "项目",
    activitiesLabel: "活动",
    currentLabel: "当前",
    atAGlanceLabel: "一览",
    profNative: "母语",
    profFluent: "流利",
    profAdvanced: "高级",
    profIntermediate: "中级",
    profBeginner: "初级",
    aboutLabel: "关于我",
    interestsInto: "热爱",
  },
};

function getL10n(language: string): L10nStrings {
  return L10N[language] ?? L10N.en;
}

type FactsByCategory = Map<string, FactRow[]>;

function groupByCategory(facts: FactRow[]): FactsByCategory {
  const grouped: FactsByCategory = new Map();
  for (const fact of facts) {
    const list = grouped.get(fact.category) ?? [];
    list.push(fact);
    grouped.set(fact.category, list);
  }
  return grouped;
}

function val(fact: FactRow): Record<string, unknown> {
  if (typeof fact.value === "object" && fact.value !== null && !Array.isArray(fact.value)) {
    return fact.value as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}


/** Languages where common nouns (job titles, roles) are capitalized. */
const CAPITALIZE_NOUNS_LANGUAGES = new Set(["de"]);

/** Lowercase the first character of a role/title for use in prose, unless the language capitalizes common nouns. */
function lowerRole(role: string, language: string): string {
  if (CAPITALIZE_NOUNS_LANGUAGES.has(language)) return role;
  if (role.length === 0) return role;
  return role.toLowerCase();
}

const FREELANCE_MARKERS = new Set([
  "freelance", "self-employed", "independent", "freelancer",
  "indépendant", "selbstständig", "autónomo", "libero professionista",
  "autonomo", "indipendente",
]);

function buildHeroSection(
  identityFacts: FactRow[],
  experienceFacts: FactRow[],
  interestFacts: FactRow[],
  language: string,
  username: string,
  socialFacts?: FactRow[],
  contactFacts?: FactRow[],
  languageFacts?: FactRow[],
): Section | null {
  let name: string | undefined;
  let tagline: string | undefined;

  for (const fact of identityFacts) {
    const v = val(fact);
    if (fact.key === "full-name" || fact.key === "name") {
      name = str(v.full) ?? str(v.name) ?? str(v.value) ?? str(v.full_name);
    }
    if (fact.key === "tagline") {
      tagline = str(v.tagline) ?? str(v.text) ?? str(v.value);
    }
  }

  if (!name) {
    // Try harder: scan all identity facts for a name-like value
    for (const fact of identityFacts) {
      const v = val(fact);
      const candidate = str(v.full) ?? str(v.name) ?? str(v.full_name);
      if (candidate) {
        name = candidate;
        break;
      }
    }
  }

  // Fallback chain: explicit name → displayable username → localized neutral
  const l = getL10n(language);
  const heroName = name ?? (isDisplayableUsername(username) ? username : undefined);

  if (!tagline) {
    // 1. Try role from identity facts
    const roleFact = identityFacts.find((f) => f.key === "role" || f.key === "title");
    if (roleFact) {
      const rv = val(roleFact);
      const role = str(rv.role) ?? str(rv.title) ?? str(rv.value);
      if (role) {
        tagline = role;
      }
    }
  }

  if (!tagline) {
    // 2. Try role from experience facts
    for (const fact of experienceFacts) {
      const v = val(fact);
      const role = str(v.role) ?? str(v.title) ?? str(v.position);
      if (role) {
        tagline = role;
        break;
      }
    }
  }

  if (!tagline && interestFacts.length > 0) {
    // 3. Use top interests as snapshot
    const interests: string[] = [];
    for (const fact of interestFacts) {
      const v = val(fact);
      const interest = str(v.name) ?? str(v.interest) ?? str(v.value);
      if (interest) {
        interests.push(interest);
        if (interests.length >= 3) break;
      }
    }
    if (interests.length > 0) {
      tagline = interests.join(", ");
    }
  }

  // If only name and no tagline: leave empty (name is already shown in hero)
  const finalTagline = tagline ?? "";

  const finalName = heroName ?? l.welcomeTagline("").replace(/,?\s*$/, "").trim();

  // ContactBar data (injected from social, contact, language facts)
  const socialLinks: { platform: string; url: string }[] = [];
  for (const f of socialFacts ?? []) {
    const v = val(f);
    const platform = str(v.platform) ?? str(v.name) ?? f.key;
    const url = str(v.url) ?? str(v.link);
    if (platform && url) socialLinks.push({ platform, url });
  }

  // Include website-type contact facts in hero social links
  for (const f of contactFacts ?? []) {
    const v = val(f);
    if (str(v.type) === "website") {
      const url = str(v.value) ?? str(v.url);
      if (url) {
        socialLinks.push({ platform: "website", url: url.startsWith("http") ? url : `https://${url}` });
      }
    }
  }

  // Email selection: visibility controls which emails appear.
  // Priority: "public" > "proposed" (user explicitly approved > auto-proposed).
  const emailFacts = (contactFacts ?? []).filter((f) => {
    const v = val(f);
    const t = str(v.type);
    return t === "email" || (!t && (str(v.email) || str(v.value)?.includes("@")));
  });
  // Sort: public first, then proposed
  emailFacts.sort((a, b) => {
    if (a.visibility === "public" && b.visibility !== "public") return -1;
    if (b.visibility === "public" && a.visibility !== "public") return 1;
    return 0;
  });
  const contactEmail =
    emailFacts.length > 0
      ? str(val(emailFacts[0]).email) ?? str(val(emailFacts[0]).value)
      : undefined;

  const languageItems: { language: string; proficiency?: string }[] = [];
  for (const f of languageFacts ?? []) {
    const v = val(f);
    const lang = str(v.language) ?? str(v.name) ?? str(v.value);
    if (lang) {
      languageItems.push({
        language: lang,
        proficiency: localizeProficiency(str(v.proficiency) ?? str(v.level), language),
      });
    }
  }

  const content: HeroContent = {
    name: heroName ?? finalName,
    tagline: finalTagline,
  };
  if (socialLinks.length > 0) content.socialLinks = socialLinks;
  if (contactEmail) content.contactEmail = contactEmail;
  if (languageItems.length > 0) content.languages = languageItems;

  return {
    id: "hero-1",
    type: "hero",
    variant: "large",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildBioSection(grouped: FactsByCategory, language: string, hasInterestsSection: boolean = false): Section | null {
  const identityFacts = grouped.get("identity") ?? [];
  const experienceFacts = grouped.get("experience") ?? [];
  const interestFacts = grouped.get("interest") ?? [];

  if (identityFacts.length === 0 && experienceFacts.length === 0 && interestFacts.length === 0) {
    return null;
  }

  let name: string | undefined;
  let role: string | undefined;
  let company: string | undefined;

  for (const fact of identityFacts) {
    const v = val(fact);
    if (fact.key === "full-name" || fact.key === "name") {
      name = str(v.full) ?? str(v.name) ?? str(v.value) ?? str(v.full_name);
    }
    if (fact.key === "role" || fact.key === "title") {
      role = str(v.role) ?? str(v.title) ?? str(v.value);
    }
    if (fact.key === "company" || fact.key === "organization") {
      company = str(v.company) ?? str(v.organization) ?? str(v.value);
    }
  }

  // Also check experience facts for role/company
  if (!role || !company) {
    for (const fact of experienceFacts) {
      const v = val(fact);
      if (!role) role = str(v.role) ?? str(v.title);
      if (!company) company = str(v.company) ?? str(v.organization);
    }
  }

  // Template-based bio (localized)
  const l = getL10n(language);
  const parts: string[] = [];
  
  // Try first-person if name is already in Hero
  const isFreelance = company ? FREELANCE_MARKERS.has(company.toLowerCase()) : false;

  if (role && isFreelance) {
    parts.push(l.bioRoleFreelanceFirstPerson(lowerRole(role, language)));
  } else if (role && company) {
    parts.push(l.bioRoleAtFirstPerson(lowerRole(role, language), company));
  } else if (role) {
    parts.push(l.bioRoleFirstPerson(lowerRole(role, language)));
  } else if (name) {
    // If no role, only use name if we really have to
    parts.push(`${name}.`);
  }

  // Only list interests if they aren't in a separate section, or only 3 if they are
  const maxInterests = hasInterestsSection ? 3 : 5;
  const interests = interestFacts
    .map((f) => {
      const v = val(f);
      return str(v.name) ?? str(v.value);
    })
    .filter((s): s is string => s !== undefined)
    .slice(0, maxInterests);

  if (interests.length > 0) {
    parts.push(l.passionateAbout(interests.join(", ")));
  }

  if (parts.length === 0) return null;

  const content: BioContent = { text: parts.join(" "), title: l.aboutLabel };

  return {
    id: "bio-1",
    type: "bio",
    variant: "full",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildSkillsSection(skillFacts: FactRow[], language: string): Section | null {
  if (skillFacts.length === 0) return null;

  const skills = skillFacts
    .map((f) => {
      const v = val(f);
      return str(v.name) ?? str(v.value);
    })
    .filter((s): s is string => s !== undefined);

  if (skills.length === 0) return null;

  const content: SkillsContent = {
    groups: [{ label: getL10n(language).skillsLabel, skills }],
  };

  return {
    id: "skills-1",
    type: "skills",
    variant: "chips",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildProjectsSection(projectFacts: FactRow[], language: string, extraItems: ProjectItem[] = []): Section | null {
  const items: ProjectItem[] = projectFacts
    .map((f) => {
      const v = val(f);
      const title = str(v.title) ?? str(v.name);
      if (!title) return null;
      const item: ProjectItem = { title };
      const desc = str(v.description);
      if (desc) item.description = desc;
      const url = str(v.url);
      if (url) item.url = url;
      if (Array.isArray(v.tags)) {
        item.tags = v.tags.filter((t): t is string => typeof t === "string");
      }
      return item;
    })
    .filter((item): item is ProjectItem => item !== null);

  // Merge any extra items (e.g. from client-type experience facts)
  const allItems = [...items, ...extraItems];

  if (allItems.length === 0) return null;

  const content: ProjectsContent = { items: allItems, title: getL10n(language).projectsLabel };

  return {
    id: "projects-1",
    type: "projects",
    variant: "grid",
    content: content as unknown as Record<string, unknown>,
  };
}

/** Convert client-type experience facts into ProjectItem[] for the projects section. */
function buildProjectsFromExperience(experienceFacts: FactRow[]): ProjectItem[] {
  return experienceFacts
    .filter((f) => str(val(f).type) === "client")
    .map((f) => {
      const v = val(f);
      const role = str(v.role) ?? str(v.title) ?? "";
      const company = str(v.company);
      if (!role && !company) return null;
      const title = role && company ? `${role} — ${company}` : role || company || "";
      if (!title) return null;
      const item: ProjectItem = { title };
      const description = str(v.description);
      if (description) item.description = description;
      return item;
    })
    .filter((item): item is ProjectItem => item !== null);
}

function buildInterestsSection(interestFacts: FactRow[], language: string): Section | null {
  if (interestFacts.length === 0) return null;

  const items = interestFacts
    .map((f) => {
      const v = val(f);
      const name = str(v.name) ?? str(v.value);
      if (!name) return null;
      const item: { name: string; detail?: string } = { name };
      const detail = str(v.detail);
      if (detail) item.detail = detail;
      return item;
    })
    .filter((item): item is { name: string; detail?: string } => item !== null);

  if (items.length === 0) return null;

  return {
    id: "interests-1",
    type: "interests",
    variant: "chips",
    content: { title: getL10n(language).interestsLabel, items } as Record<string, unknown>,
  };
}

function buildSocialSection(socialFacts: FactRow[]): Section | null {
  if (socialFacts.length === 0) return null;

  const links: SocialLink[] = socialFacts
    .map((f) => {
      const v = val(f);
      const url = str(v.url) ?? str(v.value);
      if (!url) return null;
      const link: SocialLink = {
        platform: str(v.platform) ?? f.key,
        url,
      };
      const label = str(v.label);
      if (label) link.label = label;
      return link;
    })
    .filter((link): link is SocialLink => link !== null);

  if (links.length === 0) return null;

  const content: SocialContent = { links };

  return {
    id: "social-1",
    type: "social",
    variant: "icons",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildFooterSection(): Section {
  return {
    id: "footer-1",
    type: "footer",
    content: {},
  };
}

function buildTimelineSection(experienceFacts: FactRow[], language: string): Section | null {
  if (experienceFacts.length === 0) return null;

  const items = experienceFacts
    .map((f) => {
      const v = val(f);
      const title = str(v.role) ?? str(v.title);
      if (!title) return null;
      return {
        title,
        subtitle: str(v.company) ?? str(v.organization),
        date: str(v.period) ?? str(v.date),
        description: str(v.description),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (items.length === 0) return null;

  return {
    id: "timeline-1",
    type: "timeline",
    variant: "list",
    content: {
      title: getL10n(language).experienceLabel,
      items,
    } as Record<string, unknown>,
  };
}

// --- Extended section builders (Phase 1b) ---

function isExtendedSectionsEnabled(): boolean {
  return process.env.EXTENDED_SECTIONS === "true";
}

function buildExperienceSection(experienceFacts: FactRow[], language: string): Section | null {
  // Filter: employment (undefined/employment) + freelance → experience; client → projects (handled separately)
  const employmentFacts = experienceFacts.filter((f) => {
    const t = str(val(f).type);
    return !t || t === "employment" || t === "freelance";
  });
  if (employmentFacts.length === 0) return null;

  const items: ExperienceItem[] = employmentFacts
    .map((f) => {
      const v = val(f);
      const title = str(v.role) ?? str(v.title);
      if (!title) return null;
      const item: ExperienceItem = { title };
      const company = str(v.company) ?? str(v.organization);
      if (company) item.company = company;
      const period = str(v.period) ?? str(v.date);
      if (period) item.period = period;
      const description = str(v.description);
      if (description) item.description = description;
      if (v.status === "current" || v.current === true) item.current = true;
      return item;
    })
    .filter((item): item is ExperienceItem => item !== null);

  if (items.length === 0) return null;

  const l10n = getL10n(language);
  const content: ExperienceContent = { items, title: l10n.experienceLabel, currentLabel: l10n.currentLabel };

  return {
    id: "experience-1",
    type: "experience",
    variant: "timeline",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildEducationSection(educationFacts: FactRow[], language: string): Section | null {
  if (educationFacts.length === 0) return null;

  const items: EducationItem[] = educationFacts
    .map((f) => {
      const v = val(f);
      const institution = str(v.institution) ?? str(v.school) ?? str(v.name);
      if (!institution) return null;
      const item: EducationItem = { institution };
      const degree = str(v.degree);
      if (degree) item.degree = degree;
      const field = str(v.field);
      if (field) item.field = field;
      const period = str(v.period) ?? str(v.date);
      if (period) item.period = period;
      const description = str(v.description);
      if (description) item.description = description;
      return item;
    })
    .filter((item): item is EducationItem => item !== null);

  if (items.length === 0) return null;

  const content: EducationContent = { items, title: getL10n(language).educationLabel };

  return {
    id: "education-1",
    type: "education",
    variant: "cards",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildAchievementsSection(achievementFacts: FactRow[], language: string): Section | null {
  if (achievementFacts.length === 0) return null;

  const items: AchievementItem[] = achievementFacts
    .map((f) => {
      const v = val(f);
      const title = str(v.title) ?? str(v.name);
      if (!title) return null;
      const item: AchievementItem = { title };
      const description = str(v.description);
      if (description) item.description = description;
      const date = str(v.date);
      if (date) item.date = formatFactDate(date, language);
      const issuer = str(v.issuer) ?? str(v.organization);
      if (issuer) item.issuer = issuer;
      return item;
    })
    .filter((item): item is AchievementItem => item !== null);

  if (items.length === 0) return null;

  const content: AchievementsContent = { items, title: getL10n(language).achievementsLabel };

  return {
    id: "achievements-1",
    type: "achievements",
    variant: "list",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildStatsSection(statFacts: FactRow[], language: string): Section | null {
  if (statFacts.length === 0) return null;

  const mapped = statFacts.map((f) => {
    const v = val(f);
    const label = str(v.label) ?? str(v.name);
    const value = str(v.value) ?? str(v.number);
    if (!label || !value) return null;
    return { label, value, unit: str(v.unit) } as StatItem;
  });
  const items = mapped.filter((item): item is StatItem => item !== null);

  if (items.length === 0) return null;

  const content: StatsContent = { items, title: getL10n(language).statsLabel };

  return {
    id: "stats-1",
    type: "stats",
    variant: "grid",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildReadingSection(readingFacts: FactRow[], language: string): Section | null {
  if (readingFacts.length === 0) return null;

  const items: ReadingItem[] = readingFacts
    .map((f) => {
      const v = val(f);
      const title = str(v.title) ?? str(v.name);
      if (!title) return null;
      const item: ReadingItem = { title };
      const author = str(v.author);
      if (author) item.author = author;
      if (typeof v.rating === "number") item.rating = v.rating;
      const note = str(v.note) ?? str(v.description);
      if (note) item.note = note;
      const url = str(v.url);
      if (url) item.url = url;
      return item;
    })
    .filter((item): item is ReadingItem => item !== null);

  if (items.length === 0) return null;

  const content: ReadingContent = { items, title: getL10n(language).booksLabel };

  return {
    id: "reading-1",
    type: "reading",
    variant: "list",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildMusicSection(musicFacts: FactRow[], language: string): Section | null {
  if (musicFacts.length === 0) return null;

  const items: MusicItem[] = musicFacts
    .map((f) => {
      const v = val(f);
      const title = str(v.title) ?? str(v.name);
      if (!title) return null;
      const item: MusicItem = { title };
      const artist = str(v.artist);
      // Dedup: suppress artist if same as title (case-insensitive)
      if (artist && artist.toLowerCase() !== title?.toLowerCase()) item.artist = artist;
      const note = str(v.note) ?? str(v.description);
      if (note) item.note = note;
      const url = str(v.url);
      if (url) item.url = url;
      return item;
    })
    .filter((item): item is MusicItem => item !== null);

  if (items.length === 0) return null;

  const content: MusicContent = { items, title: getL10n(language).musicLabel };

  return {
    id: "music-1",
    type: "music",
    variant: "list",
    content: content as unknown as Record<string, unknown>,
  };
}

const PROF_KEYS: Record<string, keyof L10nStrings> = {
  native: "profNative", fluent: "profFluent", advanced: "profAdvanced",
  intermediate: "profIntermediate", beginner: "profBeginner",
};

function localizeProficiency(rawProf: string | undefined, language: string): string | undefined {
  if (!rawProf) return undefined;
  const key = PROF_KEYS[rawProf.toLowerCase()];
  if (!key) return rawProf;
  return getL10n(language)[key] as string;
}

function buildLanguagesSection(languageFacts: FactRow[], language: string): Section | null {
  if (languageFacts.length === 0) return null;

  const l = getL10n(language);
  const items: LanguageItem[] = languageFacts
    .map((f) => {
      const v = val(f);
      const lang = str(v.language) ?? str(v.name);
      if (!lang) return null;
      const item: LanguageItem = { language: lang };
      const rawProf = str(v.proficiency) ?? str(v.level);
      if (rawProf) {
        item.proficiency = localizeProficiency(rawProf, language);
      }
      return item;
    })
    .filter((item): item is LanguageItem => item !== null);

  if (items.length === 0) return null;

  const content: LanguagesContent = { items, title: getL10n(language).languagesLabel };

  return {
    id: "languages-1",
    type: "languages",
    variant: "list",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildContactSection(contactFacts: FactRow[], language: string): Section | null {
  // Visibility already filtered globally at composeOptimisticPage top
  if (contactFacts.length === 0) return null;

  const methods: ContactMethod[] = contactFacts
    .map((f) => {
      const v = val(f);
      const value = str(v.value) ?? str(v.email) ?? str(v.phone) ?? str(v.address);
      if (!value) return null;
      const method: ContactMethod = {
        type: (str(v.type) ?? "other") as ContactMethod["type"],
        value,
      };
      const label = str(v.label);
      if (label) method.label = label;
      return method;
    })
    .filter((m): m is ContactMethod => m !== null);

  if (methods.length === 0) return null;

  const content: ContactContent = { methods, title: getL10n(language).contactLabel };

  return {
    id: "contact-1",
    type: "contact",
    variant: "card",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildActivitiesSection(activityFacts: FactRow[], language: string): Section | null {
  if (activityFacts.length === 0) return null;

  const items: ActivityItem[] = activityFacts
    .map((f) => {
      const v = val(f);
      const name = str(v.name) ?? str(v.value);
      if (!name) return null;
      const item: ActivityItem = { name };
      const activityType = str(v.activityType) ?? str(v.type);
      if (activityType) item.activityType = activityType as ActivityItem["activityType"];
      const frequency = str(v.frequency);
      if (frequency) item.frequency = frequency;
      const description = str(v.description);
      if (description) item.description = description;
      return item;
    })
    .filter((item): item is ActivityItem => item !== null);

  if (items.length === 0) return null;

  const content: ActivitiesContent = { items, title: getL10n(language).activitiesLabel };

  return {
    id: "activities-1",
    type: "activities",
    variant: "list",
    content: content as unknown as Record<string, unknown>,
  };
}

// --- At a Glance: fused stats + grouped skills + interests ---

const SKILL_DOMAINS: Record<string, string[]> = {
  "Frontend":  ["React", "Next.js", "Tailwind CSS", "Vue", "Angular", "Svelte", "CSS", "HTML"],
  "Backend":   ["Node.js", "Python", "Go", "Java", "Ruby", "PHP", "SQLite", "PostgreSQL", "Express", "FastAPI", "Django", "Spring"],
  "Infra":     ["Docker", "Kubernetes", "AWS", "GCP", "Git", "CI/CD", "Terraform", "Linux", "Nginx", "Vercel"],
  "Languages": ["TypeScript", "JavaScript", "Rust", "C++", "C#", "Swift", "Kotlin", "Scala"],
  "AI/ML":     ["PyTorch", "TensorFlow", "LangChain", "OpenAI", "Hugging Face"],
  "Design":    ["Figma", "Sketch", "Adobe XD"],
};

function groupSkillsByDomain(skillNames: string[]): { domain: string; skills: string[]; showLabel: boolean }[] {
  const groups: Record<string, string[]> = {};
  const assigned = new Set<string>();

  for (const [domain, domainSkills] of Object.entries(SKILL_DOMAINS)) {
    const matched = skillNames.filter(
      (s) => domainSkills.some((ds) => ds.toLowerCase() === s.toLowerCase()) && !assigned.has(s),
    );
    if (matched.length > 0) {
      groups[domain] = matched;
      matched.forEach((s) => assigned.add(s));
    }
  }

  const unmatched = skillNames.filter((s) => !assigned.has(s));
  if (unmatched.length > 0) groups["Other"] = unmatched;

  const result = Object.entries(groups).map(([domain, skills]) => ({ domain, skills, showLabel: true }));
  if (result.length <= 2) {
    for (const g of result) g.showLabel = false;
  }
  return result;
}

function buildAtAGlanceSection(
  skillFacts: FactRow[],
  statFacts: FactRow[],
  interestFacts: FactRow[],
  language: string,
): Section | null {
  const skills = skillFacts
    .map((f) => { const v = val(f); return str(v.name) ?? str(v.value); })
    .filter((s): s is string => s !== undefined);

  const stats = statFacts.map((f) => {
    const v = val(f);
    const label = str(v.label) ?? str(v.name);
    const value = str(v.value) ?? str(v.number);
    if (!label || !value) return null;
    return { label, value, unit: str(v.unit) };
  }).filter((s) => s !== null);

  const interests = interestFacts.map((f) => {
    const v = val(f);
    const name = str(v.name) ?? str(v.value);
    if (!name) return null;
    return { name };
  }).filter((i): i is { name: string } => i !== null);

  if (skills.length === 0 && stats.length === 0 && interests.length === 0) return null;

  const skillGroups = skills.length > 0 ? groupSkillsByDomain(skills) : undefined;

  const l = getL10n(language);
  const content: Record<string, unknown> = {
    title: l.atAGlanceLabel,
    interestsInto: l.interestsInto,
  };
  if (stats.length > 0) content.stats = stats;
  if (skillGroups) content.skillGroups = skillGroups;
  if (interests.length > 0) content.interests = interests;

  return {
    id: "at-a-glance-1",
    type: "at-a-glance",
    variant: "full",
    content,
  };
}

export function composeOptimisticPage(
  facts: FactRow[],
  username: string,
  language: string = "en",
  layoutTemplate?: LayoutTemplateId,
): PageConfig {
  // Global privacy gate: only compose from public/proposed facts
  const visibleFacts = facts.filter(
    (f) => f.visibility === "public" || f.visibility === "proposed",
  );
  const grouped = groupByCategory(visibleFacts);

  const sections: Section[] = [];

  // 1. Hero — always present (uses username fallback if no identity facts)
  const identityFacts = grouped.get("identity") ?? [];
  const interestFacts = grouped.get("interest") ?? [];
  const experienceFacts = grouped.get("experience") ?? [];
  const socialFacts = grouped.get("social") ?? [];
  const contactFacts = grouped.get("contact") ?? [];
  const languageFacts = grouped.get("language") ?? [];

  const extended = isExtendedSectionsEnabled();

  const hero = buildHeroSection(
    identityFacts, experienceFacts, interestFacts, language, username,
    extended ? socialFacts : undefined,
    extended ? contactFacts : undefined,
    extended ? languageFacts : undefined,
  );
  if (hero) sections.push(hero);

  // Check what sections we might have to avoid redundancy
  const hasInterestsSection = interestFacts.length > 0;

  // Bio — built once, pushed in appropriate order below
  const bio = buildBioSection(grouped, language, hasInterestsSection);

  if (extended) {
    // D5 order: bio → at-a-glance → experience → projects → education →
    //           achievements → reading → music → activities
    // Social/contact/languages absorbed into hero (Tasks 6-8)

    if (bio) sections.push(bio);

    const atAGlance = buildAtAGlanceSection(
      grouped.get("skill") ?? [],
      grouped.get("stat") ?? [],
      interestFacts,
      language,
    );
    if (atAGlance) sections.push(atAGlance);

    const experience = buildExperienceSection(experienceFacts, language);
    if (experience) sections.push(experience);

    // Merge project-category facts with client-type experience facts into a single projects section
    const clientProjectItems = buildProjectsFromExperience(experienceFacts);
    const projectFacts = grouped.get("project") ?? [];
    const projects = buildProjectsSection(projectFacts, language, clientProjectItems);
    if (projects) sections.push(projects);

    const education = buildEducationSection(grouped.get("education") ?? [], language);
    if (education) sections.push(education);

    const achievements = buildAchievementsSection(grouped.get("achievement") ?? [], language);
    if (achievements) sections.push(achievements);

    const reading = buildReadingSection(grouped.get("reading") ?? [], language);
    if (reading) sections.push(reading);

    const music = buildMusicSection(grouped.get("music") ?? [], language);
    if (music) sections.push(music);

    const activities = buildActivitiesSection(grouped.get("activity") ?? [], language);
    if (activities) sections.push(activities);
  } else {
    // Legacy order (unchanged)
    if (bio) sections.push(bio);

    const timeline = buildTimelineSection(experienceFacts, language);
    if (timeline) sections.push(timeline);

    const skills = buildSkillsSection(grouped.get("skill") ?? [], language);
    if (skills) sections.push(skills);

    const projects = buildProjectsSection(grouped.get("project") ?? [], language);
    if (projects) sections.push(projects);

    const interests = buildInterestsSection(interestFacts, language);
    if (interests) sections.push(interests);

    const social = buildSocialSection(socialFacts);
    if (social) sections.push(social);
  }

  // Footer — always appended
  sections.push(buildFooterSection());

  // Slot assignment: distribute sections into layout slots
  const resolvedTemplate = layoutTemplate ?? "vertical";
  const template = getLayoutTemplate(resolvedTemplate);
  const { sections: assigned, issues } = assignSlotsFromFacts(template, sections);

  let finalSections: Section[];
  let finalTemplate: LayoutTemplateId;

  if (issues.some((i) => i.severity === "error")) {
    // Fallback: use "vertical" if the requested template has errors
    const fallback = getLayoutTemplate("vertical");
    const { sections: fallbackAssigned } = assignSlotsFromFacts(fallback, sections);
    finalSections = fallbackAssigned;
    finalTemplate = "vertical";
  } else {
    finalSections = assigned;
    finalTemplate = resolvedTemplate;
  }

  const config: PageConfig = {
    version: 1,
    username,
    theme: DEFAULT_THEME,
    layoutTemplate: finalTemplate,
    style: { ...DEFAULT_STYLE },
    sections: finalSections,
  };

  return repairAndValidate(config, username, language);
}

const MAX_REPAIR_ATTEMPTS = 3;

function buildMinimalSafeConfig(username: string, _language: string): PageConfig {
  const heroContent: HeroContent = {
    name: username,
    tagline: "",
  };
  return {
    version: 1,
    username,
    theme: DEFAULT_THEME,
    style: { ...DEFAULT_STYLE },
    sections: [
      {
        id: "hero-1",
        type: "hero",
        variant: "large",
        content: heroContent as unknown as Record<string, unknown>,
      },
      buildFooterSection(),
    ],
  };
}

function attemptRepair(config: PageConfig, errors: string[]): void {
  // Fix top-level required fields
  if (typeof config.version !== "number" || config.version < 1) {
    config.version = 1;
  }
  if (typeof config.username !== "string" || config.username.trim().length === 0) {
    // Cannot fix without context — caller should handle
  }
  if (typeof config.theme !== "string" || config.theme.trim().length === 0) {
    config.theme = DEFAULT_THEME;
  }

  // Fix style
  if (!config.style || typeof config.style !== "object") {
    config.style = { ...DEFAULT_STYLE };
  } else {
    if (config.style.colorScheme !== "light" && config.style.colorScheme !== "dark") {
      config.style.colorScheme = DEFAULT_STYLE.colorScheme;
    }
    if (typeof config.style.primaryColor !== "string" || config.style.primaryColor.trim().length === 0) {
      config.style.primaryColor = DEFAULT_STYLE.primaryColor;
    }
    if (typeof config.style.fontFamily !== "string" || config.style.fontFamily.trim().length === 0) {
      config.style.fontFamily = DEFAULT_STYLE.fontFamily;
    }
    if (config.style.layout !== "centered" && config.style.layout !== "split" && config.style.layout !== "stack") {
      config.style.layout = DEFAULT_STYLE.layout;
    }
  }

  // Fix sections
  if (!Array.isArray(config.sections)) {
    config.sections = [];
    return;
  }

  // Remove invalid sections (missing id or type)
  config.sections = config.sections.filter(
    (s) => typeof s === "object" && s !== null && typeof s.id === "string" && typeof s.type === "string",
  );

  // Fix section-level content issues; collect indices of unfixable sections
  const toRemove = new Set<number>();

  for (let i = 0; i < config.sections.length; i++) {
    const section = config.sections[i];

    if (!section.content || typeof section.content !== "object" || Array.isArray(section.content)) {
      section.content = {};
    }

    // Fix known content requirements per type
    if (section.type === "hero") {
      const c = section.content as Record<string, unknown>;
      if (typeof c.name !== "string" || (c.name as string).trim().length === 0) {
        c.name = "Anonymous";
      }
      if (typeof c.tagline !== "string") {
        c.tagline = "";
      }
    }

    if (section.type === "bio") {
      const c = section.content as Record<string, unknown>;
      if (typeof c.text !== "string" || (c.text as string).trim().length === 0) {
        toRemove.add(i);
      }
    }

    if (section.type === "projects") {
      const c = section.content as Record<string, unknown>;
      if (!Array.isArray(c.items)) {
        toRemove.add(i);
      }
    }

    if (section.type === "skills") {
      const c = section.content as Record<string, unknown>;
      if (!Array.isArray(c.groups)) {
        toRemove.add(i);
      }
    }

    if (section.type === "interests") {
      const c = section.content as Record<string, unknown>;
      if (!Array.isArray(c.items)) {
        toRemove.add(i);
      }
    }

    if (section.type === "social") {
      const c = section.content as Record<string, unknown>;
      if (!Array.isArray(c.links)) {
        toRemove.add(i);
      }
    }

    // New extended section types — remove if required array is missing
    if (
      section.type === "experience" ||
      section.type === "education" ||
      section.type === "languages" ||
      section.type === "activities" ||
      section.type === "achievements" ||
      section.type === "stats" ||
      section.type === "reading" ||
      section.type === "music"
    ) {
      const c = section.content as Record<string, unknown>;
      if (!Array.isArray(c.items)) {
        toRemove.add(i);
      }
    }

    if (section.type === "contact") {
      const c = section.content as Record<string, unknown>;
      if (!Array.isArray(c.methods)) {
        toRemove.add(i);
      }
    }
  }

  // Remove unfixable sections
  if (toRemove.size > 0) {
    config.sections = config.sections.filter((_, i) => !toRemove.has(i));
  }
}

function repairAndValidate(config: PageConfig, username: string, language: string): PageConfig {
  const firstValidation = validatePageConfig(config);
  if (firstValidation.ok) {
    return config;
  }

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    const validation = validatePageConfig(config);
    if (validation.ok) {
      return config;
    }

    logEvent({
      eventType: "page_config_validation_failed",
      actor: "system",
      payload: {
        username,
        attempt,
        errors: validation.errors,
      },
    });

    attemptRepair(config, validation.errors);
  }

  // Final check after last repair
  const finalValidation = validatePageConfig(config);
  if (finalValidation.ok) {
    return config;
  }

  logEvent({
    eventType: "page_config_retry_exhausted",
    actor: "system",
    payload: {
      username,
      errors: finalValidation.errors,
    },
  });

  return buildMinimalSafeConfig(username, language);
}
