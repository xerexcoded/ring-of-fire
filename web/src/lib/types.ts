export type Position = [longitude: number, latitude: number];

export type PointGeometry = {
  type: "Point";
  coordinates: Position;
};

export type LineGeometry = {
  type: "LineString" | "MultiLineString";
  coordinates: Position[] | Position[][];
};

export type Feature<G, P> = {
  type: "Feature";
  id?: string | number;
  geometry: G;
  properties: P;
};

export type DatasetMeta = {
  count: number;
  limit: number;
  offset: number;
  sourceDataset: string;
  generatedAt: string;
  isFallback?: boolean;
  notice?: string;
  sourceUrl?: string;
};

export type FeatureCollection<G, P> = {
  type: "FeatureCollection";
  features: Array<Feature<G, P>>;
  meta: DatasetMeta;
};

export type Confidence = "authoritative" | "editorial" | "uncertain";

export type SourceRef = {
  dataset: string;
  authority: string;
  version: string;
  url: string;
  publishedAt?: string | null;
  refreshedAt?: string | null;
};

export type VolcanoProperties = {
  volcanoNumber: number;
  slug: string;
  name: string;
  country: string;
  region: string;
  volcanoType: string;
  elevationM: number | null;
  lastKnownEruption: number | string | null;
  confidence: Confidence;
  source: SourceRef;
};

export type EarthquakeProperties = {
  eventId: string;
  place: string;
  magnitude: number;
  depthKm: number;
  occurredAt: string;
  status: string;
  source: SourceRef;
};

export type BoundaryProperties = {
  boundaryId: string;
  name: string;
  boundaryType: "convergent" | "divergent" | "transform" | "other";
  confidence: Confidence;
  source: SourceRef;
};

export type TsunamiProperties = {
  eventId: string;
  place: string;
  year: number;
  cause: string;
  maxWaterHeightM: number | null;
  deaths: number | null;
  confidence: Confidence;
  source: SourceRef;
};

export type StoryChapter = {
  id: string;
  kicker: string;
  title: string;
  range: string;
  body: string;
  boundary: string;
  evidence: string;
  center: Position;
  zoom: number;
  volcanoSlugs: string[];
};

export type EruptionMoment = {
  year: number;
  label: string;
  detail: string;
  precision: "day" | "month" | "year" | "range";
};

export type VolcanoProfile = VolcanoProperties & {
  position: Position;
  localName?: string;
  dek: string;
  introduction: string;
  tectonicSetting: string;
  membershipNote: string;
  notableEruptions: EruptionMoment[];
  sources: Array<{ label: string; href: string }>;
};

export type HistoryMoment = {
  id: string;
  year: string;
  title: string;
  place: string;
  kind: "eruption" | "earthquake + tsunami";
  measured: string;
  interpretation: string;
  uncertainty: string;
  sourceLabel: string;
  sourceUrl: string;
};

export type SourceStatus = {
  key: string;
  name: string;
  authority: string;
  version: string;
  publishedAt: string | null;
  lastSuccessfulRunAt: string | null;
  refreshCadence: string;
  membershipReviewStatus: string | null;
  sourceUrl: string;
  license: { name: string | null; url: string | null };
  metadata: Record<string, unknown>;
};

export type SourceStatusResponse = {
  generatedAt: string;
  datasets: SourceStatus[];
  disclaimer: string;
};
