# Embedding Metabase OSS in Next.js with a Clojure JWT service

This tutorial builds the same trust boundary used by Restless Pacific: Metabase
OSS renders published analytics, Next.js mounts browser-only guest components,
and a Clojure API signs short-lived tokens for an explicit resource allow-list.

It intentionally does not put the Metabase embedding secret in Next.js.

## 1. Pin Metabase and separate its two database roles

Run an exact Metabase version rather than `latest`:

```yaml
metabase:
  image: metabase/metabase:v0.62.4.3
  environment:
    MB_DB_TYPE: postgres
    MB_DB_HOST: postgres
    MB_DB_DBNAME: metabase_app
    MB_DB_USER: metabase_app
```

`metabase_app` owns only Metabase application state. Configure the analytical
connection inside Metabase with another login, `metabase_reader`, which receives
only `USAGE` and `SELECT` on an `analytics` schema:

```sql
REVOKE ALL ON SCHEMA core, ops FROM metabase_reader;
GRANT USAGE ON SCHEMA analytics TO metabase_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO metabase_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE ring_writer IN SCHEMA analytics
  GRANT SELECT ON TABLES TO metabase_reader;
```

This distinction matters: a visualization compromise should not become an
ingestion write path, and Metabase’s own tables should not appear in analysis.

## 2. Publish resources, then store an allow-list

Guest embedding makes a published question or dashboard accessible to anyone
holding a valid signed token. Do not sign arbitrary numeric IDs supplied by a
browser. Persist only the resources intentionally made public:

```sql
CREATE TABLE ops.metabase_resource (
  resource_key text UNIQUE NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('dashboard', 'question')),
  entity_id integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  allowed_parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (entity_type, entity_id)
);
```

Restless Pacific’s `clojure -M:bootstrap` task creates or reconciles the
Metabase collection, sixteen questions, four dashboards, native filters, and
guest publication. Because the Metabase API is unversioned, that task is tested
only against the pinned image and stores the resulting IDs in this table.

## 3. Sign a short-lived token in Clojure

The endpoint accepts the shape used by Metabase’s guest-token examples:

```json
{
  "entityType": "dashboard",
  "entityId": 12,
  "customContext": { "region": "andes" }
}
```

Before signing, the service checks:

1. the entity type is `dashboard` or `question`;
2. the numeric ID is enabled in `ops.metabase_resource`;
3. every custom context key appears in that resource’s allowed parameters;
4. the HTTP origin is on the deployment allow-list.

The essential Buddy JWT claims are:

```clojure
(let [now (.getEpochSecond (java.time.Instant/now))
      claims {:resource {(keyword entity-type) entity-id}
              :params validated-context
              :iat now
              :exp (+ now 3600)}]
  {:jwt (buddy.sign.jwt/sign claims embedding-secret {:alg :hs256})})
```

Use HS256 because that is the guest-embedding contract, keep lifetime at or
below 60 minutes, and return `Cache-Control: no-store`. Validate a secret length
and format on service startup: v62 requires exactly 64 hexadecimal characters
(generate production values with `openssl rand -hex 32`). The working implementation lives in
`backend/src/restless_pacific/security/guest_token.clj`.

## 4. Keep browser and server origins explicit

In development, the three public origins are separate:

```dotenv
WEB_ORIGIN=http://www.localhost
API_ORIGIN=http://api.localhost
ANALYTICS_ORIGIN=http://analytics.localhost
NEXT_PUBLIC_API_BASE_URL=http://api.localhost/api/v1
NEXT_PUBLIC_METABASE_URL=http://analytics.localhost
ALLOWED_ORIGINS=http://localhost,http://www.localhost
```

The browser may know Metabase’s public URL and the API URL. It must never know
`METABASE_EMBEDDING_SECRET`, a database password, or Metabase administrator
credentials. Search the final `.next` output for secret values in CI as a
defense-in-depth check.

## 5. Load `embed.js` in a client-only wrapper

Metabase defines custom HTML elements at runtime, so load its script only in a
Client Component. Reserve the final embed height to avoid layout shift. For a
multi-workspace explorer, defer the lifecycle until the section approaches the
viewport:

1. resolve `/metabase/resources/{resourceKey}` to an enabled dashboard ID;
2. fetch `/metabase/guest-token` with that numeric ID;
3. load `${metabaseUrl}/app/embed.js` once for the page;
4. mount `<metabase-dashboard>` with the JWT and native editable filters;
5. request a new token before expiry and remount the element.

A framework-neutral sketch:

```tsx
"use client";

const resource = await fetch(
  `${apiBase}/metabase/resources/${encodeURIComponent(resourceKey)}`,
  { cache: "no-store" },
).then((response) => response.json());

const token = await fetch(`${apiBase}/metabase/guest-token`, {
  method: "POST",
  cache: "no-store",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    entityType: resource.entityType,
    entityId: resource.entityId,
  }),
}).then((response) => response.json());

window.metabaseConfig = {
  isGuest: true,
  instanceUrl: "https://analytics.example.com",
  guestEmbedProviderUri: `${apiBase}/metabase/guest-token`,
  theme: { preset: "dark" },
};

const embed = document.createElement("metabase-dashboard");
embed.setAttribute("token", token.jwt);
host.replaceChildren(embed);
```

Use the exact attribute names supported by the pinned v62 component docs. Do
not render the custom element during SSR, and cancel in-flight token requests on
unmount.

## 6. Design for OSS constraints and outages

Guest embeds support questions, dashboards, signed access, and native editable
filters. OSS embeds can use Metabase's built-in light or dark preset, but they
do not provide drill-through, query building, granular custom theming,
row/column security, removal of downloads, or removal of the “Powered by
Metabase” treatment. Treat those as product constraints, not bugs to hide with
unsupported CSS.

The atlas remains a native MapLibre experience because it needs combined layers
and cinematic styling. If one Metabase dashboard is down, show a retry state in
that workspace; do not let an analytics outage blank the other workspaces or
the rest of the story.

## 7. Verify the integration

At minimum, automate these checks:

- unknown and disabled IDs return 404;
- disallowed parameter keys return 400;
- bad origins return 403;
- the JWT uses HS256, contains the exact resource, and expires within one hour;
- the secret never appears in browser assets;
- `metabase_reader` can `SELECT analytics.*` and cannot read `core` or `ops`;
- running bootstrap twice returns the same logical resources;
- dashboard filters update the embedded component;
- token renewal remounts without leaving duplicate custom elements;
- a Metabase outage leaves sourced fallback content.

## References

- [Metabase embedding introduction](https://www.metabase.com/docs/latest/embedding/introduction)
- [Modular Guest embedding](https://www.metabase.com/docs/latest/embedding/guest-embedding)
- [Embedding components](https://www.metabase.com/docs/latest/embedding/components)
- [Metabase API](https://www.metabase.com/docs/latest/api)
