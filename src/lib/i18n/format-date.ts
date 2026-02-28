const MONTH_NAMES: Record<string, string[]> = {
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  it: ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"],
  de: ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
  fr: ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"],
  es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
  pt: ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"],
  ja: ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"],
  zh: ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"],
};

export function formatFactDate(isoDate: string, language: string): string {
  if (!isoDate) return "";
  if (/^\d{4}$/.test(isoDate)) return isoDate;
  const match = isoDate.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return isoDate;
  const year = match[1];
  const month = parseInt(match[2], 10);
  const day = match[3] ? parseInt(match[3], 10) : undefined;
  if (month === 1 && day === 1) return year;
  const months = MONTH_NAMES[language] ?? MONTH_NAMES.en;
  return `${months[month - 1] ?? String(month)} ${year}`;
}
