import type { UIMessage } from "ai";

export const analyticsResources = [
  "volcanoes",
  "eruptions",
  "earthquakes",
  "tsunamis",
  "plate_boundaries",
] as const;

export type AnalyticsResource = (typeof analyticsResources)[number];

export const analyticsFields: Record<AnalyticsResource, readonly string[]> = {
  volcanoes: [
    "volcano_number", "name", "slug", "country", "subregion", "region",
    "volcano_type", "tectonic_setting", "elevation_m", "last_eruption_year",
    "latitude", "longitude", "in_smithsonian_prof", "source_version",
  ],
  eruptions: [
    "eruption_number", "volcano_number", "volcano_name", "country", "region",
    "start_year", "start_month", "start_day", "date_precision", "vei",
    "certainty", "source_version",
  ],
  earthquakes: [
    "event_id", "occurred_at", "magnitude", "magnitude_type", "depth_km",
    "place", "significance", "tsunami_flag", "latitude", "longitude",
    "source_version",
  ],
  tsunamis: [
    "event_id", "event_year", "event_month", "event_day", "date_precision",
    "cause", "country", "location_name", "source_magnitude",
    "maximum_water_height_m", "deaths", "damage_usd", "validity",
    "source_confidence", "latitude", "longitude", "source_version",
  ],
  plate_boundaries: [
    "boundary_id", "name", "boundary_type", "length_km", "source_version",
  ],
};

export type ResultValue = string | number | boolean | null;

export type ResultColumn = {
  name: string;
  displayName: string;
  baseType: string;
};

export type SourceReceipt = {
  id: string;
  label: string;
  authority: string;
  url: string;
  version: string;
};

export type NormalizedResult = {
  resultId: string;
  resource: string;
  columns: ResultColumn[];
  rows: ResultValue[][];
  rowCount: number;
  truncated: boolean;
  querySummary: string;
  sourceVersion: string;
  retrievedAt: string;
  sources: SourceReceipt[];
};

export type AskMessageMetadata = {
  requestId?: string;
  modelId?: string;
};

export type AskDataParts = {
  queryResult: NormalizedResult;
  sourceReceipt: SourceReceipt;
};

export type AskUIMessage = UIMessage<AskMessageMetadata, AskDataParts>;

export const dashboardResourceKeys = [
  "ring-of-fire-data-lab",
  "volcano-eruption-data-lab",
  "earthquake-plate-data-lab",
  "tsunami-impact-data-lab",
] as const;

export type DashboardResourceKey = (typeof dashboardResourceKeys)[number];
