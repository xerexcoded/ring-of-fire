import type { Metadata } from "next";
import Image from "next/image";
import { ArrowDown, ExternalLink } from "lucide-react";
import { SourceStatusTable } from "@/components/source-status";
import { withBasePath } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Sourcebook",
  description: "Data versions, inclusion methodology, architecture, licenses, known gaps, and API design for Restless Pacific.",
};

const endpoints = [
  "GET /api/v1/atlas/volcanoes",
  "GET /api/v1/atlas/earthquakes",
  "GET /api/v1/atlas/boundaries",
  "GET /api/v1/atlas/tsunamis",
  "GET /api/v1/volcanoes/{volcanoNumber}",
  "GET /api/v1/search?q=…",
  "GET /api/v1/sources/status",
  "GET /api/v1/metabase/resources/{resourceKey}",
  "POST /api/v1/metabase/guest-token",
];

export default function SourcebookPage() {
  const repositoryUrl = process.env.NEXT_PUBLIC_REPOSITORY_URL ?? "https://github.com/";
  return (
    <article className="sourcebook-page">
      <header className="sourcebook-hero">
        <div className="display-title-group"><p className="eyebrow">Sources · Methods · Architecture</p><h1>Showing the <em>Ring.</em></h1></div>
        <div className="sourcebook-hero-copy">
          <p>Every claim should be traceable to a dataset, a version, a refresh, and an honest statement of what it cannot tell us.</p>
          <a href="#datasets">Inspect the source registry <ArrowDown /></a>
        </div>
      </header>

      <section className="sourcebook-definition" aria-labelledby="method-title">
        <div className="section-index">01 · Inclusion method</div>
        <div>
          <h2 id="method-title">Two routes.<br />Never one count.</h2>
          <div className="definition-comparison">
            <div><span>A</span><h3>Smithsonian PROF membership</h3><p>Versioned records reproduce the published GVP definition: 688 Holocene volcanoes in 41 regions for the pinned 5.3.6 fixture. A changed version triggers explicit review.</p></div>
            <div><span>B</span><h3>Editorial Pacific journey</h3><p>Six chapters begin in New Zealand and move clockwise. This sequence has no scientific start or end and can include contextual cases, such as Indonesia, without changing the GVP count.</p></div>
          </div>
        </div>
      </section>

      <section id="datasets" className="sourcebook-datasets" aria-labelledby="datasets-title">
        <div className="section-index">02 · Dataset registry</div>
        <div><h2 id="datasets-title">Freshness is part of the fact.</h2><p>Successful ingestions replace staging data atomically. A malformed refresh leaves the last known-good publication active.</p></div>
        <SourceStatusTable />
      </section>

      <section className="architecture-section" aria-labelledby="architecture-title">
        <div className="section-index">03 · System architecture</div>
        <div className="architecture-copy"><h2 id="architecture-title">One store.<br />Two ways to read it.</h2><p>The cinematic map and four analytical workspaces serve different jobs. Every view resolves to the same provenance-aware PostGIS data.</p></div>
        <div className="architecture-flow" role="img" aria-label="GVP, USGS, and NOAA flow through Clojure ingestion into PostGIS. A Clojure GeoJSON API feeds Next.js maps while a read-only connection feeds Metabase guest embeds in the Next.js application.">
          <div className="architecture-sources"><span>Smithsonian GVP</span><span>USGS events</span><span>USGS boundaries</span><span>NOAA tsunamis</span></div>
          <i aria-hidden="true">→</i>
          <div className="architecture-node accent-node"><small>Transform + validate</small><strong>Clojure 1.12</strong><span>advisory lock · staging · atomic upsert</span></div>
          <i aria-hidden="true">→</i>
          <div className="architecture-node"><small>Shared analytical store</small><strong>PostgreSQL + PostGIS</strong><span>core · analytics · ops</span></div>
          <i aria-hidden="true">↗</i>
          <div className="architecture-outputs"><span><b>GeoJSON API</b> → MapLibre</span><span><b>SELECT only</b> → Metabase</span><strong>Next.js experience</strong></div>
        </div>
      </section>

      <section className="api-section" aria-labelledby="api-title">
        <div className="section-index">04 · Public interface</div>
        <div><h2 id="api-title">Small, bounded, legible.</h2><p>Map endpoints emit RFC 7946 GeoJSON. Invalid bounds and filters return <code>application/problem+json</code>; pagination and limits protect the public service.</p></div>
        <ol>{endpoints.map((endpoint) => <li key={endpoint}><code>{endpoint}</code></li>)}</ol>
      </section>

      <section className="known-gaps" aria-labelledby="gaps-title">
        <div className="section-index">05 · Known gaps</div>
        <div><h2 id="gaps-title">Absence is not zero.</h2><p>Older eruption and tsunami records are less complete. Missing VEI, impact totals, or day precision stays null. Nearby boundaries are derived spatial context, never causal attribution. Recent earthquake feeds are revised and may include deletions.</p></div>
        <dl>
          <div><dt>Historical trends</dt><dd>Default to 1960 onward; users can expand the range with the coverage caveat visible.</dd></div>
          <div><dt>Dates</dt><dd>Year, month, and day are independently nullable. A BCE or year-only record is not assigned a fictional date.</dd></div>
          <div><dt>Risk</dt><dd>No prediction, risk score, exposure model, or emergency guidance is produced.</dd></div>
        </dl>
      </section>

      <section id="tutorial" className="portfolio-collateral">
        <p className="eyebrow">Metabase layer</p>
        <div>
          <h2>Four workspaces. One read-only boundary.</h2>
          <dl className="metabase-inventory">
            <div><dt>05</dt><dd>analytical views</dd></div>
            <div><dt>16</dt><dd>saved questions</dd></div>
            <div><dt>04</dt><dd>guest dashboards</dd></div>
            <div><dt>01</dt><dd>SELECT-only role</dd></div>
          </dl>
        </div>
        <div>
          <p>The implementation keeps the embedding secret server-side, resolves stable resource keys at the moment each workspace approaches the viewport, and signs only dashboards present in the database allow-list.</p>
          <ol><li>Expose five bounded views to <code>metabase_reader</code>.</li><li>Reconcile 16 questions, four dashboards, and native filters.</li><li>Resolve a stable key to the current numeric dashboard ID.</li><li>Load the guest component lazily and renew its JWT before expiry.</li></ol>
        </div>
      </section>

      <figure className="sourcebook-demo-preview">
        <div className="sourcebook-demo-media">
          <Image
            className="sourcebook-demo-motion"
            src={withBasePath("/restless-pacific-demo.gif")}
            width={800}
            height={450}
            unoptimized
            alt="A short preview moving from the Pacific journey to the Japan chapter, Fuji atlas search, Metabase charts, and the live source registry."
          />
          <Image
            className="sourcebook-demo-static"
            src={withBasePath("/restless-pacific-demo-poster.webp")}
            width={800}
            height={450}
            alt="The Restless Pacific opening map and the headline A ring that isn’t a ring."
          />
        </div>
        <figcaption>
          <span>12-second project preview</span>
          <strong>Journey → atlas → evidence → provenance.</strong>
          <p>The static opening frame replaces this loop when reduced motion is requested.</p>
          <a href={`${repositoryUrl.replace(/\/$/, "")}/blob/main/docs/demo-script.md`} target="_blank" rel="noreferrer">Read the five-minute narration script <ExternalLink /></a>
        </figcaption>
      </figure>

      <section id="demo" className="sourcebook-links">
        <a href={repositoryUrl} target="_blank" rel="noreferrer"><span>Code</span><strong>GitHub repository</strong><ExternalLink /></a>
        <a href="#tutorial"><span>Guide</span><strong>Embedding tutorial</strong><ExternalLink /></a>
        <a href={`${repositoryUrl.replace(/\/$/, "")}/blob/main/docs/demo-script.md`} target="_blank" rel="noreferrer"><span>Watch / record</span><strong>Five-minute demo script</strong><ExternalLink /></a>
      </section>

      <aside className="scientific-disclaimer">
        <strong>Scientific &amp; educational disclaimer</strong>
        <p>Restless Pacific is an educational portfolio project. It is not an alert, forecasting, hazard-assessment, evacuation, or emergency-response product. For current conditions and instructions, use the responsible local geological and civil-defense authorities.</p>
      </aside>
    </article>
  );
}
