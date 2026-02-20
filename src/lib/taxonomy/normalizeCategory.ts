export type NormalizeAction = "known" | "alias" | "created_pending";

export type NormalizeResult = {
  canonical: string;
  action: NormalizeAction;
};

export type TaxonomyStore = {
  findCanonical(category: string): Promise<string | null>;
  findAlias(alias: string): Promise<string | null>;
  createPendingCategory(category: string): Promise<void>;
};

const CATEGORY_RE = /^[a-z][a-z0-9-]{1,47}$/;

const BUILTIN_ALIAS_MAP: Record<string, string> = {
  job: "experience",
  work: "experience",
  employment: "experience",
  career: "experience",
  skills: "skill",
  tech: "skill",
  hobby: "interest",
  hobbies: "interest",
  book: "reading",
  books: "reading",
};

function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export function validateCategorySlug(slug: string): boolean {
  return CATEGORY_RE.test(slug);
}

export async function normalizeCategory(
  rawCategory: string,
  store: TaxonomyStore,
): Promise<NormalizeResult> {
  const slug = toSlug(rawCategory);
  if (!validateCategorySlug(slug)) {
    throw new Error(`INVALID_CATEGORY:${rawCategory}`);
  }

  const builtIn = BUILTIN_ALIAS_MAP[slug];
  if (builtIn) {
    return { canonical: builtIn, action: "alias" };
  }

  const canonical = await store.findCanonical(slug);
  if (canonical) {
    return { canonical, action: "known" };
  }

  const alias = await store.findAlias(slug);
  if (alias) {
    return { canonical: alias, action: "alias" };
  }

  await store.createPendingCategory(slug);
  return { canonical: slug, action: "created_pending" };
}
