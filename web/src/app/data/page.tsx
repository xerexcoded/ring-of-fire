import type { Metadata } from "next";
import { DataLab } from "@/components/data-lab";

export const metadata: Metadata = {
  title: "Metabase Data Lab",
  description: "Six transparent analytical questions and one embedded Metabase dashboard.",
};

export const dynamic = "force-dynamic";

async function resolveDashboardId() {
  const fallback = Number(
    process.env.METABASE_DASHBOARD_ID
      ?? process.env.NEXT_PUBLIC_METABASE_DASHBOARD_ID
      ?? "0",
  );
  const apiBase = (process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");
  try {
    const response = await fetch(`${apiBase}/metabase/resources/ring-of-fire-data-lab`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return fallback;
    const resource = await response.json() as { entityType?: string; entityId?: number };
    return resource.entityType === "dashboard" && Number.isInteger(resource.entityId)
      ? Number(resource.entityId)
      : fallback;
  } catch {
    return fallback;
  }
}

export default async function DataPage() {
  const dashboardId = await resolveDashboardId();
  return (
    <article className="data-page">
      <header className="data-hero">
        <div className="display-title-group"><p className="eyebrow">Metabase Data Lab</p><h1>Evidence, with its <em>edges</em> showing.</h1></div>
        <p>Ask broad questions without hiding how source coverage, nulls, date precision, and changing definitions shape the answer.</p>
      </header>
      <DataLab dashboardId={dashboardId} />
    </article>
  );
}
