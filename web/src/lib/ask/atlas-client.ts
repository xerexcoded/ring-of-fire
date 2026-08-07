import { randomUUID } from "node:crypto";
import { curatedSources } from "@/lib/ask/sources";
import type { NormalizedResult, ResultColumn, ResultValue, SourceReceipt } from "@/lib/ask/types";
import { AskDependencyError } from "@/lib/ask/metabase-client";

export type AtlasLookupInput = {
  kind: "volcanoes" | "earthquakes" | "boundaries" | "tsunamis" | "search" | "source-status";
  query?: string;
  region?: string;
  start?: string;
  end?: string;
  minMagnitude?: number;
  maxDepthKm?: number;
  minVei?: number;
  limit?: number;
};

export type RingDefinitionInput = {
  tectonic: "all" | "subduction";
  maxDistanceKm: number | null;
  eruptedSince: 1800 | 1960 | null;
};

function apiBase() {
  return (process.env.API_BASE_URL ?? "http://backend:8080/api/v1").replace(/\/$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): ResultValue | undefined {
  return value === null || ["string", "number", "boolean"].includes(typeof value)
    ? value as ResultValue
    : undefined;
}

function receipt(id: keyof typeof curatedSources): SourceReceipt {
  const source = curatedSources[id];
  return { id: source.id, label: source.label, authority: source.authority, url: source.url, version: source.version };
}

const kindSources: Record<AtlasLookupInput["kind"], SourceReceipt[]> = {
  volcanoes: [receipt("gvp-catalog"), receipt("gvp-prof"), receipt("sourcebook")],
  earthquakes: [receipt("usgs-earthquakes"), receipt("sourcebook")],
  boundaries: [receipt("usgs-plates"), receipt("sourcebook")],
  tsunamis: [receipt("noaa-tsunamis"), receipt("sourcebook")],
  search: [receipt("sourcebook")],
  "source-status": [receipt("sourcebook")],
};

function normalizeObjects(
  resource: string,
  items: Array<Record<string, unknown>>,
  querySummary: string,
  sources: SourceReceipt[],
  sourceVersion = "See source receipt",
  truncated = false,
): NormalizedResult {
  const names = [...new Set(items.flatMap((item) => Object.keys(item).filter((key) => scalar(item[key]) !== undefined)))].slice(0, 24);
  const columns: ResultColumn[] = names.map((name) => ({ name, displayName: name.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ").trim(), baseType: "type/*" }));
  const rows = items.slice(0, 100).map((item) => names.map((name) => scalar(item[name]) ?? null));
  return {
    resultId: randomUUID(),
    resource,
    columns,
    rows,
    rowCount: rows.length,
    truncated: truncated || items.length > rows.length,
    querySummary,
    sourceVersion,
    retrievedAt: new Date().toISOString(),
    sources,
  };
}

async function getJson(path: string, signal: AbortSignal) {
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (!response.ok) throw new AskDependencyError("atlas-offline", `Atlas API returned ${response.status}.`);
    return await response.json() as unknown;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof AskDependencyError) throw error;
    throw new AskDependencyError("atlas-offline", "The Restless Pacific Atlas API is unavailable.");
  }
}

function lookupPath(input: AtlasLookupInput) {
  if (input.kind === "source-status") return "/sources/status";
  if (input.kind === "search") {
    if (!input.query?.trim()) throw new Error("A search query is required.");
    return `/search?q=${encodeURIComponent(input.query.trim().slice(0, 120))}`;
  }
  const params = new URLSearchParams();
  if (input.region) params.set("region", input.region.slice(0, 100));
  if (input.start) params.set("start", input.start);
  if (input.end) params.set("end", input.end);
  if (input.minMagnitude !== undefined) params.set("minMagnitude", String(input.minMagnitude));
  if (input.maxDepthKm !== undefined) params.set("maxDepthKm", String(input.maxDepthKm));
  if (input.minVei !== undefined) params.set("minVei", String(input.minVei));
  params.set("limit", String(Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 100)));
  return `/atlas/${input.kind}?${params.toString()}`;
}

export async function lookupAtlas(input: AtlasLookupInput, signal: AbortSignal) {
  const payload = await getJson(lookupPath(input), signal);
  if (!isRecord(payload)) throw new AskDependencyError("invalid-upstream-response", "Atlas API returned malformed data.");

  if (input.kind === "source-status") {
    const datasets = Array.isArray(payload.datasets) ? payload.datasets : [];
    const items = datasets.filter(isRecord).map((dataset) => ({
      key: dataset.key,
      name: dataset.name,
      authority: dataset.authority,
      version: dataset.version,
      publishedAt: dataset.publishedAt,
      lastSuccessfulRunAt: dataset.lastSuccessfulRunAt,
      refreshCadence: dataset.refreshCadence,
      membershipReviewStatus: dataset.membershipReviewStatus,
      sourceUrl: dataset.sourceUrl,
    }));
    return normalizeObjects("atlas.source-status", items, "Current source ledger status", kindSources[input.kind]);
  }
  if (input.kind === "search") {
    const items = Array.isArray(payload.items) ? payload.items.filter(isRecord) : [];
    return normalizeObjects("atlas.search", items, `Search: ${input.query}`, kindSources[input.kind]);
  }

  const features = Array.isArray(payload.features) ? payload.features.filter(isRecord) : [];
  const items = features.map((feature) => {
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const geometry = isRecord(feature.geometry) ? feature.geometry : {};
    const coordinates = geometry.type === "Point" && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const flattened: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (key === "source") continue;
      if (scalar(value) !== undefined) flattened[key] = value;
    }
    if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      flattened.longitude = coordinates[0];
      flattened.latitude = coordinates[1];
    }
    return flattened;
  });
  const meta = isRecord(payload.meta) ? payload.meta : {};
  const limit = typeof meta.limit === "number" ? meta.limit : 100;
  const sourceVersion = items.map((item) => item.sourceVersion).find((value): value is string => typeof value === "string") ?? "See source ledger";
  return normalizeObjects(
    `atlas.${input.kind}`,
    items,
    `${input.kind} lookup · limit ${limit}`,
    kindSources[input.kind],
    sourceVersion,
    typeof meta.count === "number" && meta.count >= limit,
  );
}

export async function compareRingDefinition(input: RingDefinitionInput, signal: AbortSignal) {
  const params = new URLSearchParams({ tectonic: input.tectonic });
  if (input.maxDistanceKm !== null) params.set("maxDistanceKm", String(input.maxDistanceKm));
  if (input.eruptedSince !== null) params.set("eruptedSince", String(input.eruptedSince));
  const payload = await getJson(`/definitions/compare?${params.toString()}`, signal);
  if (!isRecord(payload) || !isRecord(payload.meta)) {
    throw new AskDependencyError("invalid-upstream-response", "Ringmaker returned malformed data.");
  }
  const meta = payload.meta;
  const counts = isRecord(meta.comparisonCounts) ? meta.comparisonCounts : {};
  const baseline = isRecord(meta.baseline) ? meta.baseline : {};
  const source = isRecord(meta.source) ? meta.source : {};
  return normalizeObjects("ringmaker.definition-comparison", [{
    baselineLabel: baseline.label,
    baselineVersion: baseline.version,
    baselineCount: meta.baselineCount,
    candidateCount: meta.candidateCount,
    both: counts.both,
    smithsonianOnly: counts["smithsonian-only"],
    ruleOnly: counts["rule-only"],
    neither: counts.neither,
    tectonic: input.tectonic,
    maxDistanceKm: input.maxDistanceKm,
    eruptedSince: input.eruptedSince,
    fingerprint: meta.fingerprint,
    notice: meta.notice,
  }], `Restless Pacific rule · tectonic ${input.tectonic} · distance ${input.maxDistanceKm ?? "any"} km · erupted since ${input.eruptedSince ?? "any"}`, [receipt("gvp-prof"), receipt("sourcebook")], typeof source.version === "string" ? source.version : "See definition receipt");
}
