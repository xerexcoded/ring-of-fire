"use client";

import { BarChart3, CircleDot, ExternalLink, LineChart, ScatterChart } from "lucide-react";
import { useState } from "react";
import { MetabaseEmbed } from "@/components/metabase-embed";

const questions = [
  { number: "01", title: "Membership by region", detail: "Current Smithsonian PROF membership, versioned independently from the editorial route.", form: "bar", icon: BarChart3 },
  { number: "02", title: "Volcanoes by form", detail: "Primary volcano type by region, with unknown classifications preserved.", form: "bar", icon: BarChart3 },
  { number: "03", title: "Eruptions by decade", detail: "Recorded eruptions from 1960 onward by default to reduce early-recording bias.", form: "line", icon: LineChart },
  { number: "04", title: "VEI distribution", detail: "Known VEI values alongside a visible missing-data count—not an imputed distribution.", form: "dots", icon: CircleDot },
  { number: "05", title: "Magnitude × depth", detail: "Recent USGS earthquakes; magnitude is not a prediction of local impact.", form: "scatter", icon: ScatterChart },
  { number: "06", title: "Tsunami causes & impacts", detail: "Historical sources grouped by cause, with incomplete impact fields left nullable.", form: "bar", icon: BarChart3 },
] as const;

export function DataLab({ dashboardId }: { dashboardId: number }) {
  const [region, setRegion] = useState("All");
  const [fromYear, setFromYear] = useState("1960");
  const parameters = {
    region: region === "All" ? null : [region],
    start_year: fromYear,
  };

  return (
    <>
      <section className="data-ledger" aria-labelledby="questions-title">
        <div className="data-ledger-head">
          <div className="section-title-group"><p className="eyebrow">Six saved questions</p><h2 id="questions-title">What the data can answer.</h2></div>
          <p>Every chart retains its query, source version, and limitations inside the Metabase collection provisioned by Clojure.</p>
        </div>
        <ol>
          {questions.map(({ number, title, detail, form, icon: Icon }) => (
            <li key={number}>
              <span>{number}</span>
              <Icon aria-hidden="true" />
              <div><h3>{title}</h3><p>{detail}</p></div>
              <div className={`mini-chart mini-${form}`} aria-hidden="true">
                {Array.from({ length: form === "scatter" ? 10 : 6 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-title">
        <div className="dashboard-head">
          <div className="section-title-group"><p className="eyebrow">Composite dashboard · Live analytics</p><h2 id="dashboard-title">The Pacific, counted carefully.</h2></div>
          <div className="dashboard-filters" aria-label="Dashboard filters">
            <label>Region<select value={region} onChange={(event) => setRegion(event.target.value)}><option>All</option><option>Taupo Volcanic Arc</option><option>Tofua Volcanic Arc</option><option>Luzon Volcanic Arc</option><option>Northeast Japan Volcanic Arc</option><option>Alaska Peninsula Volcanic Arc</option><option>High Cascades Volcanic Arc</option><option>Trans-Mexican Volcanic Arc</option><option>Central America Volcanic Arc</option><option>Northern Andean Volcanic Arc</option><option>Southern Andean Volcanic Arc</option></select></label>
            <label>Historical trends from<select value={fromYear} onChange={(event) => setFromYear(event.target.value)}><option>1960</option><option>1980</option><option>2000</option><option>2020</option></select></label>
          </div>
        </div>
        <div className="metabase-context">
          <span>Metabase OSS · Modular Guest embed</span>
          <p>Filters above are controlled by this page and synchronized with the embedded dashboard. The component renews its JWT through the Clojure service; no secret enters the browser.</p>
          <a href="https://www.metabase.com/docs/latest/embedding/guest-embedding" target="_blank" rel="noreferrer">How guest embedding works <ExternalLink /></a>
        </div>
        <MetabaseEmbed dashboardId={dashboardId} parameters={parameters} onParametersChange={(values) => {
          const nextRegion = values.region;
          const nextYear = values.start_year;
          if (Array.isArray(nextRegion)) setRegion(nextRegion[0] ?? "All");
          if (typeof nextYear === "string") setFromYear(nextYear);
        }} />
      </section>
    </>
  );
}
