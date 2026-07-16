(ns restless-pacific.task.ingest
  (:gen-class)
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [hikari-cp.core :as hikari]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]
            [restless-pacific.config :as config]
            [restless-pacific.db :as db]
            [restless-pacific.http-client :as client]
            [restless-pacific.ingest.activate :as activate]
            [restless-pacific.ingest.gvp :as gvp]
            [restless-pacific.ingest.membership :as membership]
            [restless-pacific.ingest.noaa :as noaa]
            [restless-pacific.ingest.pipeline :as pipeline]
            [restless-pacific.ingest.plate :as plate]
            [restless-pacific.ingest.prof-fixture :as prof-fixture]
            [restless-pacific.ingest.usgs :as usgs])
  (:import (java.time Instant LocalDate)
           (java.time.temporal ChronoUnit)))

(def gvp-volcano-url
  "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json")

(def gvp-eruption-url
  "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions&outputFormat=application/json")

(def usgs-url
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson")

(def usgs-fdsn-url
  "https://earthquake.usgs.gov/fdsnws/event/1/query")

(def plate-url
  "https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson")

(defn- env [name default]
  (or (System/getenv name) default))

(defn- query-url [base parameters]
  (str base "?"
       (->> parameters
            (remove (comp nil? val))
            (map (fn [[key value]]
                   (str (java.net.URLEncoder/encode (name key) "UTF-8") "="
                        (java.net.URLEncoder/encode (str value) "UTF-8"))))
            (str/join "&"))))

(defn- parse-instant [value]
  (cond
    (nil? value) nil
    (number? value) (Instant/ofEpochMilli (long value))
    :else (Instant/parse (str value))))

(defn seed! [datasource]
  (db/migrate! datasource)
  (let [fixture-validation (prof-fixture/activate! datasource)
        definition (membership/load-definition)
        region-count (count (:regions definition))
        counts (:volcano-counts-by-region definition)
        reproduced-total (reduce + (vals counts))
        summary (jdbc/execute-one!
                 datasource
                 ["SELECT
                     (SELECT count(*) FROM core.volcanic_region WHERE source_version='5.3.6') region_count,
                     (SELECT count(*) FROM core.ring_membership
                       WHERE definition_key='smithsonian-prof' AND dataset_version='5.3.6'
                         AND included) membership_volcano_count,
                     (SELECT count(DISTINCT v.volcanic_region_id)
                        FROM core.ring_membership rm
                        JOIN core.volcano v USING (volcano_number)
                       WHERE rm.definition_key='smithsonian-prof' AND rm.dataset_version='5.3.6'
                         AND rm.included) membership_region_count,
                     (SELECT count(*) FROM core.volcano
                       WHERE slug IN ('taupo', 'hunga-tonga-hunga-haapai', 'mayon', 'fuji',
                                      'klyuchevskoy', 'mount-st-helens', 'popocatepetl', 'fuego',
                                      'nevado-del-ruiz', 'villarrica')) showcase_volcano_count,
                     (SELECT count(*) FROM core.story_region) story_region_count"])]
    (when-not (= 41 region-count (:expected-region-count definition))
      (throw (ex-info "Pinned GVP definition does not contain 41 unique region names."
                      {:fixture-count region-count
                       :expected (:expected-region-count definition)})))
    (when-not (= 688 (:expected-volcano-count definition))
      (throw (ex-info "Pinned GVP expected volcano count changed without review."
                      {:expected (:expected-volcano-count definition)})))
    (when-not (= (set (:regions definition)) (set (keys counts)))
      (throw (ex-info "Every reviewed GVP region must have exactly one FAQ count."
                      {:missing (set/difference (set (:regions definition))
                                               (set (keys counts)))
                       :unexpected (set/difference (set (keys counts))
                                                  (set (:regions definition)))})))
    (when-not (= 688 reproduced-total)
      (throw (ex-info "Pinned GVP per-region counts no longer reproduce 688 volcanoes."
                      {:actual reproduced-total :expected 688})))
    (when-not (= 41 (long (:region_count summary)))
      (throw (ex-info "Seed migration must produce all 41 reviewed GVP regions."
                      {:actual (:region_count summary) :expected 41})))
    (when-not (= 688 (long (:membership_volcano_count summary)))
      (throw (ex-info "Offline seed must install all 688 reviewed PROF members."
                      {:actual (:membership_volcano_count summary) :expected 688})))
    (when-not (= 41 (long (:membership_region_count summary)))
      (throw (ex-info "Offline PROF membership must span all 41 reviewed regions."
                      {:actual (:membership_region_count summary) :expected 41})))
    (when-not (= 10 (long (:showcase_volcano_count summary)))
      (throw (ex-info "Seed migration must produce the ten showcase volcanoes."
                      {:actual (:showcase_volcano_count summary) :expected 10})))
    (when-not (= 6 (long (:story_region_count summary)))
      (throw (ex-info "Seed migration must produce the six editorial chapters."
                      {:actual (:story_region_count summary) :expected 6})))
    (println "Seed verified:" summary
             "Fixture:" fixture-validation
             "Pinned PROF definition:" (:version definition)
             (:expected-volcano-count definition) "volcanoes across"
             (:expected-region-count definition) "regions.")))

(defn ingest-gvp! [datasource]
  (let [version (env "GVP_EXPECTED_VERSION" "5.3.6")
        volcano-feed (client/get-json (env "GVP_VOLCANO_URL" gvp-volcano-url))
        eruption-feed (client/get-json (env "GVP_ERUPTION_URL" gvp-eruption-url))
        volcanoes (gvp/parse-volcanoes volcano-feed)
        parsed-eruptions (gvp/parse-eruptions eruption-feed)
        decision (membership/catalog-review-decision
                  {:version version
                   :records (:records volcanoes)})
        review-status (if (= :approved (:status decision)) "approved" "review_required")
        published-at (parse-instant (or (:timeStamp volcano-feed) (:timestamp volcano-feed)))
        volcano-result
        (pipeline/run! datasource
                       {:source-key "gvp"
                        :version version
                        :published-at published-at
                        :parsed volcanoes
                        :record-type "gvp-volcano"
                        :id-fn :volcano-number
                        :activate! activate/gvp-volcanoes!
                        :membership-review-status review-status})
        known-volcano-numbers
        (->> (jdbc/execute! datasource ["SELECT volcano_number FROM core.volcano"]
                            {:builder-fn rs/as-unqualified-lower-maps})
             (map :volcano_number)
             set)
        eruptions (gvp/retain-known-eruptions parsed-eruptions known-volcano-numbers)]
    (when (= "review_required" review-status)
      (binding [*out* *err*]
        (println "GVP membership requires review; volcano data may refresh, but ring_membership is unchanged:"
                 (:reasons decision))))
    {:volcanoes volcano-result
     :eruptions
     (pipeline/run! datasource
                    {:source-key "gvp"
                     :version version
                     :published-at published-at
                     :parsed eruptions
                     :record-type "gvp-eruption"
                     :id-fn :eruption-number
                     :activate! activate/gvp-eruptions!
                     :membership-review-status review-status})
     :membership-review decision}))

(defn ingest-usgs! [datasource]
  (let [feed (client/get-json (env "USGS_FEED_URL" usgs-url))
        parsed (usgs/parse-feed feed)
        generated (get-in feed [:metadata :generated])
        version (str "generated-" generated)]
    (pipeline/run! datasource
                   {:source-key "usgs-earthquakes"
                    :version version
                    :published-at (parse-instant generated)
                    :parsed parsed
                    :record-type "usgs-earthquake"
                    :id-fn :event-id
                    :activate! activate/usgs-earthquakes!})))

(defn- ingest-usgs-window!
  [datasource {:keys [start end minimum-magnitude reconcile?]}]
  (let [url (query-url (env "USGS_FDSN_URL" usgs-fdsn-url)
                       {:format "geojson"
                        :starttime start
                        :endtime end
                        :minmagnitude minimum-magnitude
                        :orderby "time-asc"
                        :limit 20000})
        feed (client/get-json url)
        parsed (usgs/parse-feed feed)
        generated (get-in feed [:metadata :generated])
        version (str "fdsn-" start "-" end "-" generated)
        upstream-ids (set (map :event-id (:records parsed)))
        activation
        (if reconcile?
          (fn [tx source-id source-version records]
            (let [upserted (activate/usgs-earthquakes! tx source-id source-version records)
                  stored (map :event_id
                              (jdbc/execute!
                               tx
                               ["SELECT event_id FROM core.earthquake
                                 WHERE occurred_at >= ? AND occurred_at < ?
                                   AND magnitude >= ? AND NOT is_deleted"
                                (Instant/parse start) (Instant/parse end) minimum-magnitude]))
                  missing (usgs/reconciliation-deletions stored upstream-ids)]
              (activate/reconcile-earthquake-deletions!
               tx source-version (Instant/parse start) (Instant/parse end) missing)
              upserted))
          activate/usgs-earthquakes!)]
    (when (= 20000 (count (:records parsed)))
      (throw (ex-info "USGS window reached the 20,000 event cap; split the window before activation."
                      {:start start :end end :minimum-magnitude minimum-magnitude})))
    (pipeline/run! datasource
                   {:source-key "usgs-earthquakes"
                    :version version
                    :published-at (parse-instant generated)
                    :parsed parsed
                    :record-type (if reconcile? "usgs-reconciliation" "usgs-historical")
                    :id-fn :event-id
                    :activate! activation})))

(defn reconcile-usgs! [datasource]
  (let [days (Long/parseLong (env "USGS_RECONCILE_DAYS" "7"))
        end (Instant/now)
        start (.minus end days ChronoUnit/DAYS)]
    (ingest-usgs-window! datasource
                         {:start (str start)
                          :end (str end)
                          :minimum-magnitude (Double/parseDouble
                                              (env "USGS_MIN_MAGNITUDE" "2.5"))
                          :reconcile? true})))

(defn backfill-usgs! [datasource]
  (let [start-year (Integer/parseInt (subs (env "USGS_HISTORY_START" "1960-01-01") 0 4))
        final-year (.getYear (LocalDate/now))]
    (mapv (fn [year]
            (let [start (str (LocalDate/of year 1 1) "T00:00:00Z")
                  end (str (LocalDate/of (inc year) 1 1) "T00:00:00Z")]
              (println "Backfilling USGS M5+ window" start "to" end)
              (ingest-usgs-window! datasource
                                   {:start start :end end
                                    :minimum-magnitude 5.0
                                    :reconcile? false})))
          (range start-year (inc final-year)))))

(defn ingest-plates! [datasource]
  (let [feed (client/get-json (env "USGS_PLATE_URL" plate-url))
        parsed (plate/parse-feed feed)
        version (env "USGS_PLATE_VERSION" (str (java.time.LocalDate/now)))]
    (pipeline/run! datasource
                   {:source-key "usgs-plates"
                    :version version
                    :published-at (Instant/now)
                    :parsed parsed
                    :record-type "usgs-plate-boundary"
                    :id-fn :boundary-id
                    :activate! activate/plates!})))

(defn ingest-noaa! [datasource]
  (let [url (System/getenv "NOAA_TSV_URL")]
    (when-not url
      (throw (ex-info "NOAA_TSV_URL is required for live NOAA ingestion."
                      {:environment-variable "NOAA_TSV_URL"})))
    (let [body (client/get-text url)
          parsed (noaa/parse-tsv body)
          version (env "NOAA_DATASET_VERSION" (str (java.time.LocalDate/now)))]
      (pipeline/run! datasource
                     {:source-key "noaa-tsunami"
                      :version version
                      :published-at (Instant/now)
                      :checksum (pipeline/sha256 body)
                      :parsed parsed
                      :record-type "noaa-tsunami"
                      :id-fn :event-id
                      :activate! activate/noaa-tsunamis!}))))

(defn run-command! [datasource command]
  (case command
    "seed" (seed! datasource)
    "gvp" (ingest-gvp! datasource)
    "usgs" (ingest-usgs! datasource)
    "usgs-reconcile" (reconcile-usgs! datasource)
    "usgs-history" (backfill-usgs! datasource)
    "plates" (ingest-plates! datasource)
    "noaa" (ingest-noaa! datasource)
    "all" {:gvp (ingest-gvp! datasource)
           :usgs (ingest-usgs! datasource)
           :plates (ingest-plates! datasource)
           :noaa (if (System/getenv "NOAA_TSV_URL")
                   (ingest-noaa! datasource)
                   {:status :skipped :reason "NOAA_TSV_URL is not configured."})}
    (throw (ex-info "Usage: clojure -M:ingest [seed|gvp|usgs|usgs-reconcile|usgs-history|plates|noaa|all]"
                    {:command command}))))

(defn -main [& [command]]
  (let [datasource (hikari/make-datasource (config/db-config))]
    (try
      (println (run-command! datasource (or command "seed")))
      (finally
        (hikari/close-datasource datasource)))))
