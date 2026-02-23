export type ComponentType =
  | "hero"
  | "bio"
  | "skills"
  | "projects"
  | "timeline"
  | "interests"
  | "achievements"
  | "stats"
  | "social"
  | "custom"
  | "reading"
  | "music"
  | "contact"
  | "footer";

export type CommunityComponentType = `x.${string}.${string}`;
export type AnyComponentType = ComponentType | CommunityComponentType;

export type StyleConfig = {
  colorScheme: "light" | "dark";
  primaryColor: string;
  fontFamily: string;
  layout: "centered" | "split" | "stack";
};

export type Section = {
  id: string;
  type: AnyComponentType;
  variant?: string;
  content: Record<string, unknown>;
};

export type PageConfig = {
  version: number;
  username: string;
  theme: string;
  style: StyleConfig;
  sections: Section[];
};

type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export type RegisteredComponentStatus =
  | "draft"
  | "certified"
  | "experimental"
  | "deprecated";

export type RegisteredComponent = {
  type: CommunityComponentType;
  status: RegisteredComponentStatus;
  allowedVariants?: readonly string[];
};

export type ValidatePageConfigOptions = {
  resolveRegisteredComponent?: (
    type: CommunityComponentType,
  ) => RegisteredComponent | null;
  allowExperimentalComponents?: boolean;
  validateRegisteredContent?: (
    component: RegisteredComponent,
    content: Record<string, unknown>,
  ) => string[];
};

const COMPONENT_TYPES: ReadonlySet<string> = new Set([
  "hero",
  "bio",
  "skills",
  "projects",
  "timeline",
  "interests",
  "achievements",
  "stats",
  "social",
  "custom",
  "reading",
  "music",
  "contact",
  "footer",
]);

const COMMUNITY_COMPONENT_RE =
  /^x\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCoreComponentType(type: string): type is ComponentType {
  return COMPONENT_TYPES.has(type);
}

export function isCommunityComponentType(
  type: string,
): type is CommunityComponentType {
  return COMMUNITY_COMPONENT_RE.test(type);
}

function validateStyleConfig(style: unknown, errors: string[]): void {
  if (!isObject(style)) {
    errors.push("style must be an object");
    return;
  }

  if (style.colorScheme !== "light" && style.colorScheme !== "dark") {
    errors.push("style.colorScheme must be 'light' or 'dark'");
  }
  if (!isString(style.primaryColor)) {
    errors.push("style.primaryColor must be a non-empty string");
  }
  if (!isString(style.fontFamily)) {
    errors.push("style.fontFamily must be a non-empty string");
  }
  if (style.layout !== "centered" && style.layout !== "split" && style.layout !== "stack") {
    errors.push("style.layout must be one of centered|split|stack");
  }
}

function validateHeroContent(content: Record<string, unknown>, errors: string[]): void {
  if (!isString(content.name)) errors.push("hero.content.name is required");
  if (!isString(content.tagline)) errors.push("hero.content.tagline is required");
}

function validateBioContent(content: Record<string, unknown>, errors: string[]): void {
  if (!isString(content.text)) errors.push("bio.content.text is required");
}

function validateProjectsContent(content: Record<string, unknown>, errors: string[]): void {
  if (!Array.isArray(content.items)) {
    errors.push("projects.content.items must be an array");
    return;
  }
  for (const item of content.items) {
    if (!isObject(item) || !isString(item.title)) {
      errors.push("projects.content.items[].title is required");
      break;
    }
  }
}

function validateSkillsContent(content: Record<string, unknown>, errors: string[]): void {
  if (!Array.isArray(content.groups)) {
    errors.push("skills.content.groups must be an array");
    return;
  }
}

function validateInterestsContent(content: Record<string, unknown>, errors: string[]): void {
  if (!Array.isArray(content.items)) {
    errors.push("interests.content.items must be an array");
    return;
  }
}

function validateSocialContent(content: Record<string, unknown>, errors: string[]): void {
  if (!Array.isArray(content.links)) {
    errors.push("social.content.links must be an array");
    return;
  }
}

