(ns restless-pacific.task.metabase-bootstrap
  (:gen-class)
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.string :as str]
            [hikari-cp.core :as hikari]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]
            [restless-pacific.config :as config]))

(defn- env [name default]
  (or (System/getenv name) default))

(defn- json-response [response]
  (let [body (:body response)]
    (if (str/blank? body) nil (json/parse-string body true))))

(defn request!
  [{:keys [base-url session-id]} method path body]
  (let [response
        (http/request
         (cond-> {:method method
                  :url (str base-url path)
                  :accept :json
                  :content-type :json
                  :as :text
                  :cookie-policy :none
                  :throw-exceptions false
                  :connection-timeout 10000
                  :socket-timeout 30000}
           session-id (assoc-in [:headers "X-Metabase-Session"] session-id)
           (some? body) (assoc :body (json/generate-string body))))]
    (when-not (<= 200 (:status response) 299)
      (throw (ex-info (str "Metabase API " (str/upper-case (name method)) " " path
                           " returned " (:status response))
                      {:status (:status response)
                       :method method
                       :path path
                       :response-body (subs (:body response) 0 (min 1000 (count (:body response))))})))
    (json-response response)))

(defn wait-until-ready! [base-url]
  (loop [attempt 1]
    (let [response (try
                     (http/get (str base-url "/api/health")
                               {:throw-exceptions false
                                :cookie-policy :none
                                :connection-timeout 2000
                                :socket-timeout 2000})
                     (catch Throwable _ nil))]
      (cond
        (= 200 (:status response)) true
        (>= attempt 60)
        (throw (ex-info "Metabase did not become healthy within two minutes."
                        {:base-url base-url :attempts attempt}))
        :else (do (Thread/sleep 2000) (recur (inc attempt)))))))

(defn- login! [client email password]
  (:id (request! client :post "/api/session"
                 {:username email :password password})))

(defn ensure-admin-session!
  [base-url {:keys [email password first-name last-name site-name]}]
  (let [anonymous {:base-url base-url}
        properties (request! anonymous :get "/api/session/properties" nil)
        setup-token (:setup-token properties)]
    (when setup-token
      (request! anonymous :post "/api/setup"
                {:token setup-token
                 :user {:first_name first-name
                        :last_name last-name
                        :email email
                        :password password}
                 :prefs {:site_name site-name
                         :site_locale "en"
                         :allow_tracking false}}))
    (or (login! anonymous email password)
        (throw (ex-info "Metabase login returned no session id." {:email email})))))

(defn- list-body [response]
  (cond
    (vector? response) response
    (sequential? response) (vec response)
    (sequential? (:data response)) (:data response)
    :else []))

(defn- ensure-setting! [client key value]
  (request! client :put (str "/api/setting/" key) {:value value}))

