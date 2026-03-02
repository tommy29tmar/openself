import { normalizeLinkedInDate } from "./date-normalizer";
import type { CsvRow } from "./parser";

export type FactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const PROFICIENCY_MAP: Record<string, string> = {
  NATIVE_OR_BILINGUAL: "native",
  FULL_PROFESSIONAL: "fluent",
  PROFESSIONAL_WORKING: "advanced",
  LIMITED_WORKING: "intermediate",
  ELEMENTARY: "beginner",
};

/**
 * Profile.csv — maps name, headline, location, websites, twitter
 */
export function mapProfile(rows: CsvRow[]): FactInput[] {
  const facts: FactInput[] = [];
  const row = rows[0];
  if (!row) return facts;

  const firstName = row["First Name"] ?? "";
  const lastName = row["Last Name"] ?? "";
  const name = `${firstName} ${lastName}`.trim();
  if (name) {
    facts.push({ category: "identity", key: "li-name", value: { name } });
  }

  const headline = row["Headline"];
  if (headline) {
    facts.push({
      category: "identity",
      key: "li-headline",
      value: { role: headline },
    });
  }

  const location = row["Geo Location"] ?? row["Location"];
  if (location) {
    facts.push({
      category: "identity",
      key: "li-location",
      value: { city: location },
    });
  }

  const websites = row["Websites"];
  if (websites) {
    // LinkedIn exports websites as comma-separated or newline-separated
    const urls = websites
      .split(/[,\n]/)
      .map((u) => u.trim())
      .filter(Boolean);
    urls.forEach((url, i) => {
      const normalized = url.startsWith("http") ? url : `https://${url}`;
      facts.push({
        category: "social",
        key: `li-website-${i}`,
        value: { url: normalized },
      });
    });
  }

  const twitter = row["Twitter Handles"] ?? row["Twitter"];
  if (twitter) {
    const handle = twitter.replace(/^@/, "").trim();
    if (handle) {
      facts.push({
        category: "social",
        key: "li-twitter",
        value: { platform: "twitter", username: handle },
      });
    }
  }

  return facts;
}

/**
 * Profile Summary.csv (or "Summary" column in Profile.csv)
 */
export function mapProfileSummary(rows: CsvRow[]): FactInput[] {
  const row = rows[0];
  if (!row) return [];
  const summary = row["Summary"] ?? row["About"] ?? "";
  if (!summary.trim()) return [];
  return [
    { category: "identity", key: "li-summary", value: { text: summary.trim() } },
  ];
}

/**
 * Positions.csv — experience facts, chronological order, single "current"
 */
export function mapPositions(rows: CsvRow[]): FactInput[] {
  if (rows.length === 0) return [];

  // Parse and sort by start date ascending
  const parsed = rows
    .map((row) => ({
      company: row["Company Name"] ?? "",
      title: row["Title"] ?? "",
      description: row["Description"] ?? "",
      location: row["Location"] ?? "",
      startDate: normalizeLinkedInDate(row["Started On"]),
      endDate: normalizeLinkedInDate(row["Finished On"]),
      raw: row,
    }))
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  const facts: FactInput[] = [];
  const keyCount = new Map<string, number>();

  // Find the latest position without end date → "current"
  const openPositions = parsed.filter((p) => !p.endDate);
  const currentIdx =
    openPositions.length > 0
      ? parsed.indexOf(openPositions[openPositions.length - 1])
      : -1;

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const companySlug = slug(p.company);
    const startYear = p.startDate?.slice(0, 4) ?? "unknown";
    const baseKey = `li-${companySlug}-${startYear}`;

    // Handle key collision (same company, same start year, different roles)
    const count = keyCount.get(baseKey) ?? 0;
    keyCount.set(baseKey, count + 1);
    const key = count > 0 ? `${baseKey}-${count}` : baseKey;

    const isCurrent = i === currentIdx;
    const value: Record<string, unknown> = {
      company: p.company,
      role: p.title,
      status: isCurrent ? "current" : "past",
    };

    if (p.startDate) value.startDate = p.startDate;
    if (p.endDate) value.endDate = p.endDate;
    if (p.description) value.description = p.description;
    if (p.location) value.location = p.location;

    facts.push({ category: "experience", key, value });
  }

  return facts;
}

/**
 * Education.csv
 */
