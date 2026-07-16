# HTTP API reference

Local public origin: `http://api.localhost`. All data routes are under
`/api/v1`. JSON uses camelCase. GeoJSON coordinates are longitude, latitude.

## Health

`GET /healthz` and `GET /readyz` return `200` only when the API can query its
database. These routes are outside the versioned API.

## Shared map parameters

| Parameter | Format | Default / rule |
|---|---|---|
| `bbox` | `west,south,east,north` | Whole world; longitude −180…180, latitude −90…90 |
| `limit` | integer | 250; minimum 1, maximum 1000 |
| `offset` | integer | 0; non-negative |

A dateline-crossing bound is represented by `west > east`, for example
`170,-50,-170,10`. `south` must always be below `north`.

Successful map responses use `application/geo+json`:

```json
{
  "type": "FeatureCollection",
  "features": [],
  "meta": {
    "count": 0,
    "limit": 250,
    "offset": 0,
    "sourceDataset": "gvp",
    "generatedAt": "2026-07-15T00:00:00Z"
  }
}
```

### `GET /api/v1/atlas/volcanoes`

Additional filters: `region` (region slug), `type`, `confidence`, `minVei`, and
`maxVei`. VEI filters mean “has at least one recorded eruption in this range”;
missing VEI is not treated as zero. The default collection contains the current
included Smithsonian PROF membership, not every volcano in the global catalog.
Properties include `volcanoNumber`, name, country, region, type, elevation,
last known eruption year, membership confidence, and source object.

```sh
curl 'http://api.localhost/api/v1/atlas/volcanoes?bbox=165,-50,-165,-10&limit=50'
```

### `GET /api/v1/atlas/earthquakes`

Additional filters: ISO-8601 `start`/`end`, `minMagnitude`, `maxMagnitude`,
`minDepthKm`, and `maxDepthKm`. Deleted or superseded tombstones are excluded.

```sh
curl 'http://api.localhost/api/v1/atlas/earthquakes?minMagnitude=5&minDepthKm=0&maxDepthKm=100'
```

### `GET /api/v1/atlas/boundaries`

Additional filter: `type` such as `convergent`, `divergent`, `transform`, or
the exact upstream “other” classification. Geometry is LineString or
MultiLineString as supplied after normalization.

### `GET /api/v1/atlas/tsunamis`

Additional filters: `startYear`, `endYear`, `cause`, and `confidence`.
Nullable impact properties are omitted or JSON null; unknown is not zero.

## Volcano detail

`GET /api/v1/volcanoes/{volcanoNumber}` returns profile facts, coordinates,
source, partial-date eruption history, and nearest-boundary context. The latter
always carries the interpretation that distance is derived proximity only and
does not establish cause.

## Search

`GET /api/v1/search?q=fuji` searches volcano name, country, and region. Query
length is 2–100 characters and results are capped at 20.

## Source status

`GET /api/v1/sources/status` returns active version, publication time, last
successful run, cadence, license, membership review state, source URL, and
dataset-specific caveats. A page should use this endpoint instead of describing
all data as simply “live.”

## Metabase resource resolution

`GET /api/v1/metabase/resources/{resourceKey}` resolves an enabled stable
resource key to its current Metabase `entityType` and numeric `entityId`. This
keeps the frontend independent of IDs assigned by a particular Metabase app
database while preserving the official numeric token request.

## Guest token

`POST /api/v1/metabase/guest-token`

```json
{
  "entityType": "dashboard",
  "entityId": 12,
  "customContext": {
    "region": "Southern Andean Volcanic Arc",
    "start_year": 1960
  }
}
```

The request origin must be allow-listed, the entity must be enabled in
`ops.metabase_resource`, and custom keys must be allowed for that resource.
A successful response is `{ "jwt": "..." }`, carries `Cache-Control: no-store`,
and expires in at most 60 minutes. The response never contains the signing
secret.

## Problem responses

Validation, authorization, not-found, and service failures use
`application/problem+json` with RFC 9457-style fields:

```json
{
  "type": "about:blank",
  "title": "Invalid bounding box",
  "status": 400,
  "detail": "bbox must contain west,south,east,north.",
  "instance": "/api/v1/atlas/volcanoes"
}
```
