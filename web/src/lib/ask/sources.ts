import type { AnalyticsResource, SourceReceipt } from "@/lib/ask/types";
import { withBasePath } from "@/lib/paths";

export const curatedSources = {
  "gvp-catalog": {
    id: "gvp-catalog",
    label: "Global Volcanism Program catalog",
    authority: "Smithsonian Institution",
    url: "https://volcano.si.edu/database/webservices.cfm",
    version: "5.3.6 pinned fixture and versioned ingests",
    context: "Volcano and eruption records. Dates, VEI, and volcano classifications retain the source catalog's uncertainty and missingness.",
  },
  "gvp-prof": {
    id: "gvp-prof",
    label: "Smithsonian Pacific Ring of Fire regions",
    authority: "Smithsonian Global Volcanism Program",
    url: "https://volcano.si.edu/faq/Pacific_Ring_of_Fire.cfm",
    version: "5.3.6 reviewed membership fixture",
    context: "A reproducible regional membership baseline used by this project. It is a published catalog definition, not a universal geological boundary.",
  },
  "usgs-earthquakes": {
    id: "usgs-earthquakes",
    label: "USGS Earthquake Catalog",
    authority: "U.S. Geological Survey",
    url: "https://earthquake.usgs.gov/fdsnws/event/1/",
    version: "FDSN and GeoJSON event feeds",
    context: "Observed earthquake events. Catalog completeness varies with time, location, network coverage, and magnitude threshold.",
  },
  "usgs-plates": {
    id: "usgs-plates",
    label: "USGS plate-boundary layer",
    authority: "U.S. Geological Survey",
    url: "https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/1",
    version: "ArcGIS MapServer layer 1",
    context: "Generalized plate-boundary geometry for regional context. Spatial proximity alone does not establish causation for a particular event.",
  },
  "noaa-tsunamis": {
    id: "noaa-tsunamis",
    label: "Global Historical Tsunami Database",
    authority: "NOAA National Centers for Environmental Information",
    url: "https://www.ncei.noaa.gov/products/worldwide-tsunami-database",
    version: "Versioned event export",
    context: "Historical tsunami observations and reported impacts. Heights, deaths, damages, and causes are incomplete and observation-dependent.",
  },
  sourcebook: {
    id: "sourcebook",
    label: "Restless Pacific Sourcebook",
    authority: "Restless Pacific",
    url: withBasePath("/sourcebook"),
    version: "Current site methodology",
    context: "Project methodology, provenance model, refresh status, definition receipts, and known limitations.",
  },
} as const satisfies Record<string, SourceReceipt & { context: string }>;

export type CuratedSourceId = keyof typeof curatedSources;
export const curatedSourceIds = Object.keys(curatedSources) as CuratedSourceId[];

const resourceSources: Record<AnalyticsResource, CuratedSourceId[]> = {
  volcanoes: ["gvp-catalog", "gvp-prof", "sourcebook"],
  eruptions: ["gvp-catalog", "sourcebook"],
  earthquakes: ["usgs-earthquakes", "sourcebook"],
  tsunamis: ["noaa-tsunamis", "sourcebook"],
  plate_boundaries: ["usgs-plates", "sourcebook"],
};

export function sourceReceiptsForResource(resource: AnalyticsResource) {
  return resourceSources[resource].map((id) => {
    const source = curatedSources[id];
    return { id: source.id, label: source.label, authority: source.authority, url: source.url, version: source.version };
  });
}

export function lookupCuratedSources(ids: CuratedSourceId[]) {
  return ids.map((id) => curatedSources[id]);
}
