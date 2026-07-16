# Five-minute narrated demo

Target duration: 4:45–5:15. Record at 1440p, then export a captioned 1080p
version. Keep the cursor still while speaking and show source/freshness labels
at least twice.

The committed 12-second preview is `web/public/restless-pacific-demo.gif`.
With the local stack running, regenerate its five source frames with
`cd web && npm run capture:demo`; the sourcebook automatically substitutes the
static `restless-pacific-demo-poster.webp` for reduced-motion visitors.

## 0:00–0:35 — The premise

Open the home page on the full Pacific view.

> This is Restless Pacific, an interactive atlas built around one corrective
> idea: the Ring of Fire is not really a ring. It has no scientific start or
> end. I begin in New Zealand and travel clockwise because a story needs an
> order—not because geology gives us one.

Trigger the boundary draw, then point out that volcano markers resolve as an
independent evidence layer. Briefly show the source/version label.

## 0:35–1:25 — Guided journey

Advance with the visible chapter control rather than scrolling immediately.
Show one subduction explanation, one transform/divergent distinction, and the
camera change between New Zealand–Tonga and Japan–Kamchatka.

> Each chapter coordinates a map position, evidence, and narrative, but those
> chapters are editorial records. They do not redefine the underlying
> Smithsonian membership data.

Open the Indonesia definition case study.

## 1:25–2:15 — Atlas exploration

Open `/atlas`. Toggle boundaries, volcanoes, recent earthquakes, and tsunami
sources. Search for “Fuji,” select it, and show the detail sheet with source,
freshness, eruption precision, nearest boundary, and deep link.

> Distance to a boundary is useful context, so PostGIS calculates it. The UI
> deliberately labels that as proximity, never proof of cause.

Use the keyboard to focus the result list and open the same volcano. Briefly
show the table equivalent below the map.

## 2:15–2:55 — Historical uncertainty

Open the Hunga Tonga profile and then `/history`. Point to a partial/qualified
fact and its citation.

> Historical records are not forced into fake precision. Year, month, and day
> remain separate nullable fields, missing VEI is not zero, and observations
> carry confidence and caveats.

## 2:55–3:40 — Metabase Data Lab

Open `/data`, change a controlled region filter, and show two saved questions
plus the composite dashboard.

> These are Metabase OSS Modular Guest embeds. A Clojure endpoint signs a
> short-lived JWT only for resources written to an allow-list by the bootstrap
> task. The browser never receives the embedding secret. Metabase connects to
> one analytics schema with SELECT-only permissions.

Mention that trends default to 1960 onward because earlier reporting is less
complete.

## 3:40–4:30 — Architecture and reproducibility

Open `/sourcebook`, then show the architecture diagram and source status table.

> GVP, USGS, and NOAA feeds enter a staging transaction. Counts, coordinates,
> IDs, and versions are validated before an atomic upsert. If a refresh is bad,
> the last good dataset stays active. Every claim can surface its dataset
> version, freshness, and uncertainty.

Show the terminal running `make dev` or a prepared, readable recording of it.

## 4:30–5:00 — Accessibility and close

Enable reduced motion or the browser preference, use manual chapter controls,
and resize to mobile.

> The map is not the only interface: keyboard controls and text/table
> equivalents preserve the evidence, and reduced motion swaps camera animation
> for static states. This is an educational project, not an alerting system.

End on the project title and repository URL.

## Short GIF shot list

Create a silent 12–15 second loop:

1. boundary route resolves over the Pacific (3 s);
2. manual chapter transition to Japan–Kamchatka (3 s);
3. atlas search for Fuji and detail sheet expansion (4 s);
4. Metabase controlled filter update (3 s);
5. sourcebook version/freshness row and title lockup (2 s).

Optimize below 8 MB, avoid rapid camera motion, and provide the same information
in nearby alt text/caption. The GIF is portfolio collateral, never the only
instruction for using the product.
