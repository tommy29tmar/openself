/**
 * fact-cluster-service.ts
 *
 * Pure utility functions for fact identity matching and slug normalization.
 * No DB or project imports — those are added in later tasks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FactValue = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  if (typeof v === "string") return v;
  return "";
}

// ---------------------------------------------------------------------------
// slugifyForMatch
// ---------------------------------------------------------------------------

/**
 * Normalize a string for identity matching:
 * lowercase, remove accents, strip special chars, collapse whitespace → hyphens.
 */
export function slugifyForMatch(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")      // remove special chars
    .replace(/\s+/g, "-")              // whitespace → hyphens
    .replace(/-+/g, "-")               // collapse hyphens
    .replace(/^-|-$/g, "");            // trim hyphens
}

// ---------------------------------------------------------------------------
// identityMatch
// ---------------------------------------------------------------------------

/**
 * Category-specific identity matching.
 * Returns true if two fact values refer to the same real-world entity.
 */
export function identityMatch(
  category: string,
  a: FactValue,
  b: FactValue
): boolean {
  switch (category) {
    case "education": {
      const instA = slugifyForMatch(str(a.institution));
      const instB = slugifyForMatch(str(b.institution));
      const degA = slugifyForMatch(str(a.degree));
      const degB = slugifyForMatch(str(b.degree));
      return instA !== "" && degA !== "" && instA === instB && degA === degB;
    }

    case "experience":
    case "position": {
      const coA = slugifyForMatch(str(a.company));
      const coB = slugifyForMatch(str(b.company));
      const roleA = slugifyForMatch(str(a.role));
      const roleB = slugifyForMatch(str(b.role));
      return coA !== "" && roleA !== "" && coA === coB && roleA === roleB;
    }

    case "skill": {
      const nA = slugifyForMatch(str(a.name));
      const nB = slugifyForMatch(str(b.name));
      return nA !== "" && nA === nB;
    }

    case "language": {
      const langA = slugifyForMatch(str(a.language) || str(a.name));
      const langB = slugifyForMatch(str(b.language) || str(b.name));
      return langA !== "" && langA === langB;
    }

    case "social": {
      const platA = slugifyForMatch(str(a.platform));
      const platB = slugifyForMatch(str(b.platform));
      return platA !== "" && platA === platB;
    }

    case "music": {
      const titleA = slugifyForMatch(str(a.title));
      const titleB = slugifyForMatch(str(b.title));
      const artistA = slugifyForMatch(str(a.artist));
      const artistB = slugifyForMatch(str(b.artist));
      // Both title and artist must be non-empty to avoid false positives
      return (
        titleA !== "" &&
        artistA !== "" &&
        titleA === titleB &&
        artistA === artistB
      );
    }

    case "activity": {
      const nA = slugifyForMatch(str(a.name));
      const nB = slugifyForMatch(str(b.name));
      return nA !== "" && nA === nB;
    }

    case "project": {
      const nameA = slugifyForMatch(str(a.name));
      const nameB = slugifyForMatch(str(b.name));
      const urlA = str(a.url);
      const urlB = str(b.url);
      const nameMatch = nameA !== "" && nameA === nameB;
      const urlMatch = urlA !== "" && urlB !== "" && urlA === urlB;
      return nameMatch || urlMatch;
    }

    case "contact": {
      return (
        str(a.type) === str(b.type) &&
        str(a.type) !== "" &&
        str(a.value) === str(b.value) &&
        str(a.value) !== ""
      );
    }

    case "achievement": {
      const titleA = slugifyForMatch(str(a.title));
      const titleB = slugifyForMatch(str(b.title));
      return titleA !== "" && titleA === titleB;
    }

    case "reading": {
      const titleA = slugifyForMatch(str(a.title));
      const titleB = slugifyForMatch(str(b.title));
      const authorA = slugifyForMatch(str(a.author));
      const authorB = slugifyForMatch(str(b.author));
      return (
        titleA !== "" &&
        authorA !== "" &&
        titleA === titleB &&
        authorA === authorB
      );
    }

    case "stat": {
      const labelA = slugifyForMatch(str(a.label));
      const labelB = slugifyForMatch(str(b.label));
      return labelA !== "" && labelA === labelB;
    }

    case "identity": {
      // Always false — identity facts are intentionally not deduplicated
      return false;
    }

    default:
      return false;
  }
}
