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
import type { PageConfig } from "@/lib/page-config/schema";

// Disable Next.js route cache — always read fresh from DB
export const dynamic = "force-dynamic";

/** Build JSON-LD Person structured data from published page config. */
function buildJsonLd(config: PageConfig, username: string): Record<string, unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://openself.dev";
  const hero = config.sections.find((s) => s.type === "hero");
  const name = typeof hero?.content?.name === "string" ? hero.content.name : username;
  const headline = typeof hero?.content?.tagline === "string" ? hero.content.tagline : undefined;

  // Collect sameAs URLs from social section links + hero contact bar links
  const sameAs: string[] = [];
  const seen = new Set<string>();

  const socialSection = config.sections.find((s) => s.type === "social");
  if (Array.isArray(socialSection?.content?.links)) {
    for (const link of socialSection.content.links as { url?: string }[]) {
      if (typeof link?.url === "string" && !seen.has(link.url)) {
        sameAs.push(link.url);
        seen.add(link.url);
      }
    }
  }
  if (Array.isArray(hero?.content?.socialLinks)) {
    for (const link of hero.content.socialLinks as { url?: string }[]) {
      if (typeof link?.url === "string" && !seen.has(link.url)) {
        sameAs.push(link.url);
        seen.add(link.url);
      }
    }
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    url: `${baseUrl}/${encodeURIComponent(username)}`,
  };
  if (headline) jsonLd.jobTitle = headline;
  if (sameAs.length > 0) jsonLd.sameAs = sameAs;

  return jsonLd;
}

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const config = getPublishedPage(username);

  if (!config) {
    return { title: "Not Found | OpenSelf" };
  }

  const hero = config.sections.find((s) => s.type === "hero");
  const bio = config.sections.find((s) => s.type === "bio");
  const name = typeof hero?.content?.name === "string" ? hero.content.name : username;
  const headline = typeof hero?.content?.tagline === "string" ? hero.content.tagline : "";
  const description =
    (typeof bio?.content?.text === "string" ? bio.content.text.slice(0, 160) : null) ??
    `${name} on OpenSelf`;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://openself.dev";
  const ogImageUrl = `${baseUrl}/api/og/${encodeURIComponent(username)}`;
  const profileUrl = `${baseUrl}/${encodeURIComponent(username)}`;
  const ogTitle = headline ? `${name} — ${headline}` : name;

  return {
    title: `${name} | OpenSelf`,
    description,
    openGraph: {
      title: ogTitle,
      description,
      type: "profile",
      url: profileUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function UsernamePage({ params, searchParams }: Props) {
  const { username } = await params;
  const config = getPublishedPage(username);

  if (!config) {
    notFound();
  }

  // JSON-LD structured data (always from original config, not translated)
  const jsonLd = buildJsonLd(config, username);
  const jsonLdScript = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );

  // Owner detection: check if logged-in user owns this page
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("os_session")?.value;
  const isOwner = sessionId ? checkPageOwnership(sessionId, username) : false;

  // Translation logic
  const sp = await searchParams;
  const langParam = typeof sp.lang === "string" ? sp.lang : null;

  // ?lang=original → skip translation
  if (langParam === "original") {
    return (
      <>
        {jsonLdScript}
        <PageRenderer config={config} isOwner={isOwner} />
      </>
    );
  }

  // Bot detection: serve original for SEO
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent");
  if (isCrawler(userAgent)) {
    return (
      <>
        {jsonLdScript}
        <PageRenderer config={config} isOwner={isOwner} />
      </>
    );
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
    return (
      <>
        {jsonLdScript}
        <PageRenderer config={config} isOwner={isOwner} />
      </>
    );
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
      {jsonLdScript}
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
