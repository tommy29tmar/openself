import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublishedPage, getPublishedPageSourceLanguage } from "@/lib/services/page-service";
import { PageRenderer } from "@/components/page";
import { checkPageOwnership } from "@/lib/services/ownership";
import { translatePageContent } from "@/lib/ai/translate";
import { parseAcceptLanguage, isCrawler } from "@/lib/i18n/accept-language";
import { isLanguageCode } from "@/lib/i18n/languages";
import { TranslationBanner } from "@/components/page/TranslationBanner";

// Disable Next.js route cache — always read fresh from DB
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const config = getPublishedPage(username);

  if (!config) {
    return { title: "Not Found" };
  }

  const heroSection = config.sections.find((s) => s.type === "hero");
  const name = heroSection?.content?.name;
  const title = typeof name === "string" ? name : username;

  return { title: `${title} | OpenSelf` };
}

export default async function UsernamePage({ params, searchParams }: Props) {
  const { username } = await params;
  const config = getPublishedPage(username);

  if (!config) {
    notFound();
  }

  // Owner detection: check if logged-in user owns this page
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("os_session")?.value;
  const isOwner = sessionId ? checkPageOwnership(sessionId, username) : false;

  // Translation logic
  const sp = await searchParams;
  const langParam = typeof sp.lang === "string" ? sp.lang : null;

  // ?lang=original → skip translation
  if (langParam === "original") {
    return <PageRenderer config={config} isOwner={isOwner} />;
  }

  // Bot detection: serve original for SEO
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent");
  if (isCrawler(userAgent)) {
    return <PageRenderer config={config} isOwner={isOwner} />;
  }

  // Determine visitor language
  const sourceLanguage = getPublishedPageSourceLanguage(username);
  const explicitLang = langParam && isLanguageCode(langParam) ? langParam : null;
  const cookieLangRaw = cookieStore.get("os_lang")?.value;
  const cookieLang = cookieLangRaw && isLanguageCode(cookieLangRaw) ? cookieLangRaw : null;
  const acceptLang = parseAcceptLanguage(headerStore.get("accept-language"));
  const visitorLang = explicitLang ?? cookieLang ?? acceptLang;

  // No translation needed if:
  // - no visitor lang detected
  // - visitor lang matches page source language
  // - sourceLanguage is null (old pages published before migration 0024)
  if (!visitorLang || !sourceLanguage || visitorLang === sourceLanguage) {
    return <PageRenderer config={config} isOwner={isOwner} />;
  }

  // Translate (cache-first, graceful fallback)
  const translatedConfig = await translatePageContent(
    config,
    visitorLang,
    sourceLanguage,
  );

  // Only show banner when translation actually succeeded (fallback returns the same object reference)
  const translationSucceeded = translatedConfig !== config;

  return (
    <>
      {translationSucceeded && (
        <TranslationBanner
          sourceLanguage={sourceLanguage}
          username={username}
        />
      )}
      <PageRenderer config={translatedConfig} isOwner={isOwner} />
    </>
  );
}
