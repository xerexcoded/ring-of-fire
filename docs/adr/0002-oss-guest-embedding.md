# ADR 0002: Use pinned Metabase OSS Modular Guest embeds

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Restless Pacific maintainers

## Context

The portfolio should demonstrate a credible Metabase integration while
remaining reproducible with open-source software. Metabase offers static and
guest embeds in OSS and richer React SDK/SSO behavior in paid editions. The
cinematic atlas also needs layered geospatial styling beyond Metabase’s map
visualization scope.

Metabase’s internal API is not versioned. Depending on an unpinned image would
make provisioning behavior unpredictable and difficult to demonstrate.

## Decision

- Pin `metabase/metabase:v0.62.4.3`.
- Use Modular Guest embedding for published questions and dashboards.
- Keep the custom Pacific map and detail interactions in Next.js/MapLibre.
- Load Metabase `embed.js` only in the browser and synchronize controlled
  filters with the component `parameters` contract and change events.
- Sign JWTs in Clojure with a maximum 60-minute lifetime. Accept the
  official-style `{ entityType, entityId, customContext? }` request but issue a
  token only when the resource is enabled in `metabase_resource`.
- Use Metabase v62's required 256-bit embedding-key representation: exactly 64
  hexadecimal characters, generated independently for production.
- Provision the read-only database, collection, questions, dashboard, filters,
  and guest publication through an idempotent Clojure task tested against the
  pinned image.
- Accept OSS constraints: no drill-through, query builder, advanced theming,
  row/column security, hidden download controls, or removal of the “Powered by
  Metabase” treatment.

## Consequences

Anyone can run the full example without a commercial license, and the tutorial
shows the exact trust boundary around guest embedding. Metabase charts use the
supported dark preset but cannot perfectly match the editorial interface. The
Data Lab must design controlled filters up front rather than rely on
drill-through. A Metabase upgrade is a deliberate change with a bootstrap
integration test, not a tag bump to `latest`.

The pinned v0.62.4.3 build uses inline style attributes for dashboard-grid
transforms while shipping a CSP that blocks them. Caddy therefore adds
`unsafe-inline` to Metabase's `style-src` and `style-src-attr` directives only,
replacing the ineffective style nonce; the separate nonce-based `script-src`
policy remains intact. This compatibility
exception is covered by the full-stack browser check and must be reviewed when
the Metabase pin changes.

## Alternatives considered

- The React SDK was deferred because it requires a paid edition for the desired
  authentication and customization path.
- Static iframe embedding was rejected because Modular Guest components provide
  better filter coordination and a clearer modern integration story.
- Rebuilding every chart in the frontend was rejected because it would hide the
  Metabase-specific developer advocacy value.

## References

- [Metabase embedding overview](https://www.metabase.com/docs/latest/embedding/introduction)
- [Modular Guest embedding](https://www.metabase.com/docs/latest/embedding/guest-embedding)
- [Metabase API warning](https://www.metabase.com/docs/latest/api)
- [Metabase map visualization](https://www.metabase.com/docs/latest/questions/visualizations/map)