(defn ensure-database! [client details]
  (let [databases (list-body (request! client :get "/api/database" nil))
        existing (some #(when (= (:name details) (:name %)) %) databases)
        payload {:name (:name details)
                 :engine "postgres"
                 :details {:host (:host details)
                           :port (:port details)
                           :dbname (:dbname details)
                           :user (:user details)
                           :password (:password details)
                           :ssl false
                           :tunnel-enabled false}
                 :is_full_sync true
                 :is_on_demand false
                 :auto_run_queries true
                 :schedules {}}
        database (if existing
                   (do
                     (request! client :put (str "/api/database/" (:id existing)) payload)
                     (assoc existing :id (:id existing)))
                   (request! client :post "/api/database" payload))]
    ;; PostgreSQL, rather than Metabase metadata, enforces this trust boundary.
    ;; metabase_reader can only SELECT the stable analytics views.
    database))

(defn ensure-collection! [client collection-name]
  (let [collections (list-body
                     (request! client :get "/api/collection?exclude-archived=true" nil))]
    (or (some #(when (= collection-name (:name %)) %) collections)
        (request! client :post "/api/collection"
                  {:name collection-name :color "#F26B38" :parent_id nil}))))

(def region-template-tag
  {:region {:id "region-filter"
            :name "region"
            :display-name "Region"
            :type "text"
            :required false}})

(def start-year-template-tag
  {:start_year {:id "start-year-filter"
                :name "start_year"
                :display-name "Start year"
                :type "number"
                :required true
                :default 1960}})

(def lookback-template-tag
  {:lookback_days {:id "lookback-days-filter"
                   :name "lookback_days"
                   :display-name "Lookback days"
                   :type "number"
                   :required true
                   :default 30}})

(def min-magnitude-template-tag
  {:min_magnitude {:id "min-magnitude-filter"
                   :name "min_magnitude"
                   :display-name "Minimum magnitude"
                   :type "number"
                   :required true
                   :default 2.5}})

(def cause-template-tag
  {:cause {:id "cause-filter"
           :name "cause"
           :display-name "Cause"
           :type "text"
           :required false}})

(def question-specs
  [{:key "pacific-observation-density"
    :name "Pacific observation density"
    :display "map"
    :parameters []
    :query "WITH recent_earthquakes AS (\n  SELECT latitude, longitude\n  FROM analytics.earthquakes\n  WHERE occurred_at >= now() - interval '30 days'\n  ORDER BY occurred_at DESC\n  LIMIT 5000\n), observations AS (\n  SELECT latitude, longitude, 'Reviewed volcano' AS record_type\n  FROM analytics.volcanoes\n  WHERE in_smithsonian_prof\n  UNION ALL\n  SELECT latitude, longitude, 'Recent earthquake' AS record_type\n  FROM recent_earthquakes\n  UNION ALL\n  SELECT latitude, longitude, 'Recorded tsunami' AS record_type\n  FROM analytics.tsunamis\n  WHERE event_year >= 1960 AND latitude IS NOT NULL AND longitude IS NOT NULL\n)\nSELECT latitude, longitude, record_type\nFROM observations\nWHERE latitude IS NOT NULL AND longitude IS NOT NULL"
    :visualization-settings {:map.type "grid"
                             :map.region "world"
                             :map.latitude_column "latitude"
                             :map.longitude_column "longitude"}
    :template-tags {}}
   {:key "analytical-records-by-dataset"
    :name "Analytical records by dataset"
    :display "row"
    :parameters []
    :query "SELECT dataset, records\nFROM (\n  SELECT 'Reviewed volcanoes' AS dataset, count(*) AS records FROM analytics.volcanoes WHERE in_smithsonian_prof\n  UNION ALL SELECT 'Eruptions', count(*) FROM analytics.eruptions\n  UNION ALL SELECT 'Active earthquakes', count(*) FROM analytics.earthquakes\n  UNION ALL SELECT 'Recorded tsunamis', count(*) FROM analytics.tsunamis\n  UNION ALL SELECT 'Plate boundaries', count(*) FROM analytics.plate_boundaries\n) coverage\nORDER BY records DESC, dataset"
    :visualization-settings {:graph.dimensions ["dataset"]
                             :graph.metrics ["records"]
                             :graph.show_values true}
    :template-tags {}}
   {:key "known-value-completeness"
    :name "Known-value coverage by field"
    :display "row"
    :parameters []
    :query "SELECT field, known_percent\nFROM (\n  SELECT 'Volcano elevation' AS field, round(100.0 * count(elevation_m) / nullif(count(*), 0), 1) AS known_percent FROM analytics.volcanoes WHERE in_smithsonian_prof\n  UNION ALL SELECT 'Eruption VEI', round(100.0 * count(vei) / nullif(count(*), 0), 1) FROM analytics.eruptions\n  UNION ALL SELECT 'Earthquake magnitude', round(100.0 * count(magnitude) / nullif(count(*), 0), 1) FROM analytics.earthquakes\n  UNION ALL SELECT 'Tsunami water height', round(100.0 * count(maximum_water_height_m) / nullif(count(*), 0), 1) FROM analytics.tsunamis\n  UNION ALL SELECT 'Tsunami deaths', round(100.0 * count(deaths) / nullif(count(*), 0), 1) FROM analytics.tsunamis\n  UNION ALL SELECT 'Tsunami damage', round(100.0 * count(damage_usd) / nullif(count(*), 0), 1) FROM analytics.tsunamis\n) completeness\nORDER BY known_percent DESC NULLS LAST, field"
    :visualization-settings {:graph.dimensions ["field"]
                             :graph.metrics ["known_percent"]
                             :graph.show_values true
                             :graph.y_axis.auto_range false
                             :graph.y_axis.min 0
                             :graph.y_axis.max 100}
    :template-tags {}}
   {:key "temporal-coverage-by-dataset"
    :name "Temporal coverage by dataset"
    :display "table"
    :parameters []
    :query "SELECT dataset, first_observation, latest_observation, records\nFROM (\n  SELECT 'Eruptions' AS dataset, min(start_year)::text AS first_observation, max(start_year)::text AS latest_observation, count(*) AS records FROM analytics.eruptions WHERE start_year IS NOT NULL\n  UNION ALL SELECT 'Earthquakes', min(occurred_at)::date::text, max(occurred_at)::date::text, count(*) FROM analytics.earthquakes\n  UNION ALL SELECT 'Tsunamis', min(event_year)::text, max(event_year)::text, count(*) FROM analytics.tsunamis WHERE event_year IS NOT NULL\n) coverage\nORDER BY dataset"
    :template-tags {}}
   {:key "membership-by-region"
    :name "Reviewed volcanoes by GVP region"
    :legacy-names ["Ring membership by GVP region"]
    :display "row"
    :parameters ["region"]
    :query "SELECT region, count(*) AS volcanoes\nFROM analytics.volcanoes\nWHERE in_smithsonian_prof\n[[AND region = {{region}}]]\nGROUP BY region\nORDER BY volcanoes DESC, region\nLIMIT 15"
    :visualization-settings {:graph.dimensions ["region"]
                             :graph.metrics ["volcanoes"]
                             :graph.show_values true}
    :template-tags region-template-tag}
   {:key "volcanoes-by-region-type"
    :name "Volcano type mix"
    :legacy-names ["Volcanoes by region and type"]
    :display "row"
    :parameters ["region"]
    :query "SELECT coalesce(volcano_type, 'Unknown') AS volcano_type, count(*) AS volcanoes\nFROM analytics.volcanoes\nWHERE in_smithsonian_prof\n[[AND region = {{region}}]]\nGROUP BY coalesce(volcano_type, 'Unknown')\nORDER BY volcanoes DESC, volcano_type\nLIMIT 15"
    :visualization-settings {:graph.dimensions ["volcano_type"]
                             :graph.metrics ["volcanoes"]
                             :graph.show_values true}
    :template-tags region-template-tag}
   {:key "eruptions-by-decade"
    :name "Confirmed eruptions by decade"
    :legacy-names ["Confirmed eruptions by decade since 1960"]
    :display "line"
    :parameters ["region" "start_year"]
    :query "SELECT (e.start_year / 10) * 10 AS decade, count(*) AS eruptions\nFROM analytics.eruptions e\nJOIN analytics.volcanoes v ON v.volcano_number=e.volcano_number AND v.in_smithsonian_prof\nWHERE e.start_year >= {{start_year}} AND e.certainty ILIKE '%Confirmed%'\n[[AND v.region = {{region}}]]\nGROUP BY decade\nORDER BY decade"
    :visualization-settings {:graph.dimensions ["decade"]
                             :graph.metrics ["eruptions"]}
    :template-tags (merge region-template-tag start-year-template-tag)}
   {:key "vei-distribution"
    :name "VEI distribution"
    :legacy-names ["VEI distribution since 1960"]
    :display "bar"
    :parameters ["region" "start_year"]
    :query "SELECT e.vei, count(*) AS eruptions\nFROM analytics.eruptions e\nJOIN analytics.volcanoes v ON v.volcano_number=e.volcano_number AND v.in_smithsonian_prof\nWHERE e.start_year >= {{start_year}} AND e.vei IS NOT NULL\n[[AND v.region = {{region}}]]\nGROUP BY e.vei\nORDER BY e.vei"
    :visualization-settings {:graph.dimensions ["vei"]
                             :graph.metrics ["eruptions"]}
    :template-tags (merge region-template-tag start-year-template-tag)}
   {:key "earthquake-density"
    :name "Recent earthquake density"
    :display "map"
    :parameters ["lookback_days" "min_magnitude"]
    :query "SELECT latitude, longitude, magnitude, depth_km, place, occurred_at\nFROM analytics.earthquakes\nWHERE occurred_at >= now() - ({{lookback_days}} * interval '1 day')\n  AND magnitude >= {{min_magnitude}}\nORDER BY occurred_at DESC\nLIMIT 5000"
    :visualization-settings {:map.type "grid"
                             :map.region "world"
                             :map.latitude_column "latitude"
                             :map.longitude_column "longitude"}
    :template-tags (merge lookback-template-tag min-magnitude-template-tag)}
   {:key "earthquake-magnitude-depth"
    :name "Earthquake magnitude versus depth"
    :display "scatter"
    :parameters ["lookback_days" "min_magnitude"]
    :query "SELECT magnitude, depth_km, significance, place, occurred_at\nFROM analytics.earthquakes\nWHERE occurred_at >= now() - ({{lookback_days}} * interval '1 day')\n  AND magnitude >= {{min_magnitude}}\n  AND magnitude IS NOT NULL\nORDER BY occurred_at DESC\nLIMIT 5000"
    :visualization-settings {:graph.dimensions ["magnitude"]
                             :graph.metrics ["depth_km"]}
    :template-tags (merge lookback-template-tag min-magnitude-template-tag)}
   {:key "earthquakes-by-day"
    :name "Earthquakes by day"
    :display "line"
    :parameters ["lookback_days" "min_magnitude"]
    :query "SELECT date_trunc('day', occurred_at)::date AS day, count(*) AS earthquakes\nFROM analytics.earthquakes\nWHERE occurred_at >= now() - ({{lookback_days}} * interval '1 day')\n  AND magnitude >= {{min_magnitude}}\nGROUP BY day\nORDER BY day"
    :visualization-settings {:graph.dimensions ["day"]
                             :graph.metrics ["earthquakes"]}
    :template-tags (merge lookback-template-tag min-magnitude-template-tag)}
   {:key "plate-boundary-length-by-type"
    :name "Plate-boundary length by type"
    :display "row"
    :parameters []
    :query "SELECT coalesce(boundary_type, 'other') AS boundary_type, round(sum(length_km), 1) AS length_km\nFROM analytics.plate_boundaries\nGROUP BY coalesce(boundary_type, 'other')\nORDER BY length_km DESC, boundary_type"
    :visualization-settings {:graph.dimensions ["boundary_type"]
                             :graph.metrics ["length_km"]
                             :graph.show_values true}
    :template-tags {}}
   {:key "tsunami-density"
    :name "Recorded tsunami density"
    :display "map"
    :parameters ["start_year" "cause"]
    :query "SELECT latitude, longitude, event_year, cause, country, location_name, maximum_water_height_m, deaths\nFROM analytics.tsunamis\nWHERE event_year >= {{start_year}}\n  AND latitude IS NOT NULL AND longitude IS NOT NULL\n[[AND cause = {{cause}}]]\nORDER BY event_year DESC\nLIMIT 5000"
    :visualization-settings {:map.type "grid"
                             :map.region "world"
                             :map.latitude_column "latitude"
                             :map.longitude_column "longitude"}
    :template-tags (merge start-year-template-tag cause-template-tag)}
   {:key "tsunami-causes-impacts"
    :name "Tsunami events by decade and cause"
    :legacy-names ["Tsunami causes and recorded impacts"]
    :display "bar"
    :parameters ["start_year" "cause"]
    :query "SELECT (event_year / 10) * 10 AS decade, coalesce(cause, 'Unknown') AS cause, count(*) AS events\nFROM analytics.tsunamis\nWHERE event_year >= {{start_year}}\n[[AND cause = {{cause}}]]\nGROUP BY decade, coalesce(cause, 'Unknown')\nORDER BY decade, cause"
    :visualization-settings {:graph.dimensions ["decade" "cause"]
                             :graph.metrics ["events"]
                             :stackable.stack_type "stacked"}
    :template-tags (merge start-year-template-tag cause-template-tag)}
   {:key "tsunami-height-deaths"
    :name "Water height versus recorded deaths"
    :display "scatter"
    :parameters ["start_year" "cause"]
    :query "SELECT maximum_water_height_m, deaths, source_magnitude, event_year, country, location_name, cause\nFROM analytics.tsunamis\nWHERE event_year >= {{start_year}}\n  AND maximum_water_height_m IS NOT NULL\n  AND deaths IS NOT NULL\n[[AND cause = {{cause}}]]\nORDER BY event_year DESC"
    :visualization-settings {:graph.dimensions ["maximum_water_height_m"]
                             :graph.metrics ["deaths"]}
    :template-tags (merge start-year-template-tag cause-template-tag)}
   {:key "tsunami-highest-recorded-impacts"
    :name "Highest recorded tsunami impacts"
    :display "table"
    :parameters ["start_year" "cause"]
    :query "SELECT event_year, country, location_name, cause, source_magnitude, maximum_water_height_m, deaths, damage_usd\nFROM analytics.tsunamis\nWHERE event_year >= {{start_year}}\n[[AND cause = {{cause}}]]\nORDER BY coalesce(deaths, 0) DESC, coalesce(maximum_water_height_m, 0) DESC\nLIMIT 25"
    :template-tags (merge start-year-template-tag cause-template-tag)}])

(defn- static-parameter [id name type values & [default]]
  (cond-> {:id id
           :slug id
           :name name
           :type type
           :values_query_type "list"
           :values_source_type "static-list"
           :values_source_config {:values (vec values)}}
    (some? default) (assoc :default default)))

(defn dashboard-specs [region-values cause-values]
  [{:key "ring-of-fire-data-lab"
    :name "Restless Pacific — Ring of Fire Data Lab"
    :description "Coverage, completeness, and analytical scope across five read-only views. Density is not hazard intensity."
    :question-keys ["pacific-observation-density"
                    "analytical-records-by-dataset"
                    "known-value-completeness"
                    "temporal-coverage-by-dataset"]
    :parameters []
    :layout {"pacific-observation-density" {:row 0 :col 0 :size_x 16 :size_y 10}
             "analytical-records-by-dataset" {:row 0 :col 16 :size_x 8 :size_y 10}
             "known-value-completeness" {:row 10 :col 0 :size_x 16 :size_y 7}
             "temporal-coverage-by-dataset" {:row 10 :col 16 :size_x 8 :size_y 7}}}
   {:key "volcano-eruption-data-lab"
    :name "Restless Pacific — Volcanoes and eruptions"
    :description "Reviewed Smithsonian PROF membership and recorded eruption history. Trends default to 1960 onward."
    :question-keys ["membership-by-region" "volcanoes-by-region-type"
                    "eruptions-by-decade" "vei-distribution"]
    :parameters [(static-parameter "region" "Region" "string/=" region-values)
                 (static-parameter "start_year" "Start year" "number/=" [1960 1980 2000 2020] 1960)]
    :layout {"membership-by-region" {:row 0 :col 0 :size_x 12 :size_y 9}
             "volcanoes-by-region-type" {:row 0 :col 12 :size_x 12 :size_y 9}
             "eruptions-by-decade" {:row 9 :col 0 :size_x 12 :size_y 8}
             "vei-distribution" {:row 9 :col 12 :size_x 12 :size_y 8}}}
   {:key "earthquake-plate-data-lab"
    :name "Restless Pacific — Earthquakes and plate context"
    :description "Recent USGS observations with plate-boundary inventory as spatial context, never causal attribution."
    :question-keys ["earthquake-density" "earthquake-magnitude-depth"
                    "earthquakes-by-day" "plate-boundary-length-by-type"]
    :parameters [(static-parameter "lookback_days" "Lookback days" "number/=" [7 30 90 365] 30)
                 (static-parameter "min_magnitude" "Minimum magnitude" "number/=" [2.5 4 5 6] 2.5)]
    :layout {"earthquake-density" {:row 0 :col 0 :size_x 12 :size_y 9}
             "earthquake-magnitude-depth" {:row 0 :col 12 :size_x 12 :size_y 9}
             "earthquakes-by-day" {:row 9 :col 0 :size_x 16 :size_y 8}
             "plate-boundary-length-by-type" {:row 9 :col 16 :size_x 8 :size_y 8}}}
   {:key "tsunami-impact-data-lab"
    :name "Restless Pacific — Tsunamis and impacts"
    :description "Historical NOAA observations. Impact totals and water heights are incomplete and observation-dependent."
    :question-keys ["tsunami-density" "tsunami-causes-impacts"
                    "tsunami-height-deaths" "tsunami-highest-recorded-impacts"]
    :parameters [(static-parameter "start_year" "Start year" "number/=" [1960 1980 2000 2020] 1960)
                 (static-parameter "cause" "Cause" "string/=" cause-values)]
    :layout {"tsunami-density" {:row 0 :col 0 :size_x 12 :size_y 9}
             "tsunami-causes-impacts" {:row 0 :col 12 :size_x 12 :size_y 9}
             "tsunami-height-deaths" {:row 9 :col 0 :size_x 12 :size_y 8}
             "tsunami-highest-recorded-impacts" {:row 9 :col 12 :size_x 12 :size_y 8}}}])

(defn- collection-items [client collection-id]
  (list-body
   (request! client :get
             (str "/api/collection/" collection-id "/items?models=card&limit=200") nil)))

(defn- matching-name? [spec item]
  (contains? (set (cons (:name spec) (:legacy-names spec))) (:name item)))

(defn ensure-question! [client database-id collection-id existing spec]
  (let [payload {:name (:name spec)
                 :description (str "Provisioned by the version-pinned Restless Pacific bootstrap task. "
                                   "Resource key: " (:key spec) ".")
                 :collection_id collection-id
                 :display (:display spec)
                 :dataset_query {:database database-id
                                 :type "native"
                                 :native {:query (:query spec)
                                          :template-tags (:template-tags spec)}}
                 :visualization_settings (or (:visualization-settings spec) {})}
        card (some #(when (matching-name? spec %) %) existing)
        saved (if card
                (do
                  (request! client :put (str "/api/card/" (:id card)) payload)
                  (merge card payload))
                (request! client :post "/api/card" payload))]
    (request! client :put (str "/api/card/" (:id saved))
              {:enable_embedding true
               :embedding_params (into {} (map #(vector (keyword %) "enabled"))
                                       (:parameters spec))})
    (assoc saved :name (:name spec)
                 :resource-key (:key spec)
                 :allowed-parameters (:parameters spec))))

(defn ensure-dashboard! [client collection-id cards spec]
  (let [dashboards (list-body (request! client :get "/api/dashboard" nil))
        candidate-names (set (cons (:name spec) (:legacy-names spec)))
        existing (some #(when (and (contains? candidate-names (:name %))
                                   (= collection-id (:collection_id %))) %) dashboards)
        dashboard (or existing
                      (request! client :post "/api/dashboard"
                                {:name (:name spec)
                                 :description (:description spec)
                                 :collection_id collection-id
                                 :parameters (:parameters spec)}))
        dashboard-id (:id dashboard)
        current (request! client :get (str "/api/dashboard/" dashboard-id) nil)
        by-card-id (into {} (map (juxt #(or (:card_id %) (get-in % [:card :id])) identity))
                         (:dashcards current))
        cards-by-key (into {} (map (juxt :resource-key identity)) cards)
        dashcards
        (mapv (fn [index question-key]
                (let [card (get cards-by-key question-key)
                      existing-dashcard (get by-card-id (:id card))
                      layout (get-in spec [:layout question-key])]
                  (merge
                   {:id (or (:id existing-dashcard) (- (inc index)))
                    :card_id (:id card)
                    :parameter_mappings
                    (mapv (fn [parameter]
                            {:parameter_id parameter
                             :card_id (:id card)
                             :target ["variable" ["template-tag" parameter]]})
                          (:allowed-parameters card))}
                   layout)))
              (range) (:question-keys spec))
        allowed-parameters (mapv :id (:parameters spec))]
    (request! client :put (str "/api/dashboard/" dashboard-id)
              {:name (:name spec)
               :description (:description spec)
               :dashcards dashcards
               :tabs []
               :parameters (:parameters spec)
               :enable_embedding true
               :embedding_params (into {} (map #(vector (keyword %) "enabled"))
                                       allowed-parameters)})
    (assoc dashboard :name (:name spec)
                     :resource-key (:key spec)
                     :allowed-parameters allowed-parameters)))

(defn persist-resource! [datasource entity-type resource]
  (jdbc/execute-one!
   datasource
   ["INSERT INTO ops.metabase_resource
       (resource_key, entity_type, entity_id, display_name, enabled, allowed_parameters)
     VALUES (?, ?, ?, ?, true, ?::jsonb)
     ON CONFLICT (resource_key) DO UPDATE
     SET entity_type=EXCLUDED.entity_type,
         entity_id=EXCLUDED.entity_id,
         display_name=EXCLUDED.display_name,
         enabled=true,
         allowed_parameters=EXCLUDED.allowed_parameters,
         updated_at=now()"
    (:resource-key resource) entity-type (:id resource) (:name resource)
    (json/generate-string (:allowed-parameters resource))]
   {:builder-fn rs/as-unqualified-lower-maps}))

(defn disable-stale-resources! [datasource desired-resource-keys]
  (let [keys (vec desired-resource-keys)
        placeholders (str/join "," (repeat (count keys) "?"))]
    (jdbc/execute-one!
     datasource
     (into [(str "UPDATE ops.metabase_resource
                  SET enabled=false, updated_at=now()
                  WHERE enabled AND resource_key NOT IN (" placeholders ")")]
           keys))))

(defn- distinct-values [datasource sql]
  (mapv :value
        (jdbc/execute! datasource [sql]
                       {:builder-fn rs/as-unqualified-lower-maps})))

(defn bootstrap! [datasource]
  (let [base-url (env "METABASE_URL" "http://localhost:3001")
        email (env "METABASE_ADMIN_EMAIL" "atlas-admin@example.test")
        password (env "METABASE_ADMIN_PASSWORD" "RestlessPacific-Atlas!2026-Local")
        admin {:email email
               :password password
               :first-name (env "METABASE_ADMIN_FIRST_NAME" "Restless")
               :last-name (env "METABASE_ADMIN_LAST_NAME" "Pacific")
               :site-name (env "METABASE_SITE_NAME" "Restless Pacific Data Lab")}
        _ (wait-until-ready! base-url)
        session-id (ensure-admin-session! base-url admin)
        client {:base-url base-url :session-id session-id}
        secret (env "METABASE_EMBEDDING_SECRET"
                    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
        _ (ensure-setting! client "enable-embedding" true)
        _ (ensure-setting! client "enable-embedding-static" true)
        _ (ensure-setting! client "embedding-secret-key" secret)
        database (ensure-database!
                  client
                  {:name "Restless Pacific Analytics"
                   :host (env "METABASE_READER_HOST" "postgres")
                   :port (Integer/parseInt (env "METABASE_READER_PORT" "5432"))
                   :dbname (env "METABASE_READER_DATABASE" "ring_data")
                   :user (env "METABASE_READER_USER" "metabase_reader")
                   :password (env "METABASE_READER_PASSWORD"
                                  "dev-only-metabase-reader-change-me")})
        collection (ensure-collection! client "Restless Pacific")
        existing-items (collection-items client (:id collection))
        cards (mapv #(ensure-question! client (:id database) (:id collection)
                                       existing-items %)
                    question-specs)
        region-values (distinct-values datasource
                                       "SELECT DISTINCT region AS value FROM analytics.volcanoes WHERE in_smithsonian_prof AND region IS NOT NULL ORDER BY value")
        cause-values (distinct-values datasource
                                      "SELECT DISTINCT cause AS value FROM analytics.tsunamis WHERE cause IS NOT NULL ORDER BY value")
        specs (dashboard-specs region-values cause-values)
        dashboards (mapv #(ensure-dashboard! client (:id collection) cards %) specs)
        resources (concat cards dashboards)
        desired-keys (mapv :resource-key resources)]
    (doseq [card cards] (persist-resource! datasource "question" card))
    (doseq [dashboard dashboards] (persist-resource! datasource "dashboard" dashboard))
    (disable-stale-resources! datasource desired-keys)
    {:databaseId (:id database)
     :collectionId (:id collection)
     :questionIds (mapv :id cards)
     :dashboardId (:id (first dashboards))
     :dashboardIds (mapv :id dashboards)}))

(defn -main [& _]
  (let [datasource (hikari/make-datasource (config/db-config))]
    (try
      (println "Metabase bootstrap complete:" (bootstrap! datasource))
      (finally
        (hikari/close-datasource datasource)))))
