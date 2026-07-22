import type { Metadata } from "next";
import { DataLab } from "@/components/data-lab";

export const metadata: Metadata = {
  title: "Metabase Data Lab",
  description: "Four live Metabase workspaces and sixteen sourced visualizations of Pacific volcano, earthquake, plate-boundary, and tsunami data.",
};

export default function DataPage() {
  return (
    <article className="data-page">
      <header className="data-workspace-intro">
        <div className="display-title-group">
          <p className="eyebrow">Metabase Data Lab</p>
          <h1>Explore the Pacific evidence.</h1>
        </div>
        <div className="data-intro-copy">
          <p>Four live analytical workspaces. Sixteen saved questions. Five read-only views with missing values and historical limits kept visible.</p>
          <span>Metabase OSS · Native filters · Live PostGIS data</span>
        </div>
      </header>
      <DataLab />
    </article>
  );
}
