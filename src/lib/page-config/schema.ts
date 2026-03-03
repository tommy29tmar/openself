import { LAYOUT_TEMPLATES, type LayoutTemplateId } from "@/lib/layout/contracts";
import "@/lib/presence/surfaces";
import "@/lib/presence/voices";
import { isValidSurface, isValidVoice, isValidLight } from "@/lib/presence";

export type ComponentType =
  | "hero"
  | "bio"
  | "skills"
  | "projects"
  | "timeline"
  | "interests"
  | "achievements"
  | "stats"
  | "at-a-glance"
  | "social"
  | "custom"
  | "reading"
  | "music"
  | "contact"
  | "experience"
  | "education"
  | "languages"
  | "activities"
  | "footer";

export type CommunityComponentType = `x.${string}.${string}`;
export type AnyComponentType = ComponentType | CommunityComponentType;

export type StyleConfig = {
  primaryColor: string;
  layout: "centered" | "split" | "stack";
};

export type SectionLock = {
  position?: boolean;
  widget?: boolean;
  content?: boolean;
  lockedBy: "user" | "agent";
  lockedAt: string;
  reason?: string;
};

export type SectionLockProposal = {
  position?: boolean;
  widget?: boolean;
  content?: boolean;
  proposedBy: "agent";
  proposedAt: string;
  reason?: string;
};

export type Section = {
  id: string;
  type: AnyComponentType;
  variant?: string;
  widgetId?: string;
  slot?: string;
  lock?: SectionLock;
  lockProposal?: SectionLockProposal;
  content: Record<string, unknown>;
};

export type PageConfig = {
  version: number;
  username: string;
  surface: string;
  voice: string;
  light: string;
  layoutTemplate?: LayoutTemplateId;
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
  "at-a-glance",
  "social",
  "custom",
  "reading",
  "music",
  "contact",
  "experience",
  "education",
  "languages",
  "activities",
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

  if (!isString(style.primaryColor)) {
    errors.push("style.primaryColor must be a non-empty string");
  }
  if (style.layout !== "centered" && style.layout !== "split" && style.layout !== "stack") {
    errors.push("style.layout must be one of centered|split|stack");
  }
}

function validateHeroContent(content: Record<string, unknown>, errors: string[]): void {
  if (!isString(content.name)) errors.push("hero.content.name is required");
  if (typeof content.tagline !== "string") errors.push("hero.content.tagline must be a string");
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

  // Validate new optional fields
  if (section.widgetId !== undefined && !isString(section.widgetId)) {
    errors.push(`${path}.widgetId must be a non-empty string when provided`);
  }
  if (section.slot !== undefined && !isString(section.slot)) {
    errors.push(`${path}.slot must be a non-empty string when provided`);
  }
  if (section.lock !== undefined) {
    validateSectionLock(section.lock, `${path}.lock`, errors);
  }
  if (section.lockProposal !== undefined) {
    validateSectionLockProposal(section.lockProposal, `${path}.lockProposal`, errors);
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
      case "experience":
      case "education":
      case "languages":
      case "activities":
      case "achievements":
      case "stats":
      case "reading":
      case "music":
        if (!Array.isArray(section.content.items)) {
          errors.push(`${sectionType}.content.items must be an array`);
        }
        break;
      case "contact":
        if (!Array.isArray(section.content.methods)) {
          errors.push(`contact.content.methods must be an array`);
        }
        break;
      case "at-a-glance": {
        const hasStats = Array.isArray(section.content.stats) && section.content.stats.length > 0;
        const hasSkills = Array.isArray(section.content.skillGroups) && section.content.skillGroups.length > 0;
        const hasInterests = Array.isArray(section.content.interests) && section.content.interests.length > 0;
        if (!hasStats && !hasSkills && !hasInterests) {
          errors.push(`at-a-glance.content must have at least one of stats, skillGroups, or interests`);
        }
        break;
      }
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

function validateSectionLock(lock: unknown, path: string, errors: string[]): void {
  if (!isObject(lock)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (lock.position !== undefined && typeof lock.position !== "boolean") {
    errors.push(`${path}.position must be a boolean`);
  }
  if (lock.widget !== undefined && typeof lock.widget !== "boolean") {
    errors.push(`${path}.widget must be a boolean`);
  }
  if (lock.content !== undefined && typeof lock.content !== "boolean") {
    errors.push(`${path}.content must be a boolean`);
  }
  if (lock.lockedBy !== "user" && lock.lockedBy !== "agent") {
    errors.push(`${path}.lockedBy must be "user" or "agent"`);
  }
  if (!isString(lock.lockedAt)) {
    errors.push(`${path}.lockedAt must be a non-empty string`);
  }
}

function validateSectionLockProposal(proposal: unknown, path: string, errors: string[]): void {
  if (!isObject(proposal)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (proposal.position !== undefined && typeof proposal.position !== "boolean") {
    errors.push(`${path}.position must be a boolean`);
  }
  if (proposal.widget !== undefined && typeof proposal.widget !== "boolean") {
    errors.push(`${path}.widget must be a boolean`);
  }
  if (proposal.content !== undefined && typeof proposal.content !== "boolean") {
    errors.push(`${path}.content must be a boolean`);
  }
  if (proposal.proposedBy !== "agent") {
    errors.push(`${path}.proposedBy must be "agent"`);
  }
  if (!isString(proposal.proposedAt)) {
    errors.push(`${path}.proposedAt must be a non-empty string`);
  }
}

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
  if (!isString(input.surface)) {
    errors.push("surface must be a non-empty string");
  } else if (!isValidSurface(input.surface)) {
    errors.push(`Unknown surface: "${input.surface}"`);
  }
  if (!isString(input.voice)) {
    errors.push("voice must be a non-empty string");
  } else if (!isValidVoice(input.voice)) {
    errors.push(`Unknown voice: "${input.voice}"`);
  }
  if (!isString(input.light)) {
    errors.push("light must be a non-empty string");
  } else if (!isValidLight(input.light)) {
    errors.push(`Unknown light: "${input.light}"`);
  }

  // Validate layoutTemplate if present
  if (input.layoutTemplate !== undefined) {
    if (typeof input.layoutTemplate !== "string") {
      errors.push("layoutTemplate must be a string");
    } else if (
      !(LAYOUT_TEMPLATES as readonly string[]).includes(input.layoutTemplate)
    ) {
      errors.push(
        `layoutTemplate must be one of: ${LAYOUT_TEMPLATES.join(", ")}`,
      );
    }
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

export function validatePresenceFields(config: PageConfig): string[] {
  const errors: string[] = [];
  if (!isValidSurface(config.surface)) errors.push(`Unknown surface: "${config.surface}"`);
  if (!isValidVoice(config.voice)) errors.push(`Unknown voice: "${config.voice}"`);
  if (!isValidLight(config.light)) errors.push(`Unknown light: "${config.light}"`);
  return errors;
}
