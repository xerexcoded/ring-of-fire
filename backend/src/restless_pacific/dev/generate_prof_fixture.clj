(ns restless-pacific.dev.generate-prof-fixture
  "Maintainer-only generator for the pinned offline PROF catalog fixture.

  Usage:
    clojure -M -m restless-pacific.dev.generate-prof-fixture
      /tmp/gvp-detailed.json /tmp/gvp-e3.json resources/fixtures/gvp-prof-5.3.6.tsv"
  (:gen-class)
  (:require [cheshire.core :as json]
            [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [restless-pacific.ingest.gvp :as gvp]
            [restless-pacific.ingest.membership :as membership]
            [restless-pacific.ingest.pipeline :as pipeline]))

(def columns
  [[:volcano-number "volcano_number"]
   [:name "name"]
   [:country "country"]
   [:subregion "volcanic_region"]
   [:volcano-type "volcano_type"]
   [:tectonic-setting "tectonic_setting"]
   [:evidence-category "evidence_category"]
   [:elevation-m "elevation_m"]
   [:last-eruption-year "last_eruption_year"]
   [:longitude "longitude"]
   [:latitude "latitude"]])

(defn canonical-id-text [records]
  (apply str (map #(str (:volcano-number %) "\n")
                  (sort-by :volcano-number records))))

(defn- canonical-ids [definition]
  (let [resource (or (io/resource (:included-ids-resource definition))
                     (throw (ex-info "Reviewed PROF ID resource is missing."
                                     {:resource (:included-ids-resource definition)})))]
    (->> (str/split-lines (slurp resource))
         (remove str/blank?)
         (mapv parse-long))))

(defn build-records [detailed-feed e3-feed]
  (let [definition (membership/load-definition)
        missing-regions (:detailed-wfs-missing-regions definition)
        detailed (:records (gvp/parse-volcanoes detailed-feed))
        detailed-by-id (into {} (map (juxt :volcano-number identity)) detailed)
        e3-by-id (into {} (map (juxt :volcano-number identity))
                       (:records (gvp/parse-e3-volcanoes e3-feed)))
        records
        (mapv
         (fn [volcano-number]
           (let [e3 (or (get e3-by-id volcano-number)
                        (throw (ex-info "Reviewed volcano is missing from the E3 catalog."
                                        {:volcano-number volcano-number})))
                 detailed-record (get detailed-by-id volcano-number)
                 record (merge e3 detailed-record)
                 region (or (:subregion record) (get missing-regions volcano-number))]
             (when-not region
               (throw (ex-info "Reviewed volcano has no authoritative PROF region."
                               {:volcano-number volcano-number})))
             (assoc record :subregion region)))
         (canonical-ids definition))]
    records))

(defn validate! [records]
  (let [definition (membership/load-definition)
        counts (frequencies (map :subregion records))
        id-hash (pipeline/sha256 (canonical-id-text records))]
    (when-not (= (:expected-volcano-count definition) (count records))
      (throw (ex-info "Generated PROF catalog count does not match the pinned definition."
                      {:actual (count records)})))
    (when-not (= (:volcano-counts-by-region definition) counts)
      (throw (ex-info "Generated PROF per-region counts do not match the FAQ."
                      {:actual counts})))
    (when-not (= (:included-id-sha256 definition) id-hash)
      (throw (ex-info "Generated PROF ID checksum does not match reviewed membership."
                      {:actual id-hash})))
    records))

(defn -main [& [detailed-path e3-path output-path]]
  (when-not (and detailed-path e3-path output-path)
    (throw (ex-info "Expected detailed JSON, E3 JSON, and output TSV paths." {})))
  (let [records
        (validate!
         (build-records (json/parse-string (slurp detailed-path) true)
                        (json/parse-string (slurp e3-path) true)))]
    (with-open [writer (io/writer output-path)]
      (csv/write-csv
       writer
       (cons (mapv second columns)
             (map (fn [record]
                    (mapv (fn [[key _]] (or (get record key) "")) columns))
                  records))
       :separator \tab))
    (println "Wrote" (count records) "reviewed PROF rows to" output-path)))
