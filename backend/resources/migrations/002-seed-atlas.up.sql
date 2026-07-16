INSERT INTO ops.source_dataset
  (source_key, display_name, authority, source_url, license_name, license_url,
   refresh_cadence, current_version, current_published_at,
   last_successful_run_at, expected_record_count, expected_region_count,
   membership_review_status, metadata)
VALUES
  ('gvp', 'Global Volcanism Program', 'Smithsonian Institution',
   'https://volcano.si.edu/database/webservices.cfm',
   'Smithsonian Terms of Use', 'https://www.si.edu/termsofuse', 'weekly',
   '5.3.6', '2026-05-26T00:00:00Z', now(), 688, 41, 'approved',
   '{"scope":"Smithsonian Pacific Ring of Fire","fixture":"pinned-prof-5.3.6","educationalUse":true}'::jsonb),
  ('usgs-earthquakes', 'USGS Earthquake Catalog', 'U.S. Geological Survey',
   'https://earthquake.usgs.gov/fdsnws/event/1/', 'Public domain',
   'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
   'five_minutes', 'seed-2026-07-15', now(), now(), NULL, NULL,
   'not_applicable', '{"liveThreshold":2.5,"historicalThreshold":5,"historicalSince":1960}'::jsonb),
  ('usgs-plates', 'USGS Plate Boundaries', 'U.S. Geological Survey',
   'https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/1',
   'Public domain',
   'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
   'monthly', 'seed-2026-07-15', now(), now(), NULL, NULL,
   'not_applicable', '{}'::jsonb),
  ('noaa-tsunami', 'Global Historical Tsunami Database',
   'NOAA National Centers for Environmental Information',
   'https://www.ngdc.noaa.gov/hazel/view/hazards/tsunami/event-data',
   'NOAA data access terms', 'https://www.noaa.gov/disclaimer', 'monthly',
   'seed-2026-07-15', now(), now(), NULL, NULL, 'not_applicable',
   '{"warning":"Historical completeness and impact reporting vary by era and location."}'::jsonb)
