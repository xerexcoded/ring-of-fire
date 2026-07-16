(ns restless-pacific.repository.atlas
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]))

(def query-options {:builder-fn rs/as-unqualified-lower-maps})

(defn- query! [db sql-params]
  (jdbc/execute! db sql-params query-options))

(defn- query-one! [db sql-params]
  (jdbc/execute-one! db sql-params query-options))

(defn- instant-string [value]
  (cond
    (nil? value) nil
    (instance? java.sql.Timestamp value) (str (.toInstant ^java.sql.Timestamp value))
    (instance? java.time.Instant value) (str value)
    (instance? java.time.OffsetDateTime value) (str (.toInstant ^java.time.OffsetDateTime value))
    :else (str value)))

(defn- add-clause [{:keys [clauses params] :as query} clause & values]
  (assoc query :clauses (conj clauses clause)
               :params (into params values)))

(defn- bbox-clause [query alias {:keys [west south east north crosses-dateline?]}]
  (if crosses-dateline?
    (add-clause query
                (str "(ST_Intersects(ST_Force2D(" alias ".geom), ST_MakeEnvelope(?, ?, 180, ?, 4326)) "
                     "OR ST_Intersects(ST_Force2D(" alias ".geom), ST_MakeEnvelope(-180, ?, ?, ?, 4326)))")
                west south north south east north)
    (add-clause query
                (str "ST_Intersects(ST_Force2D(" alias ".geom), ST_MakeEnvelope(?, ?, ?, ?, 4326))")
                west south east north)))

(defn- compile-query [select {:keys [clauses params]} order-by limit offset]
  (into [(str select
              (when (seq clauses) (str " WHERE " (str/join " AND " clauses)))
              " " order-by " LIMIT ? OFFSET ?")]
        (concat params [limit offset])))

(defn- source-map [row]
  {:dataset (:source_key row)
   :authority (:authority row)
   :version (:source_version row)
   :publishedAt (instant-string (:current_published_at row))
   :refreshedAt (instant-string (:last_successful_run_at row))
   :url (:source_url row)})

(defn- point-feature [coordinates properties]
  {:type "Feature"
   :geometry {:type "Point" :coordinates coordinates}
   :properties properties})

(defn volcanoes [db {:keys [bbox limit offset region type confidence min-vei max-vei]}]
  (let [base {:clauses ["COALESCE(rm.included, false)"] :params []}
        query (bbox-clause base "v" bbox)
        query (cond-> query
                region (add-clause "r.slug = ?" region)
                type (add-clause "lower(v.primary_volcano_type) = lower(?)" type)
                confidence (add-clause "rm.confidence = ?" confidence))
        query (cond
                (and min-vei max-vei)
                (add-clause query
                            "EXISTS (SELECT 1 FROM core.eruption vei_e WHERE vei_e.volcano_number=v.volcano_number AND vei_e.vei >= ? AND vei_e.vei <= ?)"
                            min-vei max-vei)
                min-vei
                (add-clause query
                            "EXISTS (SELECT 1 FROM core.eruption vei_e WHERE vei_e.volcano_number=v.volcano_number AND vei_e.vei >= ?)"
                            min-vei)
                max-vei
                (add-clause query
                            "EXISTS (SELECT 1 FROM core.eruption vei_e WHERE vei_e.volcano_number=v.volcano_number AND vei_e.vei <= ?)"
                            max-vei)
                :else query)
        select "SELECT v.volcano_number, v.name, v.slug, v.country, v.primary_volcano_type,
                       v.elevation_m, v.last_eruption_year, r.name region,
                       COALESCE(rm.confidence, 'uncertain') confidence,
                       ST_X(v.geom) longitude, ST_Y(v.geom) latitude,
                       v.source_version, s.source_key, s.authority, s.source_url,
                       s.current_published_at, s.last_successful_run_at
                FROM core.volcano v
                LEFT JOIN core.volcanic_region r ON r.id=v.volcanic_region_id
                LEFT JOIN LATERAL (
                  SELECT x.confidence, x.included FROM core.ring_membership x
                  WHERE x.volcano_number=v.volcano_number
                    AND x.definition_key='smithsonian-prof'
                  ORDER BY x.reviewed_at DESC NULLS LAST, x.dataset_version DESC LIMIT 1
                ) rm ON true
                LEFT JOIN ops.source_dataset s ON s.id=v.source_dataset_id"
        rows (query! db (compile-query select query "ORDER BY v.name" limit offset))]
    (mapv (fn [row]
            (point-feature
             [(:longitude row) (:latitude row)]
             {:volcanoNumber (:volcano_number row)
              :name (:name row)
              :slug (:slug row)
              :country (:country row)
              :region (:region row)
              :volcanoType (:primary_volcano_type row)
              :elevationM (:elevation_m row)
              :lastKnownEruption (:last_eruption_year row)
              :confidence (:confidence row)
              :source (source-map row)}))
          rows)))

