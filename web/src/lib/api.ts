import {
  fallbackBoundaries,
  fallbackEarthquakes,
  fallbackSourceStatus,
  fallbackTsunamis,
  fallbackVolcanoes,
} from "@/lib/data";
import type {
  BoundaryProperties,
  EarthquakeProperties,
  FeatureCollection,
  LineGeometry,
  PointGeometry,
  SourceStatusResponse,
  TsunamiProperties,
  VolcanoProperties,
} from "@/lib/types";
import { withBasePath } from "@/lib/paths";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? withBasePath("/api/v1");

export type AtlasFilters = {
  bbox?: [number, number, number, number];
  region?: string;
  startDate?: string;
  endDate?: string;
  minMagnitude?: number;
  maxDepth?: number;
  minVei?: number;
  maxVei?: number;
  volcanoType?: string;
  confidence?: string;
  limit?: number;
};

export function buildAtlasQuery(filters: AtlasFilters = {}) {
  const params = new URLSearchParams();
  const publicNames: Record<keyof AtlasFilters, string> = {
    bbox: "bbox",
    region: "region",
    startDate: "start",
    endDate: "end",
    minMagnitude: "minMagnitude",
    maxDepth: "maxDepthKm",
    minVei: "minVei",
    maxVei: "maxVei",
    volcanoType: "type",
    confidence: "confidence",
    limit: "limit",
  };
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    const serialized = key === "startDate"
      ? `${value}T00:00:00Z`
      : key === "endDate"
        ? `${value}T23:59:59Z`
        : Array.isArray(value)
          ? value.join(",")
          : String(value);
    params.set(publicNames[key as keyof AtlasFilters], serialized);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function request<T>(path: string, fallback: T, signal?: AbortSignal): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      signal,
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (!response.ok) throw new Error(`Atlas API returned ${response.status}`);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return fallback;
  }
}

export const atlasApi = {
  volcanoes: (filters?: AtlasFilters, signal?: AbortSignal) =>
    request<FeatureCollection<PointGeometry, VolcanoProperties>>(
      `/atlas/volcanoes${buildAtlasQuery(filters)}`,
      fallbackVolcanoes,
      signal,
    ),
  earthquakes: (filters?: AtlasFilters, signal?: AbortSignal) =>
    request<FeatureCollection<PointGeometry, EarthquakeProperties>>(
      `/atlas/earthquakes${buildAtlasQuery(filters)}`,
      fallbackEarthquakes,
      signal,
    ),
  boundaries: (filters?: AtlasFilters, signal?: AbortSignal) =>
    request<FeatureCollection<LineGeometry, BoundaryProperties>>(
      `/atlas/boundaries${buildAtlasQuery(filters)}`,
      fallbackBoundaries,
      signal,
    ),
  tsunamis: (filters?: AtlasFilters, signal?: AbortSignal) =>
    request<FeatureCollection<PointGeometry, TsunamiProperties>>(
      `/atlas/tsunamis${buildAtlasQuery(filters)}`,
      fallbackTsunamis,
      signal,
    ),
  sourceStatus: (signal?: AbortSignal) =>
    request<SourceStatusResponse>("/sources/status", fallbackSourceStatus, signal),
};

export function isFallbackCollection(collection: { meta?: { isFallback?: boolean } }) {
  return collection.meta?.isFallback === true;
}