function resolveRegisteredType(
  type: string,
  options: ValidatePageConfigOptions,
  path: string,
  errors: string[],
): RegisteredComponent | null {
  if (!isCommunityComponentType(type)) {
    errors.push(`${path}.type is invalid`);
    return null;
  }

  if (!options.resolveRegisteredComponent) {
    errors.push(
      `${path}.type '${type}' is not allowed without component registry resolution`,
    );
    return null;
  }

  const registered = options.resolveRegisteredComponent(type);
  if (!registered || registered.type !== type) {
    errors.push(`${path}.type '${type}' is not registered`);
    return null;
  }

  if (registered.status === "draft" || registered.status === "deprecated") {
    errors.push(
      `${path}.type '${type}' is not enabled (status=${registered.status})`,
    );
    return null;
  }

  if (
    registered.status === "experimental" &&
    !options.allowExperimentalComponents
  ) {
    errors.push(`${path}.type '${type}' is experimental and not allowed`);
    return null;
  }

  return registered;
}

function validateSection(
  section: unknown,
  index: number,
  errors: string[],
  options: ValidatePageConfigOptions,
): void {
  const path = `sections[${index}]`;

  if (!isObject(section)) {
    errors.push(`${path} must be an object`);
    return;
  }

  if (!isString(section.id)) {
    errors.push(`${path}.id is required`);
  }

  if (!isString(section.type)) {
    errors.push(`${path}.type is required`);
    return;
  }

  const sectionType = section.type;
  const isCore = isCoreComponentType(sectionType);
  const registered = isCore
    ? null
    : resolveRegisteredType(sectionType, options, path, errors);

  if (!isCore && !registered) {
    return;
  }

  if (section.variant !== undefined && !isString(section.variant)) {
    errors.push(`${path}.variant must be a non-empty string when provided`);
  }

  if (
    registered &&
    isString(section.variant) &&
    registered.allowedVariants &&
    registered.allowedVariants.length > 0 &&
    !registered.allowedVariants.includes(section.variant)
  ) {
    errors.push(
      `${path}.variant '${section.variant}' is not allowed for '${sectionType}'`,
    );
  }

  if (!isObject(section.content)) {
    errors.push(`${path}.content must be an object`);
    return;
  }

  if (isCore) {
    switch (sectionType) {
      case "hero":
        validateHeroContent(section.content, errors);
        break;
      case "bio":
        validateBioContent(section.content, errors);
        break;
      case "projects":
        validateProjectsContent(section.content, errors);
        break;
      case "skills":
        validateSkillsContent(section.content, errors);
        break;
      case "interests":
        validateInterestsContent(section.content, errors);
        break;
      case "social":
        validateSocialContent(section.content, errors);
        break;
      default:
        break;
    }
  }

  if (registered && options.validateRegisteredContent) {
    const customErrors = options.validateRegisteredContent(
      registered,
      section.content,
    );
    customErrors.forEach((error) => errors.push(`${path}.content: ${error}`));
  }
}

export const AVAILABLE_THEMES = ["minimal", "warm"] as const;
export type AvailableTheme = (typeof AVAILABLE_THEMES)[number];

export function validatePageConfig(
  input: unknown,
  options: ValidatePageConfigOptions = {},
): ValidationResult {
  const errors: string[] = [];

  if (!isObject(input)) {
    return { ok: false, errors: ["PageConfig must be an object"] };
  }

  if (typeof input.version !== "number" || input.version < 1) {
    errors.push("version must be a positive number");
  }
  if (!isString(input.username)) {
    errors.push("username must be a non-empty string");
  }
  if (!isString(input.theme)) {
    errors.push("theme must be a non-empty string");
  } else if (!(AVAILABLE_THEMES as readonly string[]).includes(input.theme)) {
    errors.push(
      `theme must be one of: ${AVAILABLE_THEMES.join(", ")}`,
    );
  }

  validateStyleConfig(input.style, errors);

  if (!Array.isArray(input.sections)) {
    errors.push("sections must be an array");
  } else {
    input.sections.forEach((section, index) =>
      validateSection(section, index, errors, options),
    );
  }

  return { ok: errors.length === 0, errors };
}
