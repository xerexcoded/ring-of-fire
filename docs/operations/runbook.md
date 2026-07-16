# Operations runbook

This runbook targets one amd64 VPS with at least 8 GB RAM and the production
Compose topology. Commands run from the repository root unless noted.

## Initial host preparation

1. Create a non-root deployment user with Docker access and SSH keys only.
2. Permit inbound TCP 22, 80, and 443 plus UDP 443; do not expose database or
   application diagnostic ports beyond loopback.
3. Install Docker Engine, Compose v2, Git, and an external uptime agent if used.
4. Clone into `/srv/restless-pacific` (or the protected `DEPLOY_PATH`).
5. Copy `.env.example` to `.env`, set production origins, and replace every
   committed credential and secret with independently generated values.
6. Set `BACKUP_AGE_RECIPIENT` to a public age recipient. Store its private key
   offline and in the controlled restore location, never on this VPS.
7. Point `www`, `api`, and `analytics` DNS records to the host. Use bare HTTPS
   site addresses in `WEB_ORIGIN`, `API_ORIGIN`, and `ANALYTICS_ORIGIN`; Caddy
   will manage ACME certificates.
8. Verify the Compose `scheduler` is running. It polls USGS every five minutes,
   reconciles revisions/deletions daily, refreshes GVP weekly, and refreshes
   plate/NOAA sources monthly. Each job catches upstream failures and preserves
   last-good data. `infra/cron/restless-pacific.example` is an alternative for
   hosts that deliberately disable the scheduler; never enable both routinely.

The production GitHub environment must require approval and define:

- secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`, and a
  separately verified `DEPLOY_KNOWN_HOSTS` entry for the VPS;
- variables: `PRODUCTION_URL`, `NEXT_PUBLIC_API_BASE_URL` (including `/api/v1`),
  and `NEXT_PUBLIC_METABASE_URL`.

Log the VPS into GHCR with a package-read token before its first deployment.

When serving the app below a URL prefix, set `NEXT_PUBLIC_BASE_PATH` and
`NEXT_PUBLIC_SITE_URL` before building the web image. `basePath` is compiled
into the Next.js client bundles, so changing the prefix requires a rebuild.
Keep the prefix on requests proxied to Next.js; strip only the application
prefix before proxying the API and the analytics prefix before proxying
Metabase.

Generate the production guest-embedding key in the exact format required by
Metabase v62—64 hexadecimal characters representing 256 bits—and store it only
as `METABASE_EMBEDDING_SECRET` on the server:

```sh
openssl rand -hex 32
```

## Deploy and rollback

After CI succeeds on `main`, the publish workflow builds amd64 images tagged
`sha-<full commit>`. After protected-environment approval, deployment checks out
that same commit, validates Compose, pulls pinned images, waits for health,
seeds/reconciles data, and provisions Metabase. Manual dispatch is reserved for
an already-verified revision or operational rollback.

To roll back, dispatch the workflow from a known-good commit or run on the host:

```sh
export BACKEND_IMAGE=ghcr.io/OWNER/restless-pacific-backend:sha-GOOD_SHA
export WEB_IMAGE=ghcr.io/OWNER/restless-pacific-web:sha-GOOD_SHA
docker compose up -d --no-build --wait backend web caddy
```

Database migrations must be backwards-compatible with the immediately previous
image. If a release requires a destructive migration, take and verify an
encrypted backup and write a release-specific recovery plan before approval.

## Routine health checks

```sh
docker compose ps
curl --fail https://api.example.com/healthz
curl --fail https://www.example.com/
curl --fail https://analytics.example.com/api/health
docker compose logs --since=30m backend scheduler metabase caddy
```

Configure an external checker for all three HTTPS origins. The API and website
should alert after two consecutive failures; source freshness should alert on a
dataset-specific window rather than treating weekly GVP data as five-minute
data. Monitor disk, inode, memory/swap, certificate expiry, backup success, and
Postgres connection saturation.

The public `/api/v1/sources/status` response is the operator and user-facing
truth for active version, last success, cadence, and review state.

Run the historical USGS M5+ backfill once after initial deployment with
`make backfill-history`. It uses bounded yearly FDSN windows from 1960 to avoid
the service's maximum-result limit. Keep `USGS_HISTORY_ENABLED=false` during
normal scheduler restarts so an ordinary deploy does not repeat the full
backfill. Configure `NOAA_TSV_URL` only after verifying a stable NOAA export;
without it, the monthly NOAA job reports a skip and retains the seeded version.

## Encrypted backups

The `ops` profile runs `pg_dump --format=custom` for `ring_data` and
`metabase_app`, packages a manifest, and encrypts the stream to an age public
recipient. Default interval is 24 hours and local retention is 14 days.

```sh
make backup       # start daily loop
make backup-once  # create one now
docker compose --profile ops logs backup
```

Replicate `.data/backups/*.age` to a separate account/provider. Local encrypted
copies protect content at rest but do not protect against loss of the VPS.
Alert if `.last-success` is older than 48 hours. Never upload the age private
key alongside backups.

### Restore drill

Perform a quarterly drill on an isolated host or isolated Postgres cluster:

```sh
mkdir -p /tmp/restless-restore
age --decrypt -i /secure/path/backup-age-key.txt \
  .data/backups/restless-pacific-TIMESTAMP.tar.gz.age \
  | tar -xz -C /tmp/restless-restore
pg_restore --list /tmp/restless-restore/ring_data.dump | head
pg_restore --list /tmp/restless-restore/metabase_app.dump | head
```

For a real restore, stop writers first:

```sh
docker compose stop web backend metabase
docker compose exec -T postgres pg_restore \
  --clean --if-exists --no-owner --no-acl \
  --username postgres --dbname ring_data \
  < /tmp/restless-restore/ring_data.dump
docker compose exec -T postgres pg_restore \
  --clean --if-exists --no-owner --no-acl \
  --username postgres --dbname metabase_app \
  < /tmp/restless-restore/metabase_app.dump
docker compose up -d --wait backend metabase web caddy
docker compose --profile tools run --rm metabase-bootstrap
```

Reapply/verify `metabase_reader` analytics grants after a no-ACL restore and run
API, dashboard, token, and read-only permission smoke tests. Record recovery
time and recovered timestamps. Delete plaintext dumps securely after the drill.

## Incident playbooks

### Metabase unavailable

Confirm `/api/health`, inspect Metabase logs, Postgres health, and memory. Do not
restart the entire stack if the Journey and Atlas are healthy. The frontend
should show its Data Lab fallback. Restart only Metabase after collecting logs:

```sh
docker compose logs --since=1h metabase postgres > metabase-incident.log
docker compose restart metabase
```

The pinned v0.62.4.3 dashboard grid requires the style-only CSP compatibility
rewrite documented in ADR 0002. If cards overlap after an upgrade, do not
broaden `script-src`; run `make test-full-stack`, inspect the upstream CSP, and
either update or remove the narrowly scoped Caddy rewrite based on the new
Metabase behavior.

### Source refresh failed

Do not manually activate staging rows. Inspect the latest `ops.ingestion_run`
and rejection summary, verify the upstream status and content type, then rerun
only the affected source. The last good version should remain active. A GVP
count/version mismatch requires membership review rather than bypassing the
guard.

### Live earthquakes stale

Verify the USGS endpoint and scheduler/advisory-lock state. Keep serving the
last reconciliation with its timestamp. Never relabel stale records as current,
and never turn this site into a substitute for an official alert feed.

### Disk pressure

Check Docker layers, Postgres volume, Caddy data, and backup replication before
deleting anything. Prune unreferenced images older than seven days. Do not
delete Postgres WAL/data files or the only backup copy manually.

## Secret rotation

- Rotate database passwords one role at a time with a temporary overlapping
  deployment, then update `.env` and restart only consumers of that role.
- Rotating `METABASE_EMBEDDING_SECRET` invalidates outstanding guest tokens;
  schedule it and verify automatic remount/renewal.
- Rotating `METABASE_ENCRYPTION_SECRET` requires Metabase’s documented key
  procedure; do not replace it blindly or encrypted connection details may be
  unreadable.
- Rotate deployment SSH and GHCR credentials through their providers and verify
  the protected environment approval remains enabled.

## Post-deploy smoke test

1. Journey loads and manual/reduced-motion chapters work.
2. Atlas searches a seeded volcano and toggles every layer.
3. Volcano deep link displays source and partial-date history.
4. Sourcebook versions match `/api/v1/sources/status`.
5. Data Lab loads one question and the dashboard; filters synchronize.
6. Unknown Metabase ID is rejected and the secret is absent from browser code.
7. `metabase_reader` can query `analytics.volcanoes` and is denied
   `core.volcano`.
8. One encrypted backup completes and can be listed with the offline key.
