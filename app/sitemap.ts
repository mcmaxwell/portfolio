import type { MetadataRoute } from "next";
import { cases } from "@/data/cases";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://liutsko.me",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...cases.map((c) => ({
      url: `https://liutsko.me/work/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: "https://liutsko.me/colophon", lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];
}
