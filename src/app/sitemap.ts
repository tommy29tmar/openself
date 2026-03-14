import type { MetadataRoute } from "next";
import { getAllPublishedUsernames } from "@/lib/services/page-service";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://openself.dev";
  const profiles = getAllPublishedUsernames();

  return [
    { url: baseUrl, lastModified: new Date() },
    ...profiles.map((p) => ({
      url: `${baseUrl}/${encodeURIComponent(p.username)}`,
      lastModified: new Date(p.updatedAt),
    })),
  ];
}
