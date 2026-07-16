(ns restless-pacific.ingest.parsers-test
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.test :refer [deftest is testing]]
            [restless-pacific.ingest.gvp :as gvp]
            [restless-pacific.ingest.membership :as membership]
            [restless-pacific.ingest.noaa :as noaa]
            [restless-pacific.ingest.plate :as plate]
            [restless-pacific.ingest.prof-fixture :as prof-fixture]
            [restless-pacific.ingest.usgs :as usgs]))

(defn- fixture [name]
  (slurp (io/resource (str "fixtures/" name))))

(defn- json-fixture [name]
  (json/parse-string (fixture name) true))

(deftest gvp-volcano-parser-rejects-invalid-coordinates
  (let [{:keys [records rejections]} (gvp/parse-volcanoes (json-fixture "gvp-volcanoes.geojson"))
        taupo (first records)]
    (is (= 1 (count records)))
    (is (= 1 (count rejections)))
    (is (= 241070 (:volcano-number taupo)))
    (is (= "taupo-241070" (:slug taupo)))
    (is (= [175.57 -38.82] [(:longitude taupo) (:latitude taupo)]))))

(deftest gvp-eruption-parser-preserves-bce-partial-dates-and-null-vei
  (let [{:keys [records rejections]} (gvp/parse-eruptions (json-fixture "gvp-eruptions.geojson"))
        ancient (first records)
        modern (second records)]
    (is (empty? rejections))
    (is (= -1840 (:start-year ancient)))
    (is (nil? (:start-month ancient)))
    (is (nil? (:start-day ancient)))
    (is (nil? (:end-month ancient)))
    (is (nil? (:end-day ancient)))
    (is (nil? (:vei ancient)))
    (is (= "year" (:date-precision ancient)))
    (is (= "day" (:date-precision modern)))
    (is (= 5.7 (:vei modern)))))

(deftest gvp-eruption-refresh-records-orphaned-parent-ids
  (let [parsed (gvp/parse-eruptions (json-fixture "gvp-eruptions.geojson"))
        retained (gvp/retain-known-eruptions parsed #{241070})]
    (is (= [1001] (mapv :eruption-number (:records retained))))
    (is (= 1 (count (:rejections retained))))
    (is (= 243040 (get-in retained [:rejections 0 :raw :volcano-number])))
    (is (re-find #"absent from the activated GVP"
                 (get-in retained [:rejections 0 :reason])))))

(deftest usgs-parser-supports-revisions-deletions-and-dateline
  (let [{:keys [records rejections]} (usgs/parse-feed (json-fixture "usgs-revisions.geojson"))
        event (first records)
        deletion (second records)]
    (is (empty? rejections))
    (is (= 179.9 (:longitude event)))
    (is (false? (:tsunami-flag event)))
    (is (:deleted? deletion))
    (is (nil? (:longitude deletion)))
    (is (= ["missing"]
           (usgs/reconciliation-deletions ["us-test-1" "missing"] ["us-test-1"])))))

(deftest plate-parser-preserves-antimeridian-positions
  (let [record (-> (plate/parse-feed (json-fixture "plates.geojson")) :records first)]
    (is (= "MultiLineString" (get-in record [:geometry :type])))
    (is (= [179.8 -25.0] (get-in record [:geometry :coordinates 0 0])))
    (is (= [-179.7 -24.0] (get-in record [:geometry :coordinates 0 1])))))

(deftest noaa-parser-keeps-partial-and-bce-dates
  (let [{:keys [records rejections]} (noaa/parse-tsv (fixture "noaa-partial.tsv"))
        ancient (first records)]
    (is (empty? rejections))
    (is (= -426 (:event-year ancient)))
    (is (= "year" (:date-precision ancient)))
    (is (nil? (:event-month ancient)))
    (is (= 40.5 (:maximum-water-height-m (second records))))))

(deftest pinned-prof-definition-reproduces-faq-counts
  (let [definition (membership/load-definition)]
    (is (= 41 (count (:regions definition))))
    (is (= (set (:regions definition))
           (set (keys (:volcano-counts-by-region definition)))))
    (is (= 688 (reduce + (vals (:volcano-counts-by-region definition)))))
    (testing "exact reviewed metadata may retain reviewed membership"
      (is (= :approved
             (:status (membership/review-decision
                       {:version "5.3.6"
                        :volcano-count 688
                        :region-names (:regions definition)})))))
    (testing "a live version or region-only count drift requires explicit review"
      (let [decision (membership/review-decision
                      {:version "5.3.7"
                       :volcano-count 685
                       :region-names (:regions definition)})]
        (is (= :review-required (:status decision)))
        (is (false? (:can-activate-membership? decision)))
        (is (:region-only-membership-forbidden? decision))))))

(deftest pinned-prof-catalog-reproduces-exact-reviewed-membership
  (let [definition (membership/load-definition)
        records (prof-fixture/load-records)
        validation (prof-fixture/validate! records)
        ids (set (map :volcano-number records))
        known-detailed-missing (set (keys (:detailed-wfs-missing-regions definition)))
        detailed-records (remove #(contains? known-detailed-missing (:volcano-number %)) records)]
    (is (= 688 (:volcano-count validation)))
    (is (= 41 (:region-count validation)))
    (is (= "efccd415cc6851623f20851af5abd872717e014486e2194453139ab78adf4525"
           (:included-id-sha256 validation)))
    (is (contains? ids 241070) "Taupō is in the reviewed definition.")
    (is (contains? ids 283030) "Fuji is in the reviewed definition.")
    (is (not (contains? ids 284050)) "A reviewed southern Izu exception stays excluded.")
    (is (not (contains? ids 266010)) "A reviewed Sangihe exception stays excluded.")
    (testing "the current detailed WFS shape is approved using exact IDs"
      (is (= :approved
             (:status (membership/catalog-review-decision
                       {:version "5.3.6" :records detailed-records})))))
    (testing "a missing reviewed ID fails closed"
      (is (= :review-required
             (:status (membership/catalog-review-decision
                       {:version "5.3.6" :records (rest detailed-records)})))))))
