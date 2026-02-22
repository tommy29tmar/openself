import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageByUsername } from "@/lib/services/page-service";
import { PageRenderer } from "@/components/page";

type Props = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const config = await getPageByUsername(username);

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
  const config = await getPageByUsername(username);

  if (!config) {
    notFound();
  }

  return <PageRenderer config={config} />;
}
