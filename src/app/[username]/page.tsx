import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPublishedPage } from "@/lib/services/page-service";
import { PageRenderer } from "@/components/page";
import { checkPageOwnership } from "@/lib/services/ownership";

// Disable Next.js route cache — always read fresh from DB
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ username: string }>;
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

export default async function UsernamePage({ params }: Props) {
  const { username } = await params;
  const config = getPublishedPage(username);

  if (!config) {
    notFound();
  }

  // Owner detection: check if logged-in user owns this page
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("os_session")?.value;
  const isOwner = sessionId ? checkPageOwnership(sessionId, username) : false;

  return <PageRenderer config={config} isOwner={isOwner} />;
}
