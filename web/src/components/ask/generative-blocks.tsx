"use client";

import type { Spec } from "@json-render/core";
import { createRenderer } from "@json-render/react";
import { ExternalLink } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LazyMetabaseEmbed } from "@/components/metabase-embed";
import { askCatalog, validateAskSpec } from "@/lib/ask/catalog";
import { curatedSources } from "@/lib/ask/sources";
import type { NormalizedResult, ResultValue } from "@/lib/ask/types";

const ResultsContext = createContext<Map<string, NormalizedResult>>(new Map());

function useResult(resultId: string) {
  return useContext(ResultsContext).get(resultId);
}

function records(result: NormalizedResult) {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column.name, row[index]])) as Record<string, ResultValue>);
}

function formatValue(value: ResultValue | undefined, format = "number") {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value !== "number") return String(value);
  if (format === "integer" || format === "year") return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
  if (format === "percent") return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)}%`;
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function MissingResult() {
  return <div className="ask-block-missing" role="status">This evidence block is no longer available. Run the question again to restore it.</div>;
}

function EvidenceReceipt({ result }: { result: NormalizedResult }) {
  return (
    <footer className="ask-evidence-receipt">
      <span>{result.querySummary}</span>
      <span>{result.rowCount} record{result.rowCount === 1 ? "" : "s"}{result.truncated ? " · truncated" : ""}</span>
      <span>{result.sourceVersion}</span>
      <time dateTime={result.retrievedAt}>{new Date(result.retrievedAt).toLocaleString()}</time>
      <div>
        {result.sources.map((source) => <a key={source.id} href={source.url} target={source.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{source.authority}<ExternalLink aria-hidden="true" /></a>)}
      </div>
    </footer>
  );
}

function AccessibleDataTable({ result, fields }: { result: NormalizedResult; fields?: string[] }) {
  const selected = (fields?.length ? fields : result.columns.map((column) => column.name)).filter((field) => result.columns.some((column) => column.name === field));
  const indexes = selected.map((field) => result.columns.findIndex((column) => column.name === field));
  return (
    <div className="ask-table-scroll">
      <table>
        <thead><tr>{indexes.map((index) => <th scope="col" key={result.columns[index].name}>{result.columns[index].displayName}</th>)}</tr></thead>
        <tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{indexes.map((index) => <td key={result.columns[index].name}>{formatValue(row[index])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function MetricStripBlock({ resultId, title, metrics }: { resultId: string; title: string; metrics: Array<{ label: string; field: string; format: string }> }) {
  const result = useResult(resultId);
  if (!result) return <MissingResult />;
  const first = records(result)[0] ?? {};
  return <section className="ask-generative-block ask-metric-strip"><header><p>Measured summary</p><h3>{title}</h3></header><dl>{metrics.map((metric) => <div key={metric.field}><dt>{metric.label}</dt><dd>{formatValue(first[metric.field], metric.format)}</dd></div>)}</dl><EvidenceReceipt result={result} /></section>;
}

function SeriesBlock({ resultId, title, mode, xField, yField, seriesField }: { resultId: string; title: string; mode: "line" | "bar" | "scatter"; xField: string; yField: string; seriesField: string | null }) {
  const result = useResult(resultId);
  if (!result) return <MissingResult />;
  const data = records(result);
  const series = seriesField ? [...new Set(data.map((row) => String(row[seriesField] ?? "Unknown")))].slice(0, 6) : [yField];
  const chartData = seriesField
    ? data.reduce<Array<Record<string, ResultValue>>>((rows, item) => {
      const x = item[xField];
      let row = rows.find((candidate) => candidate[xField] === x);
      if (!row) { row = { [xField]: x }; rows.push(row); }
      row[String(item[seriesField] ?? "Unknown")] = item[yField];
      return rows;
    }, [])
    : data;
  const colors = ["#ff5a2f", "#75b8cc", "#f1efe8", "#ffb09b", "#9d8fc2", "#d8c66b"];
  return (
    <section className="ask-generative-block ask-series-block">
      <header><p>Interactive series · {mode}</p><h3>{title}</h3></header>
      <div className="ask-chart" role="img" aria-label={`${title}. ${result.rowCount} records. A table equivalent follows.`}>
        <ResponsiveContainer width="100%" height={320}>
          {mode === "bar" ? <BarChart data={chartData}><CartesianGrid stroke="rgba(241,239,232,.12)" vertical={false} /><XAxis dataKey={xField} stroke="#aaa9a3" /><YAxis stroke="#aaa9a3" /><Tooltip /><Legend />{series.map((name, index) => <Bar key={name} dataKey={name} fill={colors[index % colors.length]} />)}</BarChart>
            : mode === "scatter" ? <ScatterChart><CartesianGrid stroke="rgba(241,239,232,.12)" /><XAxis dataKey={xField} name={xField} stroke="#aaa9a3" /><YAxis dataKey={yField} name={yField} stroke="#aaa9a3" /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter data={data} fill="#ff5a2f" shape="circle" /></ScatterChart>
              : <LineChart data={chartData}><CartesianGrid stroke="rgba(241,239,232,.12)" vertical={false} /><XAxis dataKey={xField} stroke="#aaa9a3" /><YAxis stroke="#aaa9a3" /><Tooltip /><Legend />{series.map((name, index) => <Line key={name} dataKey={name} stroke={colors[index % colors.length]} strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} />)}</LineChart>}
        </ResponsiveContainer>
      </div>
      <details className="ask-table-equivalent"><summary>View the tabular equivalent</summary><AccessibleDataTable result={result} fields={[xField, yField, ...(seriesField ? [seriesField] : [])]} /></details>
      <EvidenceReceipt result={result} />
    </section>
  );
}

function EvidenceTableBlock({ resultId, title, columns }: { resultId: string; title: string; columns: Array<{ field: string; label: string }> }) {
  const result = useResult(resultId);
  if (!result) return <MissingResult />;
  const renamed = { ...result, columns: result.columns.map((column) => ({ ...column, displayName: columns.find((item) => item.field === column.name)?.label ?? column.displayName })) };
  return <section className="ask-generative-block ask-evidence-table"><header><p>Evidence table</p><h3>{title}</h3></header><AccessibleDataTable result={renamed} fields={columns.map((column) => column.field)} /><EvidenceReceipt result={result} /></section>;
}

function PacificMapBlock({ resultId, title, latitudeField, longitudeField, labelField }: { resultId: string; title: string; latitudeField: string; longitudeField: string; labelField: string | null }) {
  const result = useResult(resultId);
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!result || !mountRef.current) return;
    let cancelled = false;
    let map: import("maplibre-gl").Map | undefined;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !mountRef.current) return;
      const points = records(result).flatMap((row, index) => {
        const latitude = Number(row[latitudeField]);
        const longitude = Number(row[longitudeField]);
        return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ type: "Feature" as const, id: index, geometry: { type: "Point" as const, coordinates: [longitude, latitude] }, properties: { label: labelField ? String(row[labelField] ?? "Observation") : "Observation" } }] : [];
      });
      map = new maplibregl.Map({ container: mountRef.current, style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/fiord", center: [168, 8], zoom: 1.5, minZoom: 1, maxZoom: 10, cooperativeGestures: true, attributionControl: false });
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '<a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a>' }), "bottom-right");
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.once("load", () => {
        if (cancelled || !map) return;
        map.addSource("ask-points", { type: "geojson", data: { type: "FeatureCollection", features: points } });
        map.addLayer({ id: "ask-points", type: "circle", source: "ask-points", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 4, 7, 9], "circle-color": "#ff5a2f", "circle-stroke-color": "#f1efe8", "circle-stroke-width": 1, "circle-opacity": 0.82 } });
        setReady(true);
      });
    });
    return () => { cancelled = true; map?.remove(); };
  }, [labelField, latitudeField, longitudeField, result]);
  if (!result) return <MissingResult />;
  return <section className="ask-generative-block ask-map-block"><header><p>Pacific map</p><h3>{title}</h3></header><div className="ask-result-map" role="region" aria-label={`${title} interactive map`}><div ref={mountRef} className="map-canvas" />{!ready && <div className="map-loading" role="status"><span />Resolving observations…</div>}</div><details className="ask-table-equivalent"><summary>View the map data as a table</summary><AccessibleDataTable result={result} fields={[labelField, latitudeField, longitudeField].filter(Boolean) as string[]} /></details><EvidenceReceipt result={result} /></section>;
}

function TimelineBlock({ resultId, title, dateField, labelField, detailField }: { resultId: string; title: string; dateField: string; labelField: string; detailField: string | null }) {
  const result = useResult(resultId);
  if (!result) return <MissingResult />;
  return <section className="ask-generative-block ask-timeline"><header><p>Event chronology</p><h3>{title}</h3></header><ol>{records(result).map((row, index) => <li key={index}><time>{formatValue(row[dateField], "year")}</time><div><strong>{formatValue(row[labelField])}</strong>{detailField && <p>{formatValue(row[detailField])}</p>}</div></li>)}</ol><EvidenceReceipt result={result} /></section>;
}

function DefinitionReceiptBlock({ resultId, title }: { resultId: string; title: string }) {
  const result = useResult(resultId);
  if (!result) return <MissingResult />;
  const row = records(result)[0] ?? {};
  return <section className="ask-generative-block ask-definition-receipt"><header><p>Definition receipt</p><h3>{title}</h3></header><p className="ask-definition-warning">A transparent comparison rule—not a scientific hazard boundary.</p><dl>{["baselineLabel", "baselineVersion", "baselineCount", "candidateCount", "both", "smithsonianOnly", "ruleOnly", "tectonic", "maxDistanceKm", "eruptedSince", "fingerprint"].map((field) => <div key={field}><dt>{field.replaceAll(/([A-Z])/g, " $1")}</dt><dd>{formatValue(row[field])}</dd></div>)}</dl>{row.notice && <p>{String(row.notice)}</p>}<EvidenceReceipt result={result} /></section>;
}

function WorkspaceBlock({ resourceKey, title }: { resourceKey: string; title: string }) {
  return <section className="ask-generative-block ask-workspace-block"><header><p>Published Data Lab workspace</p><h3>{title}</h3></header><LazyMetabaseEmbed resourceKey={resourceKey} /></section>;
}

function SourceListBlock({ title, sourceIds }: { title: string; sourceIds: Array<keyof typeof curatedSources> }) {
  return <section className="ask-generative-block ask-source-list"><header><p>Approved sources</p><h3>{title}</h3></header><ul>{sourceIds.map((id) => { const source = curatedSources[id]; return <li key={id}><a href={source.url} target={source.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer"><strong>{source.label}</strong><span>{source.authority} · {source.version}</span><p>{source.context}</p></a></li>; })}</ul></section>;
}

const AskSpecRenderer = createRenderer(askCatalog, {
  MetricStrip: ({ element }) => <MetricStripBlock {...element.props} />,
  InteractiveSeries: ({ element }) => <SeriesBlock {...element.props} />,
  EvidenceTable: ({ element }) => <EvidenceTableBlock {...element.props} />,
  PacificMap: ({ element }) => <PacificMapBlock {...element.props} />,
  EventTimeline: ({ element }) => <TimelineBlock {...element.props} />,
  DefinitionReceipt: ({ element }) => <DefinitionReceiptBlock {...element.props} />,
  MetabaseWorkspace: ({ element }) => <WorkspaceBlock {...element.props} />,
  SourceList: ({ element }) => <SourceListBlock {...element.props} />,
});

export function GenerativeBlocks({ spec, results, loading }: { spec: Spec | null; results: NormalizedResult[]; loading?: boolean }) {
  const byId = useMemo(() => new Map(results.map((result) => [result.resultId, result])), [results]);
  const validatedSpec = useMemo(() => {
    if (!spec) return null;
    return validateAskSpec(spec);
  }, [spec]);
  if (spec && !validatedSpec) return <div className="ask-block-missing" role="status">The generated evidence layout did not pass the safe component catalog.</div>;
  return <ResultsContext.Provider value={byId}><AskSpecRenderer spec={validatedSpec as Spec | null} loading={loading} /></ResultsContext.Provider>;
}
