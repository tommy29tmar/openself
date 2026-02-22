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
  passionateAbout: (items: string) => string;
  skillsLabel: string;
  interestsLabel: string;
};

const L10N: Record<string, L10nStrings> = {
  en: {
    welcomeTagline: (name) => `Welcome to ${name}'s page`,
    bioRoleAt: (name, role, company) => `${name} is a ${role} at ${company}.`,
    bioRole: (name, role) => `${name} is a ${role}.`,
    passionateAbout: (items) => `Passionate about ${items}.`,
    skillsLabel: "Skills",
    interestsLabel: "Interests",
  },
  it: {
    welcomeTagline: (name) => `Benvenuto nella pagina di ${name}`,
    bioRoleAt: (name, role, company) => `${name} è ${role} presso ${company}.`,
    bioRole: (name, role) => `${name} è ${role}.`,
    passionateAbout: (items) => `Appassionato/a di ${items}.`,
    skillsLabel: "Competenze",
    interestsLabel: "Interessi",
  },
  de: {
    welcomeTagline: (name) => `Willkommen auf ${name}s Seite`,
    bioRoleAt: (name, role, company) => `${name} ist ${role} bei ${company}.`,
    bioRole: (name, role) => `${name} ist ${role}.`,
    passionateAbout: (items) => `Begeistert von ${items}.`,
    skillsLabel: "Fähigkeiten",
    interestsLabel: "Interessen",
  },
  fr: {
    welcomeTagline: (name) => `Bienvenue sur la page de ${name}`,
    bioRoleAt: (name, role, company) => `${name} est ${role} chez ${company}.`,
    bioRole: (name, role) => `${name} est ${role}.`,
    passionateAbout: (items) => `Passionné(e) par ${items}.`,
    skillsLabel: "Compétences",
    interestsLabel: "Intérêts",
  },
  es: {
    welcomeTagline: (name) => `Bienvenido a la página de ${name}`,
    bioRoleAt: (name, role, company) => `${name} es ${role} en ${company}.`,
    bioRole: (name, role) => `${name} es ${role}.`,
    passionateAbout: (items) => `Apasionado/a por ${items}.`,
    skillsLabel: "Habilidades",
    interestsLabel: "Intereses",
  },
  pt: {
    welcomeTagline: (name) => `Bem-vindo à página de ${name}`,
    bioRoleAt: (name, role, company) => `${name} é ${role} na ${company}.`,
    bioRole: (name, role) => `${name} é ${role}.`,
    passionateAbout: (items) => `Apaixonado/a por ${items}.`,
    skillsLabel: "Competências",
    interestsLabel: "Interesses",
  },
  ja: {
    welcomeTagline: (name) => `${name}のページへようこそ`,
    bioRoleAt: (name, role, company) => `${name}は${company}の${role}です。`,
    bioRole: (name, role) => `${name}は${role}です。`,
    passionateAbout: (items) => `${items}に情熱を注いでいます。`,
    skillsLabel: "スキル",
    interestsLabel: "興味",
  },
  zh: {
    welcomeTagline: (name) => `欢迎来到${name}的页面`,
    bioRoleAt: (name, role, company) => `${name}是${company}的${role}。`,
    bioRole: (name, role) => `${name}是${role}。`,
    passionateAbout: (items) => `热衷于${items}。`,
    skillsLabel: "技能",
    interestsLabel: "兴趣",
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
    const role = identityFacts.find((f) => f.key === "role" || f.key === "title");
    if (role) {
      const rv = val(role);
      tagline = str(rv.role) ?? str(rv.title) ?? str(rv.value);
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

function buildBioSection(grouped: FactsByCategory, language: string): Section | null {
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

  const interests = interestFacts
    .map((f) => {
      const v = val(f);
      return str(v.name) ?? str(v.value) ?? f.key;
    })
    .slice(0, 5);

  // Template-based bio (localized)
  const l = getL10n(language);
  const parts: string[] = [];
  if (name) {
    if (role && company) {
      parts.push(l.bioRoleAt(name, role, company));
    } else if (role) {
      parts.push(l.bioRole(name, role));
    } else {
      parts.push(`${name}.`);
    }
  }

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
    return str(v.name) ?? str(v.value) ?? f.key;
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
      title: (str(v.title) ?? str(v.name) ?? f.key)!,
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
      name: (str(v.name) ?? str(v.value) ?? f.key)!,
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

export function composeOptimisticPage(facts: FactRow[], username: string, language: string = "en"): PageConfig {
  const grouped = groupByCategory(facts);

  const sections: Section[] = [];

  // 1. Hero — always present (uses placeholder if no identity facts)
  const identityFacts = grouped.get("identity") ?? [];
  const hero = buildHeroSection(identityFacts, language);
  if (hero) sections.push(hero);

  // 2. Bio
  const bio = buildBioSection(grouped, language);
  if (bio) sections.push(bio);

  // 3. Skills
  const skills = buildSkillsSection(grouped.get("skill") ?? [], language);
  if (skills) sections.push(skills);

  // 4. Projects
  const projects = buildProjectsSection(grouped.get("project") ?? []);
  if (projects) sections.push(projects);

  // 5. Interests
  const interests = buildInterestsSection(grouped.get("interest") ?? [], language);
  if (interests) sections.push(interests);

  // 6. Social
  const social = buildSocialSection(grouped.get("social") ?? []);
  if (social) sections.push(social);

  // 7. Footer — always appended
  sections.push(buildFooterSection());

  const config: PageConfig = {
    version: 1,
    username,
    theme: DEFAULT_THEME,
    style: { ...DEFAULT_STYLE },
    sections,
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