export function mapEducation(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row, i) => {
      const school = row["School Name"] ?? "";
      const degree = row["Degree Name"] ?? "";
      const field = row["Fields of Study"] ?? row["Notes"] ?? "";
      const startDate = normalizeLinkedInDate(row["Start Date"]);
      const endDate = normalizeLinkedInDate(row["End Date"]);

      const value: Record<string, unknown> = {
        institution: school,
        degree,
      };
      if (field) value.field = field;
      if (startDate) value.startDate = startDate;
      if (endDate) value.endDate = endDate;

      return {
        category: "education",
        key: `li-edu-${slug(school)}-${i}`,
        value,
      };
    })
    .filter((f) => f.value.institution || f.value.degree);
}

/**
 * Skills.csv
 */
export function mapSkills(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row) => {
      const name = row["Name"] ?? row["Skill"] ?? "";
      if (!name.trim()) return null;
      return {
        category: "skill",
        key: `li-${slug(name)}`,
        value: { name: name.trim() },
      };
    })
    .filter((f) => f !== null) as FactInput[];
}

/**
 * Languages.csv
 */
export function mapLanguages(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row) => {
      const name = row["Name"] ?? row["Language"] ?? "";
      if (!name.trim()) return null;
      const rawProficiency = row["Proficiency"] ?? "";
      const proficiency =
        PROFICIENCY_MAP[rawProficiency.trim()] ??
        (rawProficiency.toLowerCase() || undefined);

      const value: Record<string, unknown> = { language: name.trim() };
      if (proficiency) value.proficiency = proficiency;

      return {
        category: "language",
        key: `li-lang-${slug(name)}`,
        value,
      };
    })
    .filter((f) => f !== null) as FactInput[];
}

/**
 * Certifications.csv
 */
export function mapCertifications(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row, i) => {
      const name = row["Name"] ?? "";
      if (!name.trim()) return null;
      const authority = row["Authority"] ?? "";
      const startDate = normalizeLinkedInDate(row["Started On"]);
      const endDate = normalizeLinkedInDate(row["Finished On"]);
      const url = row["Url"] ?? row["URL"] ?? "";

      const value: Record<string, unknown> = {
        title: name.trim(),
        type: "certification",
      };
      if (authority) value.issuer = authority;
      if (startDate) value.date = startDate;
      if (endDate) value.expiryDate = endDate;
      if (url) value.url = url;

      return {
        category: "achievement",
        key: `li-cert-${slug(name)}-${i}`,
        value,
      };
    })
    .filter((f) => f !== null) as FactInput[];
}

/**
 * Courses.csv
 */
export function mapCourses(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row, i) => {
      const name = row["Name"] ?? "";
      if (!name.trim()) return null;
      const number = row["Number"] ?? "";

      const value: Record<string, unknown> = {
        title: name.trim(),
        type: "course",
      };
      if (number) value.code = number;

      return {
        category: "achievement",
        key: `li-course-${slug(name)}-${i}`,
        value,
      };
    })
    .filter((f) => f !== null) as FactInput[];
}

/**
 * Company Follows.csv — mapped to interests
 */
export function mapCompanyFollows(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row) => {
      const name = row["Organization"] ?? row["Company"] ?? "";
      if (!name.trim()) return null;
      return {
        category: "interest",
        key: `li-follow-${slug(name)}`,
        value: { name: name.trim(), source: "linkedin-follow" },
      };
    })
    .filter((f) => f !== null) as FactInput[];
}

/**
 * Causes You Care About.csv — mapped to interests
 */
export function mapCauses(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row) => {
      const name = row["Name"] ?? row["Cause"] ?? "";
      if (!name.trim()) return null;
      return {
        category: "interest",
        key: `li-cause-${slug(name)}`,
        value: { name: name.trim(), source: "linkedin-cause" },
      };
    })
    .filter((f) => f !== null) as FactInput[];
}

/**
 * Email Addresses.csv — opt-in mapper for private-contact
 */
export function mapEmailAddresses(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row, i) => {
      const email = row["Email Address"] ?? "";
      if (!email.trim()) return null;
      return {
        category: "private-contact",
        key: `li-email-${i}`,
        value: { email: email.trim(), type: "email" },
      };
    })
    .filter((f) => f !== null) as FactInput[];
}

/**
 * PhoneNumbers.csv — opt-in mapper for private-contact
 */
export function mapPhoneNumbers(rows: CsvRow[]): FactInput[] {
  return rows
    .map((row, i) => {
      const phone = row["Number"] ?? row["Phone"] ?? "";
      if (!phone.trim()) return null;
      return {
        category: "private-contact",
        key: `li-phone-${i}`,
        value: { phone: phone.trim(), type: "phone" },
      };
    })
    .filter((f) => f !== null) as FactInput[];
}
