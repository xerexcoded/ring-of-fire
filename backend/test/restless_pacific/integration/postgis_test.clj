(ns restless-pacific.integration.postgis-test
  (:require [clojure.test :refer [deftest is testing]]
            [hikari-cp.core :as hikari]
            [next.jdbc :as jdbc]
            [restless-pacific.repository.atlas :as repo]))

(defn- integration-config []
  (when-let [url (System/getenv "TEST_DATABASE_URL")]
    {:jdbc-url url
     :username (or (System/getenv "TEST_DATABASE_USER") "ring_writer")
     :password (or (System/getenv "TEST_DATABASE_PASSWORD") "ring_writer_dev")
     :maximum-pool-size 2}))

(deftest postgis-bounds-vei-and-derived-proximity
  (if-let [config (integration-config)]
    (let [datasource (hikari/make-datasource config)]
      (try
        (let [features (repo/volcanoes
                        datasource
                        {:bbox {:west 130.0 :south 30.0 :east 150.0 :north 40.0
                                :crosses-dateline? false}
                         :limit 10 :offset 0 :min-vei 5.0})
              fuji (some #(when (= "fuji" (get-in % [:properties :slug])) %) features)
              profile (repo/volcano datasource 283030)]
          (is fuji)
          (is (= "5.3.6" (get-in fuji [:properties :source :version])))
          (is (re-matches #".*Z" (get-in fuji [:properties :source :refreshedAt])))
          (is (number? (get-in profile [:nearbyBoundary :distanceKm])))
          (is (re-find #"not establish causal"
                       (get-in profile [:nearbyBoundary :interpretation])))
          (is (= 688
                 (count (repo/volcanoes
                         datasource
                         {:bbox {:west -180.0 :south -90.0 :east 180.0 :north 90.0
                                 :crosses-dateline? false}
                          :limit 1000 :offset 0})))
              "The offline seed exposes every reviewed Smithsonian PROF member."))
        (finally
          (hikari/close-datasource datasource))))
    (is true "Set TEST_DATABASE_URL to run PostGIS integration assertions.")))

(deftest metabase-role-is-analytics-only
  (if (and (System/getenv "TEST_DATABASE_URL")
           (System/getenv "TEST_METABASE_READER_PASSWORD"))
    (let [datasource
          (hikari/make-datasource
           {:jdbc-url (System/getenv "TEST_DATABASE_URL")
            :username "metabase_reader"
            :password (System/getenv "TEST_METABASE_READER_PASSWORD")
            :maximum-pool-size 1})]
      (try
        (is (some? (jdbc/execute-one! datasource ["SELECT count(*) FROM analytics.volcanoes"])))
        (let [boundary (jdbc/execute-one!
                        datasource
                        ["SELECT boundary_type, length_km FROM analytics.plate_boundaries ORDER BY boundary_id LIMIT 1"])]
          (is (string? (:plate_boundaries/boundary_type boundary)))
          (is (pos? (:plate_boundaries/length_km boundary))))
        (is (thrown? org.postgresql.util.PSQLException
                     (jdbc/execute-one! datasource ["SELECT count(*) FROM core.volcano"])))
        (is (thrown? org.postgresql.util.PSQLException
                     (jdbc/execute-one! datasource ["SELECT count(*) FROM ops.source_dataset"])))
        (is (thrown? org.postgresql.util.PSQLException
                     (jdbc/execute-one! datasource
                                        ["INSERT INTO analytics.volcanoes (volcano_number) VALUES (1)"])))
        (finally
          (hikari/close-datasource datasource))))
    (is true "Set TEST_METABASE_READER_PASSWORD to verify minimum privilege.")))
