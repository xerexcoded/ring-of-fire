(ns restless-pacific.ingest.operations-test
  (:refer-clojure :exclude [run!])
  (:require [clj-http.client :as http]
            [clojure.test :refer [deftest is testing]]
            [hikari-cp.core :as hikari]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]
            [restless-pacific.db]
            [restless-pacific.http-client :as client]
            [restless-pacific.ingest.activate :as activate]
            [restless-pacific.ingest.pipeline :as pipeline])
  (:import (java.net SocketTimeoutException)
           (java.time Instant)))

(deftest default-validation-protects-last-good-data
  (is (false? (:valid? (pipeline/default-validation {:records [] :rejections []}))))
  (let [result (pipeline/default-validation
                {:records (vec (repeat 94 {:ok true}))
                 :rejections (vec (repeat 6 {:bad true}))})]
    (is (false? (:valid? result)))
    (is (= 0.06 (:rejectionRate result))))
  (is (:valid? (pipeline/default-validation
                {:records (vec (repeat 96 {:ok true}))
                 :rejections (vec (repeat 4 {:bad true}))}))))

(deftest http-client-retries-three-times-then-surfaces-timeout
  (let [attempts (atom 0)
        sleeps (atom [])]
    (with-redefs [http/get (fn [& _]
                             (swap! attempts inc)
                             (throw (SocketTimeoutException. "upstream timed out")))]
      (binding [client/*sleep!* #(swap! sleeps conj %)]
        (let [error (try
                      (client/get-text "https://upstream.invalid/data")
                      nil
                      (catch clojure.lang.ExceptionInfo error error))]
          (is error)
          (is (= 3 @attempts))
          (is (= [250 1000] @sleeps))
          (is (= 3 (:attempts (ex-data error))))
          (is (instance? SocketTimeoutException (.getCause error))))))))

(def query-options {:builder-fn rs/as-unqualified-lower-maps})

(defn- test-db-config []
  (when-let [url (System/getenv "TEST_DATABASE_URL")]
    {:jdbc-url url
     :username (or (System/getenv "TEST_DATABASE_USER") "ring_writer")
     :password (or (System/getenv "TEST_DATABASE_PASSWORD") "ring_writer_dev")
     :maximum-pool-size 3}))

(defn- install-test-source! [db]
  (jdbc/execute-one!
   db
   ["INSERT INTO ops.source_dataset
       (source_key, display_name, authority, source_url, refresh_cadence,
        current_version, membership_review_status)
     VALUES ('integration-test-source', 'Integration Test', 'Test suite',
             'https://example.invalid', 'manual', 'baseline', 'not_applicable')
     ON CONFLICT (source_key) DO UPDATE SET current_version='baseline'" ]))

(defn- cleanup-test-source! [db]
  (jdbc/execute-one! db ["DELETE FROM core.story_region WHERE slug LIKE 'integration-%'"])
  (jdbc/execute-one!
   db
   ["DELETE FROM ops.ingestion_run WHERE source_dataset_id=(SELECT id FROM ops.source_dataset WHERE source_key='integration-test-source')"])
  (jdbc/execute-one! db ["DELETE FROM ops.source_dataset WHERE source_key='integration-test-source'"]))

(defn- story-activator [slug title chapter-order]
  (fn [tx _ _ records]
    (jdbc/execute-one!
     tx
     ["INSERT INTO core.story_region
         (slug, title, dek, chapter_order, camera_center_lon, camera_center_lat, camera_zoom)
       VALUES (?, ?, 'Integration test', ?, 0, 0, 1)
       ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title"
      slug title chapter-order])
    (count records)))

(deftest transactional-last-good-idempotence-and-advisory-lock
  (if-let [config (test-db-config)]
    (let [datasource (hikari/make-datasource config)]
      (try
        (install-test-source! datasource)
        (testing "activation failure rolls back domain and source version"
          (let [before (:current_version
                        (jdbc/execute-one!
                         datasource
                         ["SELECT current_version FROM ops.source_dataset WHERE source_key='integration-test-source'"]
                         query-options))
                failing-activator
                (fn [tx source-id version records]
                  ((story-activator "integration-rollback" "Must roll back" 997)
                   tx source-id version records)
                  (throw (ex-info "intentional activation failure" {:test true})))]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo #"intentional activation failure"
                 (pipeline/run!
                  datasource
                  {:source-key "integration-test-source"
                   :version "must-not-activate"
                   :published-at (Instant/now)
                   :parsed {:records [{:id "failure"}] :rejections []}
                   :record-type "integration"
                   :id-fn :id
                   :activate! failing-activator})))
            (is (= before
                   (:current_version
                    (jdbc/execute-one!
                     datasource
                     ["SELECT current_version FROM ops.source_dataset WHERE source_key='integration-test-source'"]
                     query-options))))
            (is (= 0 (:count
                      (jdbc/execute-one!
                       datasource
                       ["SELECT count(*) count FROM core.story_region WHERE slug='integration-rollback'"]
                       query-options))))))
        (testing "replaying the same normalized record is idempotent"
          (let [request {:source-key "integration-test-source"
                         :version "idempotent-v1"
                         :published-at (Instant/now)
                         :parsed {:records [{:id "same-record"}] :rejections []}
                         :record-type "integration"
                         :id-fn :id
                         :activate! (story-activator "integration-idempotent" "One row" 998)}]
            (is (= :succeeded (:status (pipeline/run! datasource request))))
            (is (= :succeeded (:status (pipeline/run! datasource request))))
            (is (= 1 (:count
                      (jdbc/execute-one!
                       datasource
                       ["SELECT count(*) count FROM core.story_region WHERE slug='integration-idempotent'"]
                       query-options))))))
        (testing "a contending advisory lock skips without activating"
          (jdbc/with-transaction [locker datasource]
            (jdbc/execute-one!
             locker
             ["SELECT pg_advisory_xact_lock(hashtext('integration-test-source'))"])
            (let [result
                  (pipeline/run!
                   datasource
                   {:source-key "integration-test-source"
                    :version "locked-v2"
                    :published-at (Instant/now)
                    :parsed {:records [{:id "locked"}] :rejections []}
                    :record-type "integration"
                    :id-fn :id
                    :activate! (story-activator "integration-locked" "No row" 999)})]
              (is (= :skipped-locked (:status result)))
              (is (= 0 (:count
                        (jdbc/execute-one!
                         datasource
                         ["SELECT count(*) count FROM core.story_region WHERE slug='integration-locked'"]
                         query-options)))))))
        (finally
          (cleanup-test-source! datasource)
          (hikari/close-datasource datasource))))
    (is true "Set TEST_DATABASE_URL to run transactional ingestion tests.")))

(deftest gvp-refresh-does-not-erase-curated-descriptions
  (if-let [config (test-db-config)]
    (let [datasource (hikari/make-datasource config)
          record {:volcano-number 999999
                  :name "Integration Volcano"
                  :slug "integration-volcano-999999"
                  :country "Test"
                  :subregion "Integration Volcanic Arc"
                  :volcano-type "Stratovolcano"
                  :tectonic-setting "Test setting"
                  :evidence-category "Test evidence"
                  :elevation-m 100
                  :last-eruption-year 2000
                  :longitude 0.0
                  :latitude 0.0}]
      (try
        (jdbc/with-transaction [tx datasource {:rollback-only true}]
          (let [source-id (:id (jdbc/execute-one!
                                tx
                                ["SELECT id FROM ops.source_dataset WHERE source_key='gvp'"]
                                query-options))]
            (activate/gvp-volcanoes! tx source-id "test" [(assoc record :description "Curated context")])
            (activate/gvp-volcanoes! tx source-id "test" [(assoc record :description nil)])
            (is (= "Curated context"
                   (:description
                    (jdbc/execute-one!
                     tx
                     ["SELECT description FROM core.volcano WHERE volcano_number=999999"]
                     query-options))))))
        (finally
          (hikari/close-datasource datasource))))
    (is true "Set TEST_DATABASE_URL to verify curated-description preservation.")))
