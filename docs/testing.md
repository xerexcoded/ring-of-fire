# Test strategy

The test suite follows data risk rather than framework boundaries. A polished
map is not considered correct if it erases uncertainty, a token endpoint is not
considered secure if arbitrary IDs are signed, and a green unit suite is not a
replacement for a clean-checkout launch.

## Local confidence ladder

```sh
make test            # Clojure + Next.js tests/build
make compose-check   # configuration model
make dev             # real PostGIS + pinned Metabase
make smoke           # public surfaces and permission boundary
make test-e2e        # deterministic browser behavior and accessibility
make test-full-stack # PostGIS roles + real guest embed on desktop/mobile
```

## Backend matrix

| Area | Required cases |
|---|---|
| GVP parser | GeoJSON fixture, unknown optional fields, missing VEI, duplicate volcano/eruption IDs, 5.3.6 count and 41-region guard |
| USGS parser | PointZ coordinates, upstream revision, deletion tombstone, duplicate event ID, missing optional magnitude, timeout and non-JSON body |
| NOAA parser | TSV quoting/encoding, missing impact fields, cause/validity mapping, partial and BCE dates |
| Plate parser | MultiLineString normalization, boundary types, invalid/out-of-range geometry, dateline behavior |
| Ingestion transaction | staging rollback, atomic activation, idempotent rerun, advisory-lock loser, retry/backoff, checksum/version audit, last-good preservation |
| Spatial queries | normal and dateline bbox, result cap, GiST-backed intersection, nearest-boundary geodesic distance and non-causal label |
| HTTP contract | RFC 7946 structure, filter validation, partial pagination, 404, `application/problem+json`, source/version/freshness fields |
| Guest JWT | allow-listed resource, unknown/disabled ID, HS256, exact resource claim, expiry ≤ 3600 s, invalid origin, disallowed parameter, secret length floor |
| Metabase bootstrap | clean setup, second-run idempotence, stable resource keys, read-only connection, six questions, dashboard and controlled filters |

Parser fixtures remain small and explicit. The 688 volcano acceptance fixture
may be a checked snapshot/count manifest, but a ten-profile demo seed must never
masquerade as the full Smithsonian dataset. The sorted, LF-terminated v5.3.6 ID
fixture must hash to
`efccd415cc6851623f20851af5abd872717e014486e2194453139ab78adf4525`.

## Frontend and browser matrix

| Flow | Assertions |
|---|---|
| Journey | six chapters, manual controls, scroll camera, source labels, Indonesia definition case |
| Reduced motion | no route/camera interpolation; static equivalent and chapter buttons remain usable |
| Atlas | search, layer toggles, bbox filters, detail sheet, deep link, table equivalent |
| Profiles/history | all named routes render; partial dates, citation, confidence, and caveats visible |
| Data Lab | guest question/dashboard load, parameters synchronize, token renewal remounts once |
| Metabase outage | retryable fallback while navigation, story, source context, and table remain usable |
| Keyboard/a11y | skip link, landmarks, visible focus, dialog focus trap/return, table controls, axe scan |
| Responsive | narrow mobile, tablet, desktop screenshots; no overflow or map/embed layout shift |

Use deterministic API fixtures for visual tests and one pinned-image integration
suite for the actual Metabase custom elements. Tile requests should be mocked or
allowed explicitly; a tile-provider outage must not make browser tests flaky.

## Permission smoke test

`make smoke` proves both sides of the Metabase database boundary:

- `metabase_reader` can query `analytics.volcanoes`;
- the same login is denied `core.volcano`;
- an unknown guest resource returns 404;
- website, API, source status, and Metabase health are reachable.

Run it after deployment as well as locally. Do not weaken the expected denial
to make the smoke test pass.

## Clean-checkout release gate

On a disposable runner/VM with no named volumes:

```sh
git clone REPOSITORY_URL restless-pacific-smoke
cd restless-pacific-smoke
make dev
make smoke
make test-full-stack
```

The only permitted first-run inputs are Docker, Compose, Make, network access
for image/dependency pulls, and values documented in `.env.example`. Any manual
Metabase setup step is a release blocker.

Before recording the portfolio demo, also verify the public sourcebook matches
the live `/sources/status` payload, the browser bundle does not contain the
embedding secret, every photograph is `verified` in the credits manifest, and
the scientific disclaimer is reachable from all primary routes.
