"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ChevronDown,
  ExternalLink,
  Layers3,
  Search,
  SlidersHorizontal,
  Waves,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PacificMap } from "@/components/pacific-map";
import { useAtlasData } from "@/hooks/use-atlas-data";
import { isFallbackCollection } from "@/lib/api";
import { volcanoProfiles } from "@/lib/data";
import type { Confidence, FeatureCollection, PointGeometry, VolcanoProperties } from "@/lib/types";

const confidenceLabels: Record<Confidence, string> = {
  authoritative: "Authoritative record",
  editorial: "Editorially derived",
  uncertain: "Uncertain / incomplete",
};

const layerConfig = [
  { key: "volcanoes", label: "Volcanoes", icon: Activity },
  { key: "earthquakes", label: "Earthquakes", icon: Activity },
  { key: "boundaries", label: "Plate boundaries", icon: Layers3 },
  { key: "tsunamis", label: "Tsunami sources", icon: Waves },
] as const;

type LayerKey = (typeof layerConfig)[number]["key"];
const profileByVolcanoNumber = new Map(volcanoProfiles.map((profile) => [profile.volcanoNumber, profile]));

export function AtlasExplorer() {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [volcanoType, setVolcanoType] = useState("all");
  const [confidence, setConfidence] = useState<Confidence | "all">("all");
  const [minMagnitude, setMinMagnitude] = useState(2.5);
  const [maxDepth, setMaxDepth] = useState(700);
  const [minVei, setMinVei] = useState<number | "">("");
  const [maxVei, setMaxVei] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    volcanoes: true,
    earthquakes: true,
    boundaries: true,
    tsunamis: true,
  });

  const atlas = useAtlasData({
    region: region === "all" ? undefined : region,
    volcanoType: volcanoType === "all" ? undefined : volcanoType,
    confidence: confidence === "all" ? undefined : confidence,
    minMagnitude,
    maxDepth,
    minVei: minVei === "" ? undefined : minVei,
    maxVei: maxVei === "" ? undefined : maxVei,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: 1000,
  });

  const volcanoes = useMemo<FeatureCollection<PointGeometry, VolcanoProperties>>(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return {
      ...atlas.volcanoes,
      features: atlas.volcanoes.features.filter(({ properties }) => {
        const matchesText = !normalized || [properties.name, properties.country, properties.region]
          .some((value) => value.toLocaleLowerCase().includes(normalized));
        return matchesText
          && (region === "all" || properties.region === region)
          && (volcanoType === "all" || properties.volcanoType === volcanoType)
          && (confidence === "all" || properties.confidence === confidence);
      }),
    };
  }, [atlas.volcanoes, confidence, query, region, volcanoType]);

  const earthquakes = useMemo(() => ({
    ...atlas.earthquakes,
    features: atlas.earthquakes.features.filter(({ properties }) => {
      const occurred = new Date(properties.occurredAt).getTime();
      const afterStart = !startDate || occurred >= new Date(`${startDate}T00:00:00Z`).getTime();
      const beforeEnd = !endDate || occurred <= new Date(`${endDate}T23:59:59Z`).getTime();
      return properties.magnitude >= minMagnitude && properties.depthKm <= maxDepth && afterStart && beforeEnd;
    }),
  }), [atlas.earthquakes, endDate, maxDepth, minMagnitude, startDate]);

  const selected = atlas.volcanoes.features.find(
    ({ properties }) => properties.volcanoNumber === selectedNumber,
  );
  const selectedProfile = selected
    ? profileByVolcanoNumber.get(selected.properties.volcanoNumber)
    : undefined;

  const regions = useMemo(
    () => [...new Set(atlas.volcanoes.features.map(({ properties }) => properties.region))].sort(),
    [atlas.volcanoes.features],
  );
  const types = useMemo(
    () => [...new Set(atlas.volcanoes.features.map(({ properties }) => properties.volcanoType))].sort(),
    [atlas.volcanoes.features],
  );
  const fallback = [atlas.volcanoes, atlas.earthquakes, atlas.boundaries, atlas.tsunamis]
    .some(isFallbackCollection);

  const toggleLayer = (layer: LayerKey) => {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  };

  return (
    <div className="atlas-page">
      <div className="atlas-map-stage">
        <PacificMap
          volcanoes={volcanoes}
          earthquakes={earthquakes}
          boundaries={atlas.boundaries}
          tsunamis={atlas.tsunamis}
          center={[172, 7]}
          zoom={1.7}
          mode="atlas"
          visibleLayers={layers}
          selectedVolcano={selectedNumber}
          onVolcanoSelect={setSelectedNumber}
        />
      </div>

      <div className="atlas-topbar">
        <div className="atlas-title">
          <span>Live workspace</span>
          <h1>Pacific Atlas</h1>
        </div>
        <label className="atlas-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search volcano, country, or region</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Volcano, country, region…"
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X /></button>}
        </label>
        <button
          className="filter-trigger"
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="atlas-filters"
          onClick={() => setFiltersOpen((value) => !value)}
        >
          <SlidersHorizontal aria-hidden="true" /> Filters
        </button>
      </div>

      <div className="layer-rail" aria-label="Map layers">
        {layerConfig.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-label={`${layers[key] ? "Hide" : "Show"} ${label}`}
            aria-pressed={layers[key]}
            onClick={() => toggleLayer(key)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {filtersOpen && (
          <motion.aside
            id="atlas-filters"
            className="filter-panel"
            initial={reduceMotion ? false : { opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            aria-label="Atlas filters"
          >
            <div className="filter-panel-head">
              <div><span>Refine</span><strong>Visible evidence</strong></div>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X /></button>
            </div>
            <label>
              Region
              <select value={region} onChange={(event) => setRegion(event.target.value)}>
                <option value="all">All PROF regions</option>
                {regions.map((value) => <option key={value}>{value}</option>)}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            <label>
              Volcano type
              <select value={volcanoType} onChange={(event) => setVolcanoType(event.target.value)}>
                <option value="all">All volcano types</option>
                {types.map((value) => <option key={value}>{value}</option>)}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            <label>
              Source confidence
              <select value={confidence} onChange={(event) => setConfidence(event.target.value as Confidence | "all")}>
                <option value="all">Any confidence</option>
                {Object.entries(confidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            <label className="range-filter">
              <span>Minimum magnitude <b>M {minMagnitude.toFixed(1)}</b></span>
              <input type="range" min="2.5" max="8" step="0.1" value={minMagnitude} onChange={(event) => setMinMagnitude(Number(event.target.value))} />
            </label>
            <label className="range-filter">
              <span>Maximum depth <b>{maxDepth} km</b></span>
              <input type="range" min="10" max="700" step="10" value={maxDepth} onChange={(event) => setMaxDepth(Number(event.target.value))} />
            </label>
            <div className="date-filter-row vei-filter-row" role="group" aria-label="Recorded eruption VEI range" aria-describedby="vei-filter-note">
              <label>
                Minimum VEI
                <select
                  value={minVei}
                  onChange={(event) => {
                    const value = event.target.value === "" ? "" : Number(event.target.value);
                    setMinVei(value);
                    if (value !== "" && maxVei !== "" && value > maxVei) setMaxVei(value);
                  }}
                >
                  <option value="">Any minimum</option>
                  {Array.from({ length: 9 }, (_, value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Maximum VEI
                <select
                  value={maxVei}
                  onChange={(event) => {
                    const value = event.target.value === "" ? "" : Number(event.target.value);
                    setMaxVei(value);
                    if (value !== "" && minVei !== "" && value < minVei) setMinVei(value);
                  }}
                >
                  <option value="">Any maximum</option>
                  {Array.from({ length: 9 }, (_, value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <p className="vei-note" id="vei-filter-note">
              When set, shows volcanoes with a recorded eruption VEI in this range. Missing VEI values are never imputed and are excluded by this filter.
            </p>
            <div className="date-filter-row">
              <label>Earthquakes from<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label>
              <label>Through<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
            </div>
            <button
              className="reset-filters"
              type="button"
              onClick={() => {
                setRegion("all"); setVolcanoType("all"); setConfidence("all");
                setMinMagnitude(2.5); setMaxDepth(700); setMinVei(""); setMaxVei(""); setStartDate(""); setEndDate("");
              }}
            >
              Reset filters
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="atlas-status" aria-live="polite">
        <span className={atlas.loading ? "status-pulse" : "status-dot"} />
        {atlas.loading ? "Refreshing layers" : `${volcanoes.features.length} volcanoes · ${earthquakes.features.length} earthquakes`}
      </div>

      {fallback && (
        <div className="fallback-banner" role="status">
          Live API unavailable · showing a small sourced fixture
        </div>
      )}

      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-volcano" /> Volcano</span>
        <span><i className="legend-quake" /> Earthquake</span>
        <span><i className="legend-boundary" /> Boundary</span>
        <span><i className="legend-tsunami" /> Tsunami source</span>
      </div>

      <Dialog.Root open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedNumber(null)} modal={false}>
        <Dialog.Portal>
          {selected && (
            <Dialog.Content className="atlas-detail-sheet" aria-describedby="atlas-detail-description">
              <div className="detail-sheet-head">
                <div>
                  <span>{selected.properties.country} · {selected.properties.region}</span>
                  <Dialog.Title>{selected.properties.name}</Dialog.Title>
                </div>
                <Dialog.Close aria-label="Close volcano details"><X /></Dialog.Close>
              </div>
              <p id="atlas-detail-description">
                {selected.properties.volcanoType}. {selected.properties.elevationM ? `${selected.properties.elevationM.toLocaleString()} m elevation.` : "Elevation not recorded."}
              </p>
              <dl>
                <div><dt>GVP number</dt><dd>{selected.properties.volcanoNumber}</dd></div>
                <div><dt>Last known eruption</dt><dd>{selected.properties.lastKnownEruption ?? "Unknown / not reported"}</dd></div>
                <div><dt>Confidence</dt><dd>{confidenceLabels[selected.properties.confidence]}</dd></div>
                <div><dt>Coordinates</dt><dd>{selected.geometry.coordinates[1].toFixed(3)}, {selected.geometry.coordinates[0].toFixed(3)}</dd></div>
                <div><dt>Source refreshed</dt><dd>{selected.properties.source.refreshedAt ? new Date(selected.properties.source.refreshedAt).toLocaleDateString("en", { dateStyle: "medium" }) : "Not reported"}</dd></div>
              </dl>
              <div className="detail-provenance">
                <span>Provenance</span>
                <strong>{selected.properties.source.authority}</strong>
                <p>{selected.properties.source.dataset} · {selected.properties.source.version}</p>
                <a href={selected.properties.source.url} target="_blank" rel="noreferrer">Open source record <ExternalLink /></a>
              </div>
              {selectedProfile ? (
                <Link className="detail-profile-link" href={`/volcanoes/${selectedProfile.slug}`}>
                  Read complete profile <ExternalLink />
                </Link>
              ) : (
                <p className="detail-profile-unavailable">Editorial profile not yet available for this record.</p>
              )}
            </Dialog.Content>
          )}
        </Dialog.Portal>
      </Dialog.Root>

      <details className="map-text-equivalent">
        <summary>Open accessible tables for every visible map layer</summary>
        <div className="map-table-scroll">
          {layers.volcanoes && <table>
              <caption>Volcanoes matching the current atlas filters ({volcanoes.features.length})</caption>
              <thead><tr><th>Name</th><th>Country</th><th>Region</th><th>Type</th><th>Last eruption</th><th>Source</th></tr></thead>
              <tbody>
                {volcanoes.features.map(({ properties }) => (
                  <tr key={properties.volcanoNumber}>
                    <th scope="row">
                      {profileByVolcanoNumber.has(properties.volcanoNumber)
                        ? <Link href={`/volcanoes/${profileByVolcanoNumber.get(properties.volcanoNumber)!.slug}`}>{properties.name}</Link>
                        : properties.name}
                    </th>
                    <td>{properties.country}</td><td>{properties.region}</td><td>{properties.volcanoType}</td>
                    <td>{properties.lastKnownEruption ?? "Unknown"}</td>
                    <td><a href={properties.source.url}>{properties.source.authority}</a>{properties.source.refreshedAt && <small>{new Date(properties.source.refreshedAt).toLocaleDateString("en", { dateStyle: "medium" })}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
          {layers.earthquakes && <table>
              <caption>Earthquakes matching magnitude, depth, and date filters ({earthquakes.features.length})</caption>
              <thead><tr><th>Place</th><th>Magnitude</th><th>Depth</th><th>Time (UTC)</th><th>Status</th></tr></thead>
              <tbody>{earthquakes.features.map(({ properties }) => <tr key={properties.eventId}><th scope="row">{properties.place}</th><td>M {properties.magnitude.toFixed(1)}</td><td>{properties.depthKm} km</td><td>{new Date(properties.occurredAt).toLocaleString("en", { timeZone: "UTC" })}</td><td>{properties.status}</td></tr>)}</tbody>
            </table>}
          {layers.boundaries && <table>
              <caption>Plate boundary segments ({atlas.boundaries.features.length})</caption>
              <thead><tr><th>Name</th><th>Boundary type</th><th>Confidence</th><th>Source</th></tr></thead>
              <tbody>{atlas.boundaries.features.map(({ properties }) => <tr key={properties.boundaryId}><th scope="row">{properties.name}</th><td>{properties.boundaryType}</td><td>{confidenceLabels[properties.confidence]}</td><td><a href={properties.source.url}>{properties.source.authority}</a></td></tr>)}</tbody>
            </table>}
          {layers.tsunamis && <table>
              <caption>Significant tsunami sources ({atlas.tsunamis.features.length})</caption>
              <thead><tr><th>Place</th><th>Year</th><th>Cause</th><th>Maximum recorded height</th><th>Deaths</th></tr></thead>
              <tbody>{atlas.tsunamis.features.map(({ properties }) => <tr key={properties.eventId}><th scope="row">{properties.place}</th><td>{properties.year}</td><td>{properties.cause}</td><td>{properties.maxWaterHeightM === null ? "Not reported" : `${properties.maxWaterHeightM} m`}</td><td>{properties.deaths === null ? "Not reported" : properties.deaths.toLocaleString()}</td></tr>)}</tbody>
            </table>}
        </div>
      </details>
    </div>
  );
}
