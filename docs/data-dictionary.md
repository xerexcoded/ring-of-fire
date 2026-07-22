# Data dictionary

This document describes the analytical contract. SQL migrations under
`backend/resources/migrations` are authoritative. All spatial columns use SRID
4326 and API output follows RFC 7946 longitude/latitude order.

## Schemas

| Schema | Purpose | Metabase access |
|---|---|---|
| `core` | Normalized scientific and editorial domain records | None |
| `staging` | Transaction-scoped upstream parsing and validation | None |
| `ops` | Dataset versions, ingestion audit, rejections, embed allow-list | None |
| `analytics` | Stable, flattened read models for saved Metabase questions | `USAGE`, `SELECT` |

## Provenance and operations

### `ops.source_dataset`

One row per authoritative upstream dataset.

| Column | Type | Meaning |
|---|---|---|
| `id` | bigint identity | Internal key |
| `source_key` | text, unique | Stable code such as `gvp`, `usgs-earthquakes`, `usgs-plates`, `noaa-tsunami` |
| `display_name` | text | Human-readable dataset name |
| `authority` | text | Publishing institution |
| `source_url` | text | Direct data or service URL |
| `license_name`, `license_url` | text, nullable | Rights and reuse context |
| `refresh_cadence` | text | Intended update schedule |
| `current_version` | text, nullable | Active upstream or snapshot version |
| `current_published_at` | timestamptz, nullable | Upstream publication timestamp when available |
| `last_successful_run_at` | timestamptz, nullable | Freshness exposed in the sourcebook |
| `expected_record_count` | integer, nullable | Acceptance count for pinned fixtures |
| `expected_region_count` | integer, nullable | Acceptance region count where applicable |
| `membership_review_status` | text | `not_applicable`, `approved`, or `review_required` |
| `metadata` | jsonb | Dataset-specific caveats and thresholds |

### `ops.ingestion_run`

Immutable audit entry for an attempted refresh. `status` is `running`,
`succeeded`, `failed`, or `skipped_locked`. It records upstream version and
publication time, start/finish times, fetched/staged/activated/rejected counts,
SHA-256 checksum, error classification, and a JSON validation report. A failed
row does not make its staged data active.

### `ops.ingestion_rejection`

Quarantined source record tied to an ingestion run, with optional upstream ID,
machine-readable raw JSON, and a human-readable reason. This table is not
visible to Metabase.

### `ops.metabase_resource`

The guest-token allow-list and provisioning reconciliation record.

| Column | Meaning |
|---|---|
| `resource_key` | Stable code used by bootstrap, independent of Metabase numeric IDs |
| `entity_type` | `dashboard` or `question` |
| `entity_id` | Numeric ID returned by the pinned Metabase API |
| `display_name` | Operator-facing label |
| `enabled` | Revocation switch checked at token issuance |
| `allowed_parameters` | JSON array of controlled filter keys |

## Domain tables

### `core.volcanic_region`

GVP region name, stable slug, optional region number and parent, PROF flag,
editorial story order, optional multipolygon, and source version. `prof_region`
describes the region record; individual membership remains versioned in
`ring_membership`.

### `core.volcano`

| Column | Type | Notes |
|---|---|---|
| `volcano_number` | integer, primary key | Smithsonian stable identifier |
| `name`, `slug` | text | Display and deep-link identity |
| `country`, `subregion` | text, nullable | Source geography |
| `volcanic_region_id` | bigint, nullable FK | Normalized region |
| `primary_volcano_type` | text, nullable | Source classification, not inferred |
| `tectonic_setting` | text, nullable | Source tectonic context |
| `evidence_category` | text, nullable | Nature of eruption evidence |
| `elevation_m` | integer, nullable | Elevation relative to sea level |
| `last_eruption_year` | integer, nullable | Signed year; not converted to an invented date |
| `description` | text, nullable | Sourced or explicitly editorial profile text |
| `geom` | geometry(Point, 4326) | Validated coordinate |
| `source_dataset_id`, `source_version` | provenance | Exact active evidence |
| `source_updated_at` | timestamptz, nullable | Upstream modification time when available |

### `core.ring_membership`

Composite key `(volcano_number, definition_key, dataset_version)`. `included`
is accompanied by an inclusion reason, `authoritative`/`editorial`/`uncertain`
confidence, review time, and source. This table is the implementation of ADR
0001; it intentionally replaces an `is_ring_of_fire` column.

### `core.eruption`

An eruption number belongs to one volcano and preserves separate nullable start
and end year/month/day values. `date_precision` is one of `day`, `month`,
`year`, `decade`, `century`, or `unknown`. Signed years preserve BCE records.
VEI is nullable and constrained to 0–8; missing VEI is never treated as zero.
Category, area, evidence method, certainty, and source version remain available
for interpretation.

### `core.earthquake`

USGS `event_id` is the upsert key. The row retains occurrence and upstream
revision timestamps, magnitude/type, depth in kilometres, place, event type,
significance, tsunami flag, felt reports, alert/status, detail URL, PointZ
geometry, source version, and an `is_deleted` tombstone. Reconciliation can
therefore represent USGS updates and deletions without losing lineage.

### `core.plate_boundary`

Source boundary ID, nullable name, boundary classification, description,
MultiLineString geometry, upstream update time, and source version. Atlas
proximity is derived with geodesic distance and must always be labelled
“proximity only; not causal attribution.”

### `core.tsunami_event`

NOAA event key; partial year/month/day plus `date_precision`; cause, country,
location, source magnitude, maximum reported water height, deaths, damage,
validity, confidence, notes, optional point geometry, and exact source version.
Impact numbers are nullable and observation-dependent.

### `core.story_region`

Editorial chapter slug/title/dek and order, explicit camera center/zoom,
optional route MultiLineString, and editorial notes. It controls the six-step
journey but never changes scientific membership.

## Analytical views

Only these views are visible to `metabase_reader`:

| View | Grain | Intended questions |
|---|---|---|
| `analytics.volcanoes` | One row per volcano | PROF membership, counts by region/type, mapped locations |
| `analytics.eruptions` | One row per eruption | Eruptions by decade and VEI distribution; default 1960+ for trends |
| `analytics.earthquakes` | One active event per row | Magnitude versus depth and recent activity |
| `analytics.tsunamis` | One event per row | Cause, observation, and impact summaries |
| `analytics.plate_boundaries` | One boundary record per row | Boundary inventory and geodesic length by type |

`analytics.plate_boundaries.length_km` is derived from the source linework as a
geography measurement. It provides inventory context only; neither a boundary
count nor its length attributes an earthquake to that boundary.

Early historical observations are incomplete. Saved trend questions default to
1960 onward and say so visibly; the underlying views preserve older records for
explicit historical analysis.

## Null and uncertainty rules

- Unknown is `NULL`, not zero, empty string, January 1, sea level, or VEI 0.
- Partial dates keep only supplied components and a precision value.
- Coordinates outside longitude −180…180 or latitude −90…90 are rejected.
- Upstream revisions update the same stable event key and retain source time.
- Confidence describes source/evidence quality; it is not a hazard probability.
- Counts always identify the dataset version and active filters.
