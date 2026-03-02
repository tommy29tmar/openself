const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export function normalizeLinkedInDate(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // Reject placeholders
  if (/^[YMD-]+$/.test(s)) return null;

  // ISO full date: 2016-10-26... → 2016-10-26
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // "Mon YYYY": Apr 2024 → 2024-04
  const monYearMatch = s.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (monYearMatch) {
    const mm = MONTH_MAP[monYearMatch[1].toLowerCase()];
    if (mm) return `${monYearMatch[2]}-${mm}`;
  }

  // "DD Mon YYYY": 11 Feb 2026 → 2026-02-11
  const ddMonYYYY = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (ddMonYYYY) {
    const mm = MONTH_MAP[ddMonYYYY[2].toLowerCase()];
    if (mm) return `${ddMonYYYY[3]}-${mm}-${ddMonYYYY[1].padStart(2, "0")}`;
  }

  // US short: M/D/YY → 20YY-MM-DD
  const usShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}),?\s*/);
  if (usShort) {
    const yy = parseInt(usShort[3]);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${year}-${usShort[1].padStart(2, "0")}-${usShort[2].padStart(2, "0")}`;
  }

  // Year only: 2022
  const yearOnly = s.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1];

  return null; // Unparseable
}
