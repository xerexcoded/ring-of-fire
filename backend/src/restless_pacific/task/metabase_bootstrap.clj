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
    ;; Schema isolation is enforced at PostgreSQL: metabase_reader has USAGE and
    ;; SELECT only on analytics and cannot see core or ops. This remains stable
    ;; across Metabase API changes to sync-filter settings.
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

(def question-specs
  [{:key "membership-by-region"
    :name "Ring membership by GVP region"
    :display "bar"
    :parameters ["region"]
    :query "SELECT region, count(*) FILTER (WHERE in_smithsonian_prof) AS included, count(*) AS regional_candidates\nFROM analytics.volcanoes\nWHERE region IN (SELECT DISTINCT region FROM analytics.volcanoes WHERE in_smithsonian_prof)\n[[AND region = {{region}}]]\nGROUP BY region\nORDER BY included DESC, region"
    :template-tags region-template-tag}
   {:key "volcanoes-by-region-type"
    :name "Volcanoes by region and type"
    :display "bar"
    :parameters ["region"]
    :query "SELECT region, volcano_type, count(*) AS volcanoes\nFROM analytics.volcanoes\nWHERE in_smithsonian_prof\n[[AND region = {{region}}]]\nGROUP BY region, volcano_type\nORDER BY volcanoes DESC"
    :template-tags region-template-tag}
   {:key "eruptions-by-decade"
    :name "Confirmed eruptions by decade since 1960"
   :display "line"
   :parameters ["region" "start_year"]
   :query "SELECT (e.start_year / 10) * 10 AS decade, count(*) AS eruptions\nFROM analytics.eruptions e\nJOIN analytics.volcanoes v ON v.volcano_number=e.volcano_number AND v.in_smithsonian_prof\nWHERE e.start_year >= {{start_year}} AND e.certainty ILIKE '%Confirmed%'\n[[AND v.region = {{region}}]]\nGROUP BY decade\nORDER BY decade"
    :visualization-settings {:graph.dimensions ["decade"]
                             :graph.metrics ["eruptions"]}
    :template-tags (merge region-template-tag start-year-template-tag)}
   {:key "vei-distribution"
    :name "VEI distribution since 1960"
   :display "bar"
   :parameters ["region" "start_year"]
   :query "SELECT e.vei, count(*) AS eruptions\nFROM analytics.eruptions e\nJOIN analytics.volcanoes v ON v.volcano_number=e.volcano_number AND v.in_smithsonian_prof\nWHERE e.start_year >= {{start_year}} AND e.vei IS NOT NULL\n[[AND v.region = {{region}}]]\nGROUP BY e.vei\nORDER BY e.vei"
    :visualization-settings {:graph.dimensions ["vei"]
                             :graph.metrics ["eruptions"]}
    :template-tags (merge region-template-tag start-year-template-tag)}
   {:key "earthquake-magnitude-depth"
    :name "Earthquake magnitude versus depth"
    :display "scatter"
    :parameters []
    :query "SELECT occurred_at, magnitude, depth_km, place\nFROM analytics.earthquakes\nWHERE occurred_at >= now() - interval '30 days' AND magnitude IS NOT NULL\nORDER BY occurred_at DESC\nLIMIT 5000"
    :template-tags {}}
   {:key "tsunami-causes-impacts"
    :name "Tsunami causes and recorded impacts"
    :display "bar"
    :parameters ["start_year"]
    :query "SELECT cause, count(*) AS events, sum(deaths) AS recorded_deaths, max(maximum_water_height_m) AS max_water_height_m\nFROM analytics.tsunamis\nWHERE event_year >= {{start_year}}\nGROUP BY cause\nORDER BY events DESC"
    :template-tags start-year-template-tag}])

(defn- collection-items [client collection-id]
  (list-body
   (request! client :get
             (str "/api/collection/" collection-id "/items?models=card&limit=200") nil)))

(defn ensure-question! [client database-id collection-id existing spec]
  (let [payload {:name (:name spec)
                 :description "Provisioned by the version-pinned Restless Pacific bootstrap task."
                 :collection_id collection-id
                 :display (:display spec)
                 :dataset_query {:database database-id
                                 :type "native"
                                 :native {:query (:query spec)
                                          :template-tags (:template-tags spec)}}
                 :visualization_settings (or (:visualization-settings spec) {})}
        card (some #(when (= (:name spec) (:name %)) %) existing)
        saved (if card
                (do
                  (request! client :put (str "/api/card/" (:id card)) payload)
                  (assoc card :id (:id card)))
                (request! client :post "/api/card" payload))]
    (request! client :put (str "/api/card/" (:id saved))
              {:enable_embedding true
               :embedding_params (into {} (map #(vector (keyword %) "enabled"))
                                       (:parameters spec))})
    (assoc saved :resource-key (:key spec)
                 :allowed-parameters (:parameters spec))))

(def dashboard-parameters
  [{:id "region" :slug "region" :name "Region" :type "string/="}
   {:id "start_year" :slug "start_year" :name "Start year" :type "number/="
    :default [1960]}])

(defn ensure-dashboard! [client collection-id cards]
  (let [dashboards (list-body (request! client :get "/api/dashboard" nil))
        name "Restless Pacific — Ring of Fire Data Lab"
        existing (some #(when (and (= name (:name %))
                                   (= collection-id (:collection_id %))) %) dashboards)
        dashboard (or existing
                      (request! client :post "/api/dashboard"
                                {:name name
                                 :description "Six sourced views of Ring of Fire data. Historical trends default to 1960 onward."
                                 :collection_id collection-id
                                 :parameters dashboard-parameters}))
        dashboard-id (:id dashboard)
        current (request! client :get (str "/api/dashboard/" dashboard-id) nil)
        by-card-id (into {} (map (juxt #(or (:card_id %) (get-in % [:card :id])) identity))
                         (:dashcards current))
        dashcards
        (mapv (fn [index card]
                (let [existing-dashcard (get by-card-id (:id card))]
                  {:id (or (:id existing-dashcard) (- (inc index)))
                   :card_id (:id card)
                   :row (* (quot index 2) 6)
                   :col (* (mod index 2) 8)
                   :size_x 8
                   :size_y 6
                   :parameter_mappings
                   (mapv (fn [parameter]
                           {:parameter_id parameter
                            :card_id (:id card)
                            :target ["variable" ["template-tag" parameter]]})
                         (:allowed-parameters card))}))
              (range) cards)]
    (request! client :put (str "/api/dashboard/" dashboard-id)
              {:dashcards dashcards
               :tabs []
               :parameters dashboard-parameters
               :enable_embedding true
               :embedding_params {:region "enabled" :start_year "enabled"}})
    (assoc dashboard :resource-key "ring-of-fire-data-lab"
                     :allowed-parameters ["region" "start_year"])))

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
        dashboard (ensure-dashboard! client (:id collection) cards)]
    (doseq [card cards] (persist-resource! datasource "question" card))
    (persist-resource! datasource "dashboard" dashboard)
    {:databaseId (:id database)
     :collectionId (:id collection)
     :questionIds (mapv :id cards)
     :dashboardId (:id dashboard)}))

(defn -main [& _]
  (let [datasource (hikari/make-datasource (config/db-config))]
    (try
      (println "Metabase bootstrap complete:" (bootstrap! datasource))
      (finally
        (hikari/close-datasource datasource)))))
