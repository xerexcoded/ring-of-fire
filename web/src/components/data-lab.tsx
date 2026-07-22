"use client";

import { useEffect, useState } from "react";
import { LazyMetabaseEmbed } from "@/components/metabase-embed";

export const dataLabSections = [
  {
    id: "overview",
    number: "01",
    label: "Overview",
    eyebrow: "Coverage and completeness",
    title: "What is in the analytical store",
    description: "Compare record volume, temporal reach, geographic density, and known-value coverage across all five read-only views.",
    caveat: "Density shows observation coverage, not hazard intensity.",
    resourceKey: "ring-of-fire-data-lab",
  },
  {
    id: "volcanoes",
    number: "02",
    label: "Volcanoes",
    eyebrow: "Volcanoes and eruptions",
    title: "Compare the reviewed volcanic record",
    description: "Filter 41 Smithsonian PROF regions, compare volcano types, and examine confirmed eruption and VEI distributions.",
    caveat: "Historical trends default to 1960; missing VEI remains unknown.",
    resourceKey: "volcano-eruption-data-lab",
  },
  {
    id: "seismicity",
    number: "03",
    label: "Seismicity",
    eyebrow: "Earthquakes and plate context",
    title: "Inspect recent seismic observations",
    description: "Change the lookback window and magnitude threshold, then compare location density, depth, timing, and boundary inventory.",
    caveat: "Nearby boundaries provide spatial context, never causal attribution.",
    resourceKey: "earthquake-plate-data-lab",
  },
  {
    id: "tsunamis",
    number: "04",
    label: "Tsunamis",
    eyebrow: "Tsunamis and impacts",
    title: "Explore the historical impact record",
    description: "Filter by start year or cause and compare event density, historical frequency, water height, and recorded impacts.",
    caveat: "Impact totals and water heights are incomplete and observation-dependent.",
    resourceKey: "tsunami-impact-data-lab",
  },
] as const;

export function DataLab() {
  const [activeSection, setActiveSection] = useState(dataLabSections[0].id);

  useEffect(() => {
    const sections = dataLabSections
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id as typeof activeSection);
    }, { rootMargin: "-20% 0px -58%", threshold: [0.05, 0.2, 0.5] });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <nav className="data-section-nav" aria-label="Data Lab sections">
        <span>Explore</span>
        <ol>
          {dataLabSections.map(({ id, number, label }) => (
            <li key={id}>
              <a href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}>
                <b>{number}</b>{label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="data-workspaces">
        {dataLabSections.map(({ id, number, eyebrow, title, description, caveat, resourceKey }) => (
          <section id={id} className="data-workspace" aria-labelledby={`${id}-title`} key={id}>
            <header className="data-workspace-head">
              <div className="workspace-index">{number}</div>
              <div>
                <p className="eyebrow">{eyebrow}</p>
                <h2 id={`${id}-title`}>{title}</h2>
              </div>
              <div className="workspace-context">
                <p>{description}</p>
                <small>{caveat}</small>
              </div>
            </header>
            <LazyMetabaseEmbed resourceKey={resourceKey} />
          </section>
        ))}
      </div>
    </>
  );
}
