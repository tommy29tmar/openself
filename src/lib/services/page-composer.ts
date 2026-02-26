import type { FactRow } from "@/lib/services/kb-service";
import type { PageConfig, Section, StyleConfig } from "@/lib/page-config/schema";
import { validatePageConfig } from "@/lib/page-config/schema";
import { logEvent } from "@/lib/services/event-service";
import type {
  HeroContent,
  BioContent,
  SkillsContent,
  ProjectItem,
  ProjectsContent,
  SocialLink,
  SocialContent,
} from "@/lib/page-config/content-types";
import type { LayoutTemplateId } from "@/lib/layout/contracts";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";

const DEFAULT_STYLE: StyleConfig = {
  colorScheme: "light",
  primaryColor: "#6366f1",
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
  passionateAbout: (items: string) => string;
  skillsLabel: string;
  interestsLabel: string;
  experienceLabel: string;
};

const L10N: Record<string, L10nStrings> = {
  en: {
    welcomeTagline: (name) => `Hello, I'm ${name}`,
    bioRoleAt: (name, role, company) => `${name} is a ${role} at ${company}.`,
    bioRole: (name, role) => `${name} is a ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `I am a ${role} at ${company}.`,
    bioRoleFirstPerson: (role) => `I am a ${role}.`,
    passionateAbout: (items) => `Passionate about ${items}.`,
    skillsLabel: "Skills",
    interestsLabel: "Interests",
    experienceLabel: "Experience",
  },
  it: {
    welcomeTagline: (name) => `Ciao, sono ${name}`,
    bioRoleAt: (name, role, company) => `${name} è ${role} presso ${company}.`,
    bioRole: (name, role) => `${name} è ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Sono ${role} presso ${company}.`,
    bioRoleFirstPerson: (role) => `Sono ${role}.`,
    passionateAbout: (items) => `Mi occupo di ${items}.`,
    skillsLabel: "Competenze",
    interestsLabel: "Interessi",
    experienceLabel: "Esperienza",
  },
  de: {
    welcomeTagline: (name) => `Willkommen auf ${name}s Seite`,
    bioRoleAt: (name, role, company) => `${name} ist ${role} bei ${company}.`,
    bioRole: (name, role) => `${name} ist ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Ich bin ${role} bei ${company}.`,
    bioRoleFirstPerson: (role) => `Ich bin ${role}.`,
    passionateAbout: (items) => `Begeistert von ${items}.`,
    skillsLabel: "Fähigkeiten",
    interestsLabel: "Interessen",
    experienceLabel: "Erfahrung",
  },
  fr: {
    welcomeTagline: (name) => `Bienvenue sur la page de ${name}`,
    bioRoleAt: (name, role, company) => `${name} est ${role} chez ${company}.`,
    bioRole: (name, role) => `${name} est ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Je suis ${role} chez ${company}.`,
    bioRoleFirstPerson: (role) => `Je suis ${role}.`,
    passionateAbout: (items) => `Passionné(e) par ${items}.`,
    skillsLabel: "Compétences",
    interestsLabel: "Intérêts",
    experienceLabel: "Expérience",
  },
  es: {
    welcomeTagline: (name) => `Bienvenido a la página de ${name}`,
    bioRoleAt: (name, role, company) => `${name} es ${role} en ${company}.`,
    bioRole: (name, role) => `${name} es ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Soy ${role} en ${company}.`,
    bioRoleFirstPerson: (role) => `Soy ${role}.`,
    passionateAbout: (items) => `Apasionado/a por ${items}.`,
    skillsLabel: "Habilidades",
    interestsLabel: "Intereses",
    experienceLabel: "Experiencia",
  },
  pt: {
    welcomeTagline: (name) => `Bem-vindo à página de ${name}`,
    bioRoleAt: (name, role, company) => `${name} é ${role} na ${company}.`,
    bioRole: (name, role) => `${name} é ${role}.`,
    bioRoleAtFirstPerson: (role, company) => `Sou ${role} na ${company}.`,
    bioRoleFirstPerson: (role) => `Sou ${role}.`,
    passionateAbout: (items) => `Apaixonado/a por ${items}.`,
    skillsLabel: "Competências",
    interestsLabel: "Interesses",
    experienceLabel: "Experiência",
  },
  ja: {
    welcomeTagline: (name) => `${name}のページへようこそ`,
    bioRoleAt: (name, role, company) => `${name}は${company}の${role}です。`,
    bioRole: (name, role) => `${name}は${role}です。`,
    bioRoleAtFirstPerson: (role, company) => `${company}で${role}をしています。`,
    bioRoleFirstPerson: (role) => `${role}をしています。`,
    passionateAbout: (items) => `${items}に情熱を注いでいます。`,
    skillsLabel: "スキル",
    interestsLabel: "興味",
    experienceLabel: "経歴",
  },
  zh: {
    welcomeTagline: (name) => `欢迎来到${name}的页面`,
    bioRoleAt: (name, role, company) => `${name}是${company}的${role}。`,
    bioRole: (name, role) => `${name}是${role}。`,
    bioRoleAtFirstPerson: (role, company) => `我是${company}的${role}。`,
    bioRoleFirstPerson: (role) => `我是${role}。`,
    passionateAbout: (items) => `热衷于${items}。`,
    skillsLabel: "技能",
    interestsLabel: "兴趣",
    experienceLabel: "经历",
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

/** Converts kebab-case to Title Case (e.g., 'my-project' -> 'My Project'). */
function beautifyKey(key: string): string {
  return key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Languages where common nouns (job titles, roles) are capitalized. */
const CAPITALIZE_NOUNS_LANGUAGES = new Set(["de"]);

/** Lowercase the first character of a role/title for use in prose, unless the language capitalizes common nouns. */
function lowerRole(role: string, language: string): string {
  if (CAPITALIZE_NOUNS_LANGUAGES.has(language)) return role;
  if (role.length === 0) return role;
  return role[0].toLowerCase() + role.slice(1);
}

function buildHeroSection(identityFacts: FactRow[], language: string): Section | null {
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

  // Always produce a hero — use placeholder if needed
  const heroName = name ?? "Anonymous";

  if (!tagline) {
    // Try to derive from identity facts (role, interests)
    const roleFact = identityFacts.find((f) => f.key === "role" || f.key === "title");
    if (roleFact) {
      const rv = val(roleFact);
      const role = str(rv.role) ?? str(rv.title) ?? str(rv.value);
      if (role) {
        tagline = getL10n(language).bioRoleFirstPerson(lowerRole(role, language));
      }
    }
  }

  const content: HeroContent = {
    name: heroName,
    tagline: tagline ?? getL10n(language).welcomeTagline(heroName),
  };

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
  if (role && company) {
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
      return str(v.name) ?? str(v.value) ?? f.key;
    })
    .slice(0, maxInterests);

  if (interests.length > 0) {
    parts.push(l.passionateAbout(interests.join(", ")));
  }

  if (parts.length === 0) return null;

  const content: BioContent = { text: parts.join(" ") };

  return {
    id: "bio-1",
    type: "bio",
    variant: "full",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildSkillsSection(skillFacts: FactRow[], language: string): Section | null {
  if (skillFacts.length === 0) return null;

  const skills = skillFacts.map((f) => {
    const v = val(f);
    return str(v.name) ?? str(v.value) ?? beautifyKey(f.key);
  });

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

function buildProjectsSection(projectFacts: FactRow[]): Section | null {
  if (projectFacts.length === 0) return null;

  const items: ProjectItem[] = projectFacts.map((f) => {
    const v = val(f);
    const item: ProjectItem = {
      title: (str(v.title) ?? str(v.name) ?? beautifyKey(f.key))!,
    };
    const desc = str(v.description);
    if (desc) item.description = desc;
    const url = str(v.url);
    if (url) item.url = url;
    if (Array.isArray(v.tags)) {
      item.tags = v.tags.filter((t): t is string => typeof t === "string");
    }
    return item;
  });

  const content: ProjectsContent = { items };

  return {
    id: "projects-1",
    type: "projects",
    variant: "grid",
    content: content as unknown as Record<string, unknown>,
  };
}

function buildInterestsSection(interestFacts: FactRow[], language: string): Section | null {
  if (interestFacts.length === 0) return null;

  const items = interestFacts.map((f) => {
    const v = val(f);
    const item: { name: string; detail?: string } = {
      name: (str(v.name) ?? str(v.value) ?? beautifyKey(f.key))!,
    };
    const detail = str(v.detail);
    if (detail) item.detail = detail;
    return item;
  });

  return {
    id: "interests-1",
    type: "interests",
    variant: "chips",
    content: { title: getL10n(language).interestsLabel, items } as Record<string, unknown>,
  };
}

function buildSocialSection(socialFacts: FactRow[]): Section | null {
  if (socialFacts.length === 0) return null;

  const links: SocialLink[] = socialFacts.map((f) => {
    const v = val(f);
    const link: SocialLink = {
      platform: (str(v.platform) ?? f.key)!,
      url: (str(v.url) ?? str(v.value) ?? "")!,
    };
    const label = str(v.label);
    if (label) link.label = label;
    return link;
  });

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

  const items = experienceFacts.map((f) => {
    const v = val(f);
    return {
      title: (str(v.role) ?? str(v.title) ?? f.key)!,
      subtitle: str(v.company) ?? str(v.organization),
      date: str(v.period) ?? str(v.date),
      description: str(v.description),
    };
  });

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

export function composeOptimisticPage(
  facts: FactRow[],
  username: string,
  language: string = "en",
  layoutTemplate?: LayoutTemplateId,
): PageConfig {
  const grouped = groupByCategory(facts);

  const sections: Section[] = [];

  // 1. Hero — always present (uses placeholder if no identity facts)
  const identityFacts = grouped.get("identity") ?? [];
  const hero = buildHeroSection(identityFacts, language);
  if (hero) sections.push(hero);

  // Check what sections we might have to avoid redundancy
  const interestFacts = grouped.get("interest") ?? [];
  const hasInterestsSection = interestFacts.length > 0;

  // 2. Bio
  const bio = buildBioSection(grouped, language, hasInterestsSection);
  if (bio) sections.push(bio);

  // 3. Experience / Timeline
  const experienceFacts = grouped.get("experience") ?? [];
  const timeline = buildTimelineSection(experienceFacts, language);
  if (timeline) sections.push(timeline);

  // 4. Skills
  const skills = buildSkillsSection(grouped.get("skill") ?? [], language);
  if (skills) sections.push(skills);

  // 5. Projects
  const projects = buildProjectsSection(grouped.get("project") ?? []);
  if (projects) sections.push(projects);

  // 6. Interests
  const interests = buildInterestsSection(interestFacts, language);
  if (interests) sections.push(interests);

  // 7. Social
  const social = buildSocialSection(grouped.get("social") ?? []);
  if (social) sections.push(social);

  // 8. Footer — always appended
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

function buildMinimalSafeConfig(username: string, language: string): PageConfig {
  const heroContent: HeroContent = {
    name: username,
    tagline: getL10n(language).welcomeTagline(username),
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
      if (typeof c.tagline !== "string" || (c.tagline as string).trim().length === 0) {
        c.tagline = `Welcome to ${c.name}'s page`;
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