ON CONFLICT (source_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    source_url = EXCLUDED.source_url,
    current_version = EXCLUDED.current_version,
    expected_record_count = EXCLUDED.expected_record_count,
    expected_region_count = EXCLUDED.expected_region_count,
    membership_review_status = EXCLUDED.membership_review_status,
    metadata = EXCLUDED.metadata,
    updated_at = now();
--;;

INSERT INTO core.volcanic_region
  (region_number, name, slug, prof_region, story_order, source_dataset_id, source_version)
VALUES
  (1, 'Austral Andean Volcanic Arc', 'austral-andean-volcanic-arc', true, NULL, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (2, 'Southern Andean Volcanic Arc', 'southern-andean-volcanic-arc', true, 6, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (3, 'Central Andean Volcanic Arc', 'central-andean-volcanic-arc', true, 6, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (4, 'Northern Andean Volcanic Arc', 'northern-andean-volcanic-arc', true, 6, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (5, 'Central America Volcanic Arc', 'central-america-volcanic-arc', true, 5, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (6, 'Chiapanecan Volcanic Arc', 'chiapanecan-volcanic-arc', true, 5, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (7, 'Trans-Mexican Volcanic Arc', 'trans-mexican-volcanic-arc', true, 5, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (8, 'Gulf of California Rift Volcanic Province', 'gulf-of-california-rift-volcanic-province', true, NULL, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (9, 'California Coast Ranges Volcano Group', 'california-coast-ranges-volcano-group', true, NULL, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (10, 'High Cascades Volcanic Arc', 'high-cascades-volcanic-arc', true, 4, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (11, 'Garibaldi Volcanic Arc', 'garibaldi-volcanic-arc', true, 4, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (12, 'Queen Charlotte Volcano Group', 'queen-charlotte-volcano-group', true, 4, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (13, 'Northern Cordilleran Volcanic Province', 'northern-cordilleran-volcanic-province', true, 4, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (14, 'Wrangell Volcanic Arc', 'wrangell-volcanic-arc', true, 4, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (15, 'Alaska Peninsula Volcanic Arc', 'alaska-peninsula-volcanic-arc', true, 4, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (16, 'Aleutian Ridge Volcanic Arc', 'aleutian-ridge-volcanic-arc', true, 4, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (17, 'Central Kamchatka Volcanic Arc', 'central-kamchatka-volcanic-arc', true, 3, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (18, 'Eastern Kamchatka Volcanic Arc', 'eastern-kamchatka-volcanic-arc', true, 3, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (19, 'Kuril Volcanic Arc', 'kuril-volcanic-arc', true, 3, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (20, 'Northeast Japan Volcanic Arc', 'northeast-japan-volcanic-arc', true, 3, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (21, 'Izu Volcanic Arc', 'izu-volcanic-arc', true, 3, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (22, 'Nankai Volcanic Arc', 'nankai-volcanic-arc', true, 3, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (23, 'Ryukyu Volcanic Arc', 'ryukyu-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (24, 'Luzon Volcanic Arc', 'luzon-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (25, 'Eastern Philippine Volcanic Arc', 'eastern-philippine-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (26, 'Negros-Sulu Volcanic Arc', 'negros-sulu-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (27, 'Mindanao Volcanic Province', 'mindanao-volcanic-province', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (28, 'Sangihe Volcanic Arc', 'sangihe-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (29, 'Halmahera Volcanic Arc', 'halmahera-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (30, 'Bismarck Volcanic Arc', 'bismarck-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (31, 'Bougainville Volcanic Arc', 'bougainville-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (32, 'Solomon Volcanic Province', 'solomon-volcanic-province', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (33, 'Vanuatu Volcanic Arc', 'vanuatu-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (34, 'Fiji Volcanic Arc', 'fiji-volcanic-arc', true, 2, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (35, 'Northeast Lau Basin Volcano Group', 'northeast-lau-basin-volcano-group', true, 1, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (36, 'Tofua Volcanic Arc', 'tofua-volcanic-arc', true, 1, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (37, 'Northern Kermadec Volcanic Arc', 'northern-kermadec-volcanic-arc', true, 1, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (38, 'Middle Kermadec Volcanic Arc', 'middle-kermadec-volcanic-arc', true, 1, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (39, 'Southern Kermadec Volcanic Arc', 'southern-kermadec-volcanic-arc', true, 1, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (40, 'Taupo Volcanic Arc', 'taupo-volcanic-arc', true, 1, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (41, 'Western North Island Volcanic Province', 'western-north-island-volcanic-province', true, 1, (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    prof_region = EXCLUDED.prof_region,
    story_order = EXCLUDED.story_order,
    source_version = EXCLUDED.source_version,
    updated_at = now();
--;;

INSERT INTO core.volcano
  (volcano_number, name, slug, country, subregion, volcanic_region_id,
   primary_volcano_type, tectonic_setting, evidence_category, elevation_m,
   last_eruption_year, description, geom, source_dataset_id, source_version)
VALUES
  (241070, 'Taupō', 'taupo', 'New Zealand', 'North Island',
   (SELECT id FROM core.volcanic_region WHERE slug='taupo-volcanic-arc'),
   'Caldera', 'Subduction zone / continental crust', 'Eruption Dated', 760, 260,
   'A large rhyolitic caldera beneath Lake Taupō. Dates before 1 CE remain signed years rather than fabricated calendar dates.',
   ST_SetSRID(ST_MakePoint(175.57, -38.82), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (243040, 'Hunga Tonga–Hunga Haʻapai', 'hunga-tonga-hunga-haapai', 'Tonga', 'Tonga Islands',
   (SELECT id FROM core.volcanic_region WHERE slug='tofua-volcanic-arc'),
   'Caldera', 'Subduction zone / oceanic crust', 'Eruption Observed', 114, 2022,
   'A mostly submarine volcano whose January 2022 eruption generated a trans-oceanic tsunami and atmospheric pressure wave.',
   ST_SetSRID(ST_MakePoint(-175.382, -20.536), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (273030, 'Mayon', 'mayon', 'Philippines', 'Luzon',
   (SELECT id FROM core.volcanic_region WHERE slug='luzon-volcanic-arc'),
   'Stratovolcano', 'Subduction zone / continental crust', 'Eruption Observed', 2462, 2026,
   'An active stratovolcano known for its symmetrical cone. Exact activity dates should be checked against the current GVP record.',
   ST_SetSRID(ST_MakePoint(123.685, 13.257), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (283030, 'Fuji', 'fuji', 'Japan', 'Honshu',
   (SELECT id FROM core.volcanic_region WHERE slug='izu-volcanic-arc'),
   'Stratovolcano', 'Subduction zone / continental crust', 'Eruption Observed', 3776, 1708,
   'Japan’s highest mountain, positioned near a complex plate junction.',
   ST_SetSRID(ST_MakePoint(138.727, 35.361), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (300260, 'Klyuchevskoy', 'klyuchevskoy', 'Russia', 'Kamchatka Peninsula',
   (SELECT id FROM core.volcanic_region WHERE slug='central-kamchatka-volcanic-arc'),
   'Stratovolcano', 'Subduction zone / continental crust', 'Eruption Observed', 4754, 2025,
   'A frequently active, high stratovolcano on the Kamchatka arc.',
   ST_SetSRID(ST_MakePoint(160.642, 56.056), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (321050, 'Mount St. Helens', 'mount-st-helens', 'United States', 'Washington',
   (SELECT id FROM core.volcanic_region WHERE slug='high-cascades-volcanic-arc'),
   'Stratovolcano', 'Subduction zone / continental crust', 'Eruption Observed', 2549, 2008,
   'The 18 May 1980 eruption and lateral blast transformed modern volcano monitoring in the Cascades.',
   ST_SetSRID(ST_MakePoint(-122.18, 46.20), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (341090, 'Popocatépetl', 'popocatepetl', 'Mexico', 'Central Mexico',
   (SELECT id FROM core.volcanic_region WHERE slug='trans-mexican-volcanic-arc'),
   'Stratovolcano', 'Subduction zone / continental crust', 'Eruption Observed', 5393, 2026,
   'A persistently active volcano near major population centres. This atlas is not an alerting product.',
   ST_SetSRID(ST_MakePoint(-98.622, 19.023), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (342090, 'Fuego', 'fuego', 'Guatemala', 'Guatemala',
   (SELECT id FROM core.volcanic_region WHERE slug='central-america-volcanic-arc'),
   'Stratovolcano', 'Subduction zone / continental crust', 'Eruption Observed', 3799, 2026,
   'One of Central America’s most active stratovolcanoes.',
   ST_SetSRID(ST_MakePoint(-90.88, 14.473), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (351020, 'Nevado del Ruiz', 'nevado-del-ruiz', 'Colombia', 'Colombia',
   (SELECT id FROM core.volcanic_region WHERE slug='northern-andean-volcanic-arc'),
   'Stratovolcano', 'Subduction zone / continental crust', 'Eruption Observed', 5279, 2026,
   'Its 1985 eruption produced lahars that caused the Armero disaster.',
   ST_SetSRID(ST_MakePoint(-75.324, 4.892), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (357120, 'Villarrica', 'villarrica', 'Chile', 'Central Chile',
   (SELECT id FROM core.volcanic_region WHERE slug='southern-andean-volcanic-arc'),
   'Stratovolcano', 'Subduction zone / continental crust', 'Eruption Observed', 2847, 2025,
   'An active, glacier-clad stratovolcano in the southern Andes.',
   ST_SetSRID(ST_MakePoint(-71.93, -39.42), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6')
ON CONFLICT (volcano_number) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    country = EXCLUDED.country,
    volcanic_region_id = EXCLUDED.volcanic_region_id,
    primary_volcano_type = EXCLUDED.primary_volcano_type,
    elevation_m = EXCLUDED.elevation_m,
    last_eruption_year = EXCLUDED.last_eruption_year,
    description = EXCLUDED.description,
    geom = EXCLUDED.geom,
    source_version = EXCLUDED.source_version,
    updated_at = now();
--;;

INSERT INTO core.ring_membership
  (volcano_number, definition_key, dataset_version, included, inclusion_reason,
   confidence, reviewed_at, source_dataset_id)
SELECT v.volcano_number, 'smithsonian-prof', '5.3.6', true,
       'Included in the Smithsonian Pacific Ring of Fire regional definition.',
       'authoritative', now(), s.id
FROM core.volcano v CROSS JOIN ops.source_dataset s
WHERE s.source_key='gvp'
ON CONFLICT (volcano_number, definition_key, dataset_version) DO UPDATE
SET included=EXCLUDED.included,
    inclusion_reason=EXCLUDED.inclusion_reason,
    confidence=EXCLUDED.confidence,
    reviewed_at=EXCLUDED.reviewed_at;
--;;

INSERT INTO core.eruption
  (eruption_number, volcano_number, start_year, start_month, start_day,
   date_precision, vei, certainty, source_dataset_id, source_version)
VALUES
  (2410700260, 241070, 260, NULL, NULL, 'year', 7, 'Confirmed', (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (2430402022, 243040, 2022, 1, 15, 'day', 5.7, 'Confirmed', (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (2830301707, 283030, 1707, 12, 16, 'day', 5, 'Confirmed', (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (3210501980, 321050, 1980, 5, 18, 'day', 5, 'Confirmed', (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6'),
  (3510201985, 351020, 1985, 11, 13, 'day', 3, 'Confirmed', (SELECT id FROM ops.source_dataset WHERE source_key='gvp'), '5.3.6')
ON CONFLICT (eruption_number) DO NOTHING;
--;;

INSERT INTO core.earthquake
  (event_id, occurred_at, updated_at_source, magnitude, magnitude_type, depth_km,
   place, significance, tsunami_flag, status, detail_url, geom,
   source_dataset_id, source_version)
VALUES
  ('seed-nz-001', '2026-07-14T19:21:00Z', '2026-07-14T19:25:00Z', 5.2, 'mww', 32.4,
   'Kermadec Islands region', 416, false, 'reviewed', 'https://earthquake.usgs.gov/',
   ST_SetSRID(ST_MakePoint(178.4, -30.2, 32.4), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='usgs-earthquakes'), 'seed-2026-07-15'),
  ('seed-jp-001', '2026-07-14T08:12:00Z', '2026-07-14T08:18:00Z', 5.8, 'mww', 49.0,
   'off the east coast of Honshu, Japan', 518, false, 'reviewed', 'https://earthquake.usgs.gov/',
   ST_SetSRID(ST_MakePoint(143.1, 38.4, 49.0), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='usgs-earthquakes'), 'seed-2026-07-15'),
  ('seed-andes-001', '2026-07-13T22:02:00Z', '2026-07-13T22:10:00Z', 6.1, 'mww', 112.0,
   'northern Chile', 572, false, 'reviewed', 'https://earthquake.usgs.gov/',
   ST_SetSRID(ST_MakePoint(-69.2, -23.5, 112.0), 4326),
   (SELECT id FROM ops.source_dataset WHERE source_key='usgs-earthquakes'), 'seed-2026-07-15')
ON CONFLICT (event_id) DO UPDATE
SET updated_at_source=EXCLUDED.updated_at_source,
    magnitude=EXCLUDED.magnitude,
    depth_km=EXCLUDED.depth_km,
    status=EXCLUDED.status,
    geom=EXCLUDED.geom,
    is_deleted=false,
    ingested_at=now();
--;;

INSERT INTO core.plate_boundary
  (boundary_id, name, boundary_type, description, geom, source_dataset_id, source_version)
VALUES
  ('seed-pacific-west', 'Western Pacific subduction arcs', 'convergent',
   'Generalized sample geometry for the local demonstration. Production ingestion replaces it with USGS linework.',
   ST_Multi(ST_GeomFromText('LINESTRING(178 -38, -175 -22, 145 35, 160 56, 178 52)', 4326)),
   (SELECT id FROM ops.source_dataset WHERE source_key='usgs-plates'), 'seed-2026-07-15'),
  ('seed-americas', 'Americas Pacific margin', 'convergent',
   'Generalized sample geometry for the local demonstration. Not a navigational or hazard product.',
   ST_Multi(ST_GeomFromText('LINESTRING(-150 55, -125 43, -103 20, -90 14, -75 4, -72 -40)', 4326)),
   (SELECT id FROM ops.source_dataset WHERE source_key='usgs-plates'), 'seed-2026-07-15')
ON CONFLICT (boundary_id) DO UPDATE
SET name=EXCLUDED.name,
    boundary_type=EXCLUDED.boundary_type,
    geom=EXCLUDED.geom,
    source_version=EXCLUDED.source_version,
    updated_at=now();
--;;

INSERT INTO core.tsunami_event
  (event_id, event_year, event_month, event_day, date_precision, cause, country,
   location_name, source_magnitude, maximum_water_height_m, deaths, validity,
   source_confidence, notes, geom, source_dataset_id, source_version)
VALUES
  ('noaa-seed-1960-valdivia', 1960, 5, 22, 'day', 'Earthquake', 'Chile', 'Valdivia', 9.5, 25.0, 2231,
   'Definite tsunami', 'authoritative', 'Fatality and run-up estimates vary among sources.',
   ST_SetSRID(ST_MakePoint(-73.5, -39.5), 4326), (SELECT id FROM ops.source_dataset WHERE source_key='noaa-tsunami'), 'seed-2026-07-15'),
  ('noaa-seed-2011-tohoku', 2011, 3, 11, 'day', 'Earthquake', 'Japan', 'Tōhoku', 9.1, 40.5, 18428,
   'Definite tsunami', 'authoritative', 'Impact totals vary by accounting date and definition.',
   ST_SetSRID(ST_MakePoint(142.369, 38.322), 4326), (SELECT id FROM ops.source_dataset WHERE source_key='noaa-tsunami'), 'seed-2026-07-15'),
  ('noaa-seed-2022-hunga', 2022, 1, 15, 'day', 'Volcano', 'Tonga', 'Hunga Tonga–Hunga Haʻapai', NULL, 22.0, 6,
   'Definite tsunami', 'authoritative', 'Maximum water-height values are observation-dependent.',
   ST_SetSRID(ST_MakePoint(-175.382, -20.536), 4326), (SELECT id FROM ops.source_dataset WHERE source_key='noaa-tsunami'), 'seed-2026-07-15'),
  ('noaa-seed-1883-krakatau', 1883, 8, 27, 'day', 'Volcano', 'Indonesia', 'Krakatau', NULL, 41.0, 36000,
   'Definite tsunami', 'historical', 'Historical death totals and wave heights are estimates.',
   ST_SetSRID(ST_MakePoint(105.423, -6.102), 4326), (SELECT id FROM ops.source_dataset WHERE source_key='noaa-tsunami'), 'seed-2026-07-15')
ON CONFLICT (event_id) DO UPDATE
SET source_version=EXCLUDED.source_version,
    source_confidence=EXCLUDED.source_confidence,
    notes=EXCLUDED.notes,
    updated_at=now();
--;;

INSERT INTO core.story_region
  (slug, title, dek, chapter_order, camera_center_lon, camera_center_lat, camera_zoom, editorial_notes)
VALUES
  ('new-zealand-kermadec-tonga', 'Where the journey begins', 'New Zealand to Tonga reveals a boundary bending around the southwest Pacific.', 1, 177.0, -29.0, 3.1, 'Beginning here is an editorial convention, not a geologic start.'),
  ('southwest-pacific-philippines', 'Arcs within arcs', 'Short trenches, microplates, and island arcs resist a single-ring explanation.', 2, 132.0, 8.0, 2.7, 'Indonesia is treated separately as a definition case study.'),
  ('japan-kurils-kamchatka', 'The northwest turn', 'Deep earthquakes descend beneath densely monitored volcanic arcs.', 3, 150.0, 45.0, 2.9, 'Proximity is context, never causal attribution.'),
  ('aleutians-alaska-cascadia', 'Across the northern rim', 'The arc sweeps east through Alaska before meeting Cascadia.', 4, -153.0, 52.0, 2.5, 'The map crosses the antimeridian. Coordinates remain RFC 7946 longitude/latitude.'),
  ('mexico-central-america', 'A crowded volcanic front', 'Subduction builds a chain of active volcanoes near major communities.', 5, -96.0, 16.0, 3.0, 'No alert or forecast claims are made.'),
  ('andes', 'The long continental margin', 'The Andes close the guided route along the Nazca–South America boundary.', 6, -72.0, -22.0, 2.5, 'Clockwise closure is narrative, not a physical endpoint.')
ON CONFLICT (slug) DO UPDATE
SET title=EXCLUDED.title,
    dek=EXCLUDED.dek,
    chapter_order=EXCLUDED.chapter_order,
    camera_center_lon=EXCLUDED.camera_center_lon,
    camera_center_lat=EXCLUDED.camera_center_lat,
    camera_zoom=EXCLUDED.camera_zoom,
    editorial_notes=EXCLUDED.editorial_notes,
    updated_at=now();
