import type { MetadataRoute } from "next";
import { volcanoProfiles } from "@/lib/data";
import { withBasePath } from "@/lib/paths";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const staticRoutes = ["", "/atlas", "/ringmaker", "/history", "/data", "/sourcebook", "/ask"];
  return [
    ...staticRoutes.map((path) => ({ url: `${base}${withBasePath(path || "/")}`, changeFrequency: "weekly" as const })),
    ...volcanoProfiles.map(({ slug }) => ({ url: `${base}${withBasePath(`/volcanoes/${slug}`)}`, changeFrequency: "monthly" as const })),
  ];
}
