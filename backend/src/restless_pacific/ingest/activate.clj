(ns restless-pacific.ingest.activate
  (:require [cheshire.core :as json]
            [next.jdbc :as jdbc]
            [restless-pacific.ingest.parse :as parse]))

(defn- execute! [tx statement]
  (jdbc/execute-one! tx statement))

(defn gvp-volcanoes! [tx source-id version records]
  (doseq [region-name (->> records (map #(or (:subregion %) (:region %))) (remove nil?) distinct)]
    (execute!
     tx
     ["INSERT INTO core.volcanic_region
         (name, slug, prof_region, source_dataset_id, source_version)
       VALUES (?, ?, false, ?, ?)
       ON CONFLICT (slug) DO UPDATE
       SET name=EXCLUDED.name, source_dataset_id=EXCLUDED.source_dataset_id,
           source_version=EXCLUDED.source_version, updated_at=now()"
      region-name (parse/slug region-name) source-id version]))
  (doseq [record records]
    (execute!
     tx
     ["INSERT INTO core.volcano
         (volcano_number, name, slug, country, subregion, volcanic_region_id,
          primary_volcano_type, tectonic_setting, evidence_category, elevation_m,
          last_eruption_year, description, geom, source_dataset_id, source_version,
          source_updated_at)
       VALUES (?, ?, ?, ?, ?,
               (SELECT id FROM core.volcanic_region WHERE slug=?),
               ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?),4326), ?, ?, now())
       ON CONFLICT (volcano_number) DO UPDATE
       SET name=EXCLUDED.name,
           country=EXCLUDED.country,
           subregion=EXCLUDED.subregion,
           volcanic_region_id=EXCLUDED.volcanic_region_id,
           primary_volcano_type=EXCLUDED.primary_volcano_type,
           tectonic_setting=EXCLUDED.tectonic_setting,
           evidence_category=EXCLUDED.evidence_category,
           elevation_m=EXCLUDED.elevation_m,
           last_eruption_year=EXCLUDED.last_eruption_year,
           description=COALESCE(EXCLUDED.description, core.volcano.description),
           geom=EXCLUDED.geom,
           source_dataset_id=EXCLUDED.source_dataset_id,
           source_version=EXCLUDED.source_version,
           source_updated_at=EXCLUDED.source_updated_at,
           updated_at=now()"
      (:volcano-number record) (:name record) (:slug record) (:country record)
      (:subregion record) (parse/slug (or (:subregion record) (:region record)))
      (:volcano-type record) (:tectonic-setting record) (:evidence-category record)
      (:elevation-m record) (:last-eruption-year record) (:description record)
      (:longitude record) (:latitude record) source-id version]))
  (count records))

(defn gvp-eruptions! [tx source-id version records]
  (doseq [record records]
    (execute!
     tx
     ["INSERT INTO core.eruption
         (eruption_number, volcano_number, eruption_category, area_of_activity,
          start_year, start_month, start_day, end_year, end_month, end_day,
          date_precision, vei, evidence_method, certainty,
          source_dataset_id, source_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (eruption_number) DO UPDATE
       SET volcano_number=EXCLUDED.volcano_number,
           eruption_category=EXCLUDED.eruption_category,
           area_of_activity=EXCLUDED.area_of_activity,
           start_year=EXCLUDED.start_year,
           start_month=EXCLUDED.start_month,
           start_day=EXCLUDED.start_day,
           end_year=EXCLUDED.end_year,
           end_month=EXCLUDED.end_month,
           end_day=EXCLUDED.end_day,
           date_precision=EXCLUDED.date_precision,
           vei=EXCLUDED.vei,
           evidence_method=EXCLUDED.evidence_method,
           certainty=EXCLUDED.certainty,
           source_dataset_id=EXCLUDED.source_dataset_id,
           source_version=EXCLUDED.source_version,
           updated_at=now()"
      (:eruption-number record) (:volcano-number record)
      (:eruption-category record) (:area-of-activity record)
      (:start-year record) (:start-month record) (:start-day record)
      (:end-year record) (:end-month record) (:end-day record)
      (:date-precision record) (:vei record) (:evidence-method record)
      (:certainty record) source-id version]))
  (count records))

(defn usgs-earthquakes! [tx source-id version records]
  (doseq [record records]
    (if (and (:deleted? record) (nil? (:longitude record)))
      (execute!
       tx
       ["UPDATE core.earthquake
         SET is_deleted=true,
             status=COALESCE(?, status),
             updated_at_source=COALESCE(?, updated_at_source),
             source_version=?, ingested_at=now()
         WHERE event_id=?"
        (:status record) (:updated-at-source record) version (:event-id record)])
      (execute!
       tx
       ["INSERT INTO core.earthquake
           (event_id, occurred_at, updated_at_source, magnitude, magnitude_type,
            depth_km, place, event_type, significance, tsunami_flag,
            felt_reports, alert_level, status, detail_url, geom,
            source_dataset_id, source_version, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ST_SetSRID(ST_MakePoint(?, ?, ?),4326), ?, ?, ?)
         ON CONFLICT (event_id) DO UPDATE
         SET occurred_at=EXCLUDED.occurred_at,
             updated_at_source=EXCLUDED.updated_at_source,
             magnitude=EXCLUDED.magnitude,
             magnitude_type=EXCLUDED.magnitude_type,
             depth_km=EXCLUDED.depth_km,
             place=EXCLUDED.place,
             event_type=EXCLUDED.event_type,
             significance=EXCLUDED.significance,
             tsunami_flag=EXCLUDED.tsunami_flag,
             felt_reports=EXCLUDED.felt_reports,
             alert_level=EXCLUDED.alert_level,
             status=EXCLUDED.status,
             detail_url=EXCLUDED.detail_url,
             geom=EXCLUDED.geom,
             source_dataset_id=EXCLUDED.source_dataset_id,
             source_version=EXCLUDED.source_version,
             is_deleted=EXCLUDED.is_deleted,
             ingested_at=now()
         WHERE EXCLUDED.updated_at_source >= core.earthquake.updated_at_source"
        (:event-id record) (:occurred-at record) (:updated-at-source record)
        (:magnitude record) (:magnitude-type record) (:depth-km record)
        (:place record) (:event-type record) (:significance record)
        (:tsunami-flag record) (:felt-reports record) (:alert-level record)
        (:status record) (:detail-url record) (:longitude record) (:latitude record)
        (:depth-km record) source-id version (:deleted? record)])))
  (count records))

(defn reconcile-earthquake-deletions!
  [tx source-version window-start window-end missing-event-ids]
  (doseq [batch (partition-all 500 missing-event-ids)]
    (jdbc/execute-one!
     tx
     (into [(str "UPDATE core.earthquake SET is_deleted=true, source_version=?, ingested_at=now()
                       WHERE occurred_at >= ? AND occurred_at < ? AND event_id IN ("
                 (clojure.string/join "," (repeat (count batch) "?")) ")")
            source-version window-start window-end]
           batch)))
  (count missing-event-ids))

(defn plates! [tx source-id version records]
  (doseq [record records]
    (execute!
     tx
     ["INSERT INTO core.plate_boundary
         (boundary_id, name, boundary_type, description, geom,
          source_dataset_id, source_version, source_updated_at)
       VALUES (?, ?, ?, ?,
               ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(?),4326)), ?, ?, now())
       ON CONFLICT (boundary_id) DO UPDATE
       SET name=EXCLUDED.name,
           boundary_type=EXCLUDED.boundary_type,
           description=EXCLUDED.description,
           geom=EXCLUDED.geom,
           source_dataset_id=EXCLUDED.source_dataset_id,
           source_version=EXCLUDED.source_version,
           source_updated_at=EXCLUDED.source_updated_at,
           updated_at=now()"
      (:boundary-id record) (:name record) (:boundary-type record)
      (:description record) (json/generate-string (:geometry record))
      source-id version]))
  (count records))

(defn noaa-tsunamis! [tx source-id version records]
  (doseq [record records]
    (execute!
     tx
     ["INSERT INTO core.tsunami_event
         (event_id, event_year, event_month, event_day, date_precision, cause,
          country, location_name, source_magnitude, maximum_water_height_m,
          deaths, damage_usd, validity, source_confidence, notes, geom,
          source_dataset_id, source_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               CASE WHEN ? IS NULL OR ? IS NULL THEN NULL
                    ELSE ST_SetSRID(ST_MakePoint(?, ?),4326) END,
               ?, ?)
       ON CONFLICT (event_id) DO UPDATE
       SET event_year=EXCLUDED.event_year,
           event_month=EXCLUDED.event_month,
           event_day=EXCLUDED.event_day,
           date_precision=EXCLUDED.date_precision,
           cause=EXCLUDED.cause,
           country=EXCLUDED.country,
           location_name=EXCLUDED.location_name,
           source_magnitude=EXCLUDED.source_magnitude,
           maximum_water_height_m=EXCLUDED.maximum_water_height_m,
           deaths=EXCLUDED.deaths,
           damage_usd=EXCLUDED.damage_usd,
           validity=EXCLUDED.validity,
           source_confidence=EXCLUDED.source_confidence,
           notes=EXCLUDED.notes,
           geom=EXCLUDED.geom,
           source_dataset_id=EXCLUDED.source_dataset_id,
           source_version=EXCLUDED.source_version,
           updated_at=now()"
      (:event-id record) (:event-year record) (:event-month record)
      (:event-day record) (:date-precision record) (:cause record)
      (:country record) (:location-name record) (:source-magnitude record)
      (:maximum-water-height-m record) (:deaths record) (:damage-usd record)
      (:validity record) (:source-confidence record) (:notes record)
      (:longitude record) (:latitude record) (:longitude record) (:latitude record)
      source-id version]))
  (count records))