(defn earthquakes [db {:keys [bbox limit offset start end min-magnitude max-magnitude min-depth max-depth]}]
  (let [base {:clauses ["NOT e.is_deleted"] :params []}
        query (bbox-clause base "e" bbox)
        query (cond-> query
                start (add-clause "e.occurred_at >= ?" start)
                end (add-clause "e.occurred_at <= ?" end)
                min-magnitude (add-clause "e.magnitude >= ?" min-magnitude)
                max-magnitude (add-clause "e.magnitude <= ?" max-magnitude)
                min-depth (add-clause "e.depth_km >= ?" min-depth)
                max-depth (add-clause "e.depth_km <= ?" max-depth))
        select "SELECT e.event_id, e.place, e.magnitude, e.depth_km, e.occurred_at,
                       e.status, ST_X(e.geom) longitude, ST_Y(e.geom) latitude,
                       e.source_version, s.source_key, s.authority, s.source_url,
                       s.current_published_at, s.last_successful_run_at
                FROM core.earthquake e
                LEFT JOIN ops.source_dataset s ON s.id=e.source_dataset_id"
        rows (query! db (compile-query select query "ORDER BY e.occurred_at DESC" limit offset))]
    (mapv (fn [row]
            (point-feature
             [(:longitude row) (:latitude row)]
             {:eventId (:event_id row)
              :place (:place row)
              :magnitude (:magnitude row)
              :depthKm (:depth_km row)
              :occurredAt (instant-string (:occurred_at row))
              :status (:status row)
              :source (source-map row)}))
          rows)))

(defn boundaries [db {:keys [bbox limit offset type confidence]}]
  (let [base {:clauses [] :params []}
        query (bbox-clause base "b" bbox)
        query (cond-> query
                type (add-clause "lower(b.boundary_type) = lower(?)" type))
        select "SELECT b.boundary_id, b.name, b.boundary_type,
                       ST_AsGeoJSON(ST_Force2D(b.geom)) geometry_geojson,
                       b.source_version, s.source_key, s.authority, s.source_url,
                       s.current_published_at, s.last_successful_run_at
                FROM core.plate_boundary b
                LEFT JOIN ops.source_dataset s ON s.id=b.source_dataset_id"
        rows (query! db (compile-query select query "ORDER BY b.name NULLS LAST, b.boundary_id" limit offset))]
    (mapv (fn [row]
            {:type "Feature"
             :geometry (json/parse-string (:geometry_geojson row) true)
             :properties {:boundaryId (:boundary_id row)
                          :name (:name row)
                          :boundaryType (:boundary_type row)
                          :confidence (or confidence "authoritative")
                          :source (source-map row)}})
          rows)))

(defn tsunamis [db {:keys [bbox limit offset start-year end-year cause confidence]}]
  (let [base {:clauses ["t.geom IS NOT NULL"] :params []}
        query (bbox-clause base "t" bbox)
        query (cond-> query
                start-year (add-clause "t.event_year >= ?" start-year)
                end-year (add-clause "t.event_year <= ?" end-year)
                cause (add-clause "lower(t.cause) = lower(?)" cause)
                confidence (add-clause "t.source_confidence = ?" confidence))
        select "SELECT t.event_id, t.location_name, t.event_year, t.cause,
                       t.maximum_water_height_m, t.deaths, t.source_confidence,
                       ST_X(t.geom) longitude, ST_Y(t.geom) latitude,
                       t.source_version, s.source_key, s.authority, s.source_url,
                       s.current_published_at, s.last_successful_run_at
                FROM core.tsunami_event t
                LEFT JOIN ops.source_dataset s ON s.id=t.source_dataset_id"
        rows (query! db (compile-query select query "ORDER BY t.event_year DESC NULLS LAST" limit offset))]
    (mapv (fn [row]
            (point-feature
             [(:longitude row) (:latitude row)]
             {:eventId (:event_id row)
              :place (:location_name row)
              :year (:event_year row)
              :cause (:cause row)
              :maxWaterHeightM (:maximum_water_height_m row)
              :deaths (:deaths row)
              :confidence (:source_confidence row)
              :source (source-map row)}))
          rows)))

