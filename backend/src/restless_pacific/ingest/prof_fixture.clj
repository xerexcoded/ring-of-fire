(ns restless-pacific.ingest.prof-fixture
  (:require [cheshire.core :as json]
            [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]
            [restless-pacific.ingest.activate :as activate]
            [restless-pacific.ingest.membership :as membership]
            [restless-pacific.ingest.parse :as parse]
            [restless-pacific.ingest.pipeline :as pipeline]))

(def query-options {:builder-fn rs/as-unqualified-lower-maps})

(def numeric-integers
  #{:volcano_number :elevation_m :last_eruption_year})

(def numeric-decimals #{:longitude :latitude})

(defn- blank->nil [value]
  (when-not (str/blank? value) value))

(defn- parse-row [row]
  (let [row (reduce-kv
             (fn [result key value]
               (assoc result key
                      (cond
                        (contains? numeric-integers key) (parse/integer value)
                        (contains? numeric-decimals key) (parse/decimal value)
                        :else (blank->nil value))))
             {} row)]
    {:volcano-number (:volcano_number row)
     :name (:name row)
     :slug (str (parse/slug (:name row)) "-" (:volcano_number row))
     :country (:country row)
     :subregion (:volcanic_region row)
     :volcano-type (:volcano_type row)
     :tectonic-setting (:tectonic_setting row)
     :evidence-category (:evidence_category row)
     :elevation-m (:elevation_m row)
     :last-eruption-year (:last_eruption_year row)
     :longitude (:longitude row)
     :latitude (:latitude row)}))

(defn- load-resource-records [resource-name]
  (let [resource (or (io/resource resource-name)
                     (throw (ex-info "Pinned PROF catalog resource is missing."
                                     {:resource resource-name})))
        [headers & rows]
        (with-open [reader (io/reader resource)]
          (doall (csv/read-csv reader :separator \tab)))
        headers (mapv keyword headers)]
    (mapv #(parse-row (zipmap headers %)) rows)))

(defn load-records []
  (load-resource-records (:catalog-resource (membership/load-definition))))

(defn load-holocene-records []
  (load-resource-records (:holocene-catalog-resource (membership/load-definition))))

(defn canonical-id-text [records]
  (apply str (map #(str (:volcano-number %) "\n")
                  (sort-by :volcano-number records))))

(defn validate! [records]
  (let [definition (membership/load-definition)
        ids (map :volcano-number records)
        counts (frequencies (map :subregion records))
        hash (pipeline/sha256 (canonical-id-text records))
        exclusions (set (keys (:explicit-exclusions definition)))]
    (when-not (= (:expected-volcano-count definition) (count records) (count (set ids)))
      (throw (ex-info "Pinned PROF catalog must contain 688 unique volcano numbers."
                      {:rows (count records) :unique-ids (count (set ids))})))
    (when-not (= (:volcano-counts-by-region definition) counts)
      (throw (ex-info "Pinned PROF catalog no longer reproduces all 41 FAQ region counts."
                      {:actual counts :expected (:volcano-counts-by-region definition)})))
    (when-not (= (:included-id-sha256 definition) hash)
      (throw (ex-info "Pinned PROF catalog ID checksum failed."
                      {:actual hash :expected (:included-id-sha256 definition)})))
    (when-let [wrong (seq (filter exclusions ids))]
      (throw (ex-info "Pinned PROF catalog contains reviewed exclusions."
                      {:volcano-numbers wrong})))
    (doseq [{:keys [volcano-number name subregion longitude latitude]} records]
      (when-not (and volcano-number name subregion)
        (throw (ex-info "Pinned PROF row is missing identity or region."
                        {:volcano-number volcano-number})))
      (parse/coordinates! [longitude latitude]))
    {:valid? true
     :volcano-count (count records)
     :region-count (count counts)
     :included-id-sha256 hash}))

(defn validate-holocene! [records]
  (let [definition (membership/load-definition)
        ids (map :volcano-number records)
        hash (pipeline/sha256 (canonical-id-text records))
        reviewed-ids (set (map :volcano-number (load-records)))
        actual-ids (set ids)]
    (when-not (= (:expected-holocene-count definition)
                 (count records)
                 (count actual-ids))
      (throw (ex-info "Pinned Holocene catalog must contain 1,215 unique volcano numbers."
                      {:rows (count records) :unique-ids (count actual-ids)})))
    (when-not (= (:holocene-id-sha256 definition) hash)
      (throw (ex-info "Pinned Holocene catalog ID checksum failed."
                      {:actual hash :expected (:holocene-id-sha256 definition)})))
    (when-not (every? actual-ids reviewed-ids)
      (throw (ex-info "Pinned Holocene catalog is missing reviewed PROF members."
                      {:missing (sort (remove actual-ids reviewed-ids))})))
    (doseq [{:keys [volcano-number name longitude latitude]} records]
      (when-not (and volcano-number name)
        (throw (ex-info "Pinned Holocene row is missing identity."
                        {:volcano-number volcano-number})))
      (parse/coordinates! [longitude latitude]))
    {:catalog-volcano-count (count records)
     :catalog-id-sha256 hash}))

(defn activate!
  "Idempotently installs the global offline v5.3.6 catalog and the exact
  reviewed PROF membership in one transaction. Rich showcase
  slugs/descriptions from the SQL seed are preserved."
  [datasource]
  (let [definition (membership/load-definition)
        reviewed-records (load-records)
        holocene-records (load-holocene-records)
        validation (validate! reviewed-records)
        catalog-validation (validate-holocene! holocene-records)]
    (jdbc/with-transaction [tx datasource {:isolation :serializable}]
      (let [source-id (:id (jdbc/execute-one!
                            tx ["SELECT id FROM ops.source_dataset WHERE source_key='gvp'"]
                            query-options))]
        (when-not source-id
          (throw (ex-info "GVP source_dataset must exist before fixture activation." {})))
        (activate/gvp-volcanoes!
         tx source-id (:version definition) holocene-records)
        (jdbc/execute-one!
         tx
         ["DELETE FROM core.ring_membership
           WHERE definition_key=? AND dataset_version=?"
          (:definition-key definition) (:version definition)])
        (doseq [record reviewed-records]
          (jdbc/execute-one!
           tx
           ["INSERT INTO core.ring_membership
               (volcano_number, definition_key, dataset_version, included,
                inclusion_reason, confidence, reviewed_at, source_dataset_id)
             VALUES (?, ?, ?, true,
                     'Included in the reviewed Smithsonian v5.3.6 PROF definition.',
                     'authoritative', ?::timestamptz, ?)"
            (:volcano-number record) (:definition-key definition)
            (:version definition) (:published-at definition) source-id]))
        (jdbc/execute-one!
         tx
         ["UPDATE ops.source_dataset
           SET current_version=?, current_published_at=?::timestamptz,
               last_successful_run_at=COALESCE(last_successful_run_at, now()),
               expected_record_count=?, expected_region_count=?,
               membership_review_status='approved',
               metadata=metadata || ?::jsonb,
               updated_at=now()
           WHERE id=?"
          (:version definition) (:published-at definition)
          (:expected-holocene-count definition) (:expected-region-count definition)
          (json/generate-string
           {:membershipFixture (:catalog-resource definition)
            :holoceneCatalogFixture (:holocene-catalog-resource definition)
            :holoceneVolcanoCount (:expected-holocene-count definition)
            :profVolcanoCount (:expected-volcano-count definition)
            :profRegionCount (:expected-region-count definition)
            :holoceneIdSha256 (:holocene-id-sha256 definition)
            :includedIdSha256 (:included-id-sha256 definition)})
          source-id])
        (let [actual
              (jdbc/execute-one!
               tx
               ["SELECT
                   (SELECT count(*) FROM core.volcano
                     WHERE source_version=?) catalog_count,
                   count(*) count,
                   count(DISTINCT v.volcanic_region_id) region_count
                 FROM core.ring_membership rm
                 JOIN core.volcano v USING (volcano_number)
                 WHERE rm.definition_key=? AND rm.dataset_version=? AND rm.included"
                (:version definition)
                (:definition-key definition) (:version definition)]
               query-options)]
          (when-not (= [1215 688 41]
                       [(:catalog_count actual) (:count actual) (:region_count actual)])
            (throw (ex-info "Transactional PROF activation count assertion failed."
                            {:actual actual}))))))
    (merge validation catalog-validation)))
