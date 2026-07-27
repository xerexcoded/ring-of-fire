(ns restless-pacific.dev.generate-holocene-fixture
  "Maintainer-only generator for the pinned global Holocene volcano fixture.

  The detailed GVP layer has richer fields but omits a small number of records.
  The E3 layer supplies the complete 1,215-row identity set. The reviewed PROF
  fixture is merged last so its reconstructed region assignments remain exact.

  Usage:
    clojure -M -m restless-pacific.dev.generate-holocene-fixture
      /tmp/gvp-detailed.json /tmp/gvp-e3.json
      resources/fixtures/gvp-holocene-5.3.6.tsv"
  (:gen-class)
  (:require [cheshire.core :as json]
            [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [restless-pacific.ingest.gvp :as gvp]
            [restless-pacific.ingest.pipeline :as pipeline]
            [restless-pacific.ingest.prof-fixture :as prof-fixture]))

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

(defn build-records [detailed-feed e3-feed]
  (let [detailed-by-id
        (into {} (map (juxt :volcano-number identity))
              (:records (gvp/parse-volcanoes detailed-feed)))
        reviewed-by-id
        (into {} (map (juxt :volcano-number identity))
              (prof-fixture/load-records))
        e3-records (:records (gvp/parse-e3-volcanoes e3-feed))]
    (->> e3-records
         (map (fn [record]
                (merge record
                       (get detailed-by-id (:volcano-number record))
                       (get reviewed-by-id (:volcano-number record)))))
         (sort-by :volcano-number)
         vec)))

(defn validate! [records]
  (let [ids (map :volcano-number records)
        reviewed-ids (set (map :volcano-number (prof-fixture/load-records)))
        actual-ids (set ids)]
    (when-not (= 1215 (count records) (count actual-ids))
      (throw (ex-info "Global Holocene fixture must contain 1,215 unique volcanoes."
                      {:rows (count records) :unique-ids (count actual-ids)})))
    (when-not (every? actual-ids reviewed-ids)
      (throw (ex-info "Global Holocene fixture must contain every reviewed PROF member."
                      {:missing (sort (remove actual-ids reviewed-ids))})))
    (doseq [{:keys [volcano-number name longitude latitude]} records]
      (when-not (and volcano-number name longitude latitude)
        (throw (ex-info "Global Holocene row is missing identity or coordinates."
                        {:volcano-number volcano-number}))))
    {:records records
     :id-sha256 (pipeline/sha256 (canonical-id-text records))}))

(defn -main [& [detailed-path e3-path output-path]]
  (when-not (and detailed-path e3-path output-path)
    (throw (ex-info "Expected detailed JSON, E3 JSON, and output TSV paths." {})))
  (let [{:keys [records id-sha256]}
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
    (println "Wrote" (count records) "global Holocene rows to" output-path)
    (println "Canonical volcano ID SHA-256:" id-sha256)))