(defn volcano [db volcano-number]
  (when-let [row
             (query-one!
              db
              ["SELECT v.volcano_number, v.name, v.slug, v.country, v.subregion,
                       v.primary_volcano_type, v.tectonic_setting, v.evidence_category,
                       v.elevation_m, v.last_eruption_year, v.description,
                       r.name region, ST_X(v.geom) longitude, ST_Y(v.geom) latitude,
                       COALESCE(rm.confidence, 'uncertain') confidence,
                       v.source_version, s.source_key, s.authority, s.source_url,
                       s.current_published_at, s.last_successful_run_at,
                       nearest.name nearest_boundary_name,
                       nearest.boundary_type nearest_boundary_type,
                       nearest.distance_km nearest_boundary_distance_km
                FROM core.volcano v
                LEFT JOIN core.volcanic_region r ON r.id=v.volcanic_region_id
                LEFT JOIN ops.source_dataset s ON s.id=v.source_dataset_id
                LEFT JOIN LATERAL (
                  SELECT x.confidence FROM core.ring_membership x
                  WHERE x.volcano_number=v.volcano_number
                    AND x.definition_key='smithsonian-prof'
                  ORDER BY x.reviewed_at DESC NULLS LAST, x.dataset_version DESC LIMIT 1
                ) rm ON true
                LEFT JOIN LATERAL (
                  SELECT b.name, b.boundary_type,
                         round((ST_Distance(v.geom::geography, b.geom::geography)/1000.0)::numeric, 1) distance_km
                  FROM core.plate_boundary b ORDER BY v.geom <-> b.geom LIMIT 1
                ) nearest ON true
                WHERE v.volcano_number=?" volcano-number])]
    (let [eruptions
          (query! db ["SELECT eruption_number, start_year, start_month, start_day,
                             date_precision, vei, certainty, source_version
                      FROM core.eruption WHERE volcano_number=?
                      ORDER BY start_year DESC NULLS LAST, eruption_number DESC"
                     volcano-number])]
      {:volcanoNumber (:volcano_number row)
       :name (:name row)
       :slug (:slug row)
       :country (:country row)
       :subregion (:subregion row)
       :region (:region row)
       :volcanoType (:primary_volcano_type row)
       :tectonicSetting (:tectonic_setting row)
       :evidenceCategory (:evidence_category row)
       :elevationM (:elevation_m row)
       :lastKnownEruption (:last_eruption_year row)
       :description (:description row)
       :coordinates [(:longitude row) (:latitude row)]
       :confidence (:confidence row)
       :nearbyBoundary (when (:nearest_boundary_name row)
                         {:name (:nearest_boundary_name row)
                          :type (:nearest_boundary_type row)
                          :distanceKm (:nearest_boundary_distance_km row)
                          :interpretation "Derived proximity only; it does not establish causal attribution."})
       :eruptions (mapv (fn [eruption]
                          {:eruptionNumber (:eruption_number eruption)
                           :startYear (:start_year eruption)
                           :startMonth (:start_month eruption)
                           :startDay (:start_day eruption)
                           :datePrecision (:date_precision eruption)
                           :vei (:vei eruption)
                           :certainty (:certainty eruption)
                           :sourceVersion (:source_version eruption)})
                        eruptions)
       :source (source-map row)})))

(defn search [db q]
  (mapv (fn [row]
          {:entityType "volcano"
           :entityId (:volcano_number row)
           :slug (:slug row)
           :name (:name row)
           :country (:country row)
           :region (:region row)
           :coordinates [(:longitude row) (:latitude row)]})
        (query!
         db
         ["SELECT v.volcano_number, v.slug, v.name, v.country, r.name region,
                  ST_X(v.geom) longitude, ST_Y(v.geom) latitude
           FROM core.volcano v
           LEFT JOIN core.volcanic_region r ON r.id=v.volcanic_region_id
           JOIN LATERAL (
             SELECT membership.included
             FROM core.ring_membership membership
             WHERE membership.volcano_number=v.volcano_number
               AND membership.definition_key='smithsonian-prof'
             ORDER BY membership.reviewed_at DESC NULLS LAST,
                      membership.dataset_version DESC
             LIMIT 1
           ) rm ON rm.included
           WHERE v.name ILIKE ? OR v.country ILIKE ? OR r.name ILIKE ?
           ORDER BY similarity(v.name, ?) DESC, v.name
           LIMIT 20"
          (str "%" q "%") (str "%" q "%") (str "%" q "%") q])))

(defn source-status [db]
  (mapv (fn [row]
          {:key (:source_key row)
           :name (:display_name row)
           :authority (:authority row)
           :version (:current_version row)
           :publishedAt (instant-string (:current_published_at row))
           :lastSuccessfulRunAt (instant-string (:last_successful_run_at row))
           :refreshCadence (:refresh_cadence row)
           :membershipReviewStatus (:membership_review_status row)
           :sourceUrl (:source_url row)
           :license {:name (:license_name row) :url (:license_url row)}
           :metadata (json/parse-string (:metadata_json row) true)})
        (query! db ["SELECT *, metadata::text metadata_json
                     FROM ops.source_dataset ORDER BY display_name"])))

(defn metabase-resource [db entity-type entity-id]
  (when-let [row
             (query-one! db
                         ["SELECT entity_type, entity_id, resource_key,
                                 allowed_parameters::text allowed_parameters_json
                           FROM ops.metabase_resource
                           WHERE enabled AND entity_type=? AND entity_id=?"
                          entity-type entity-id])]
    (assoc row :allowed_parameters
           (json/parse-string (:allowed_parameters_json row) true))))

(defn metabase-resource-by-key [db resource-key]
  (query-one!
   db
   ["SELECT resource_key, entity_type, entity_id, display_name
     FROM ops.metabase_resource
     WHERE enabled AND resource_key=?"
    resource-key]))
