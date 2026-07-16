import type { MetadataRoute } from "next";
import { volcanoProfiles } from "@/lib/data";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const staticRoutes = ["", "/atlas", "/history", "/data", "/sourcebook"];
  return [
    ...staticRoutes.map((path) => ({ url: `${base}${path}`, changeFrequency: "weekly" as const })),
    ...volcanoProfiles.map(({ slug }) => ({ url: `${base}/volcanoes/${slug}`, changeFrequency: "monthly" as const })),
  ];
}
