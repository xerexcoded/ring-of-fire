(ns restless-pacific.ingest.membership
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.set :as set]
            [clojure.string :as str]
            [restless-pacific.ingest.pipeline :as pipeline]))

(def fixture-resource "fixtures/gvp-prof-5.3.6.edn")

(defn load-definition []
  (-> fixture-resource io/resource slurp edn/read-string))

(defn load-reviewed-ids
  "Loads and verifies the exact, LF-terminated volcano-number set. Membership
  must come from this reviewed artifact, never from a region-name predicate."
  []
  (let [definition (load-definition)
        resource-name (:included-ids-resource definition)
        resource (or (io/resource resource-name)
                     (throw (ex-info "Reviewed PROF ID resource is missing."
                                     {:resource resource-name})))
        text (slurp resource)
        ids (->> (str/split-lines text)
                 (remove str/blank?)
                 (mapv parse-long))]
    (when-not (= (:expected-volcano-count definition) (count ids) (count (set ids)))
      (throw (ex-info "Reviewed PROF ID resource must contain 688 unique IDs."
                      {:rows (count ids) :unique-ids (count (set ids))})))
    (when-not (= (:included-id-sha256 definition) (pipeline/sha256 text))
      (throw (ex-info "Reviewed PROF ID resource checksum failed."
                      {:actual (pipeline/sha256 text)
                       :expected (:included-id-sha256 definition)})))
    ids))

(defn catalog-review-decision
  "Checks a detailed GVP WFS refresh against the exact reviewed ID artifact.
  Sixteen reviewed E3 records are intentionally absent from this detailed WFS;
  any change to that availability, the version, or region totals requires a
  human membership review. This never derives membership from regions."
  [{:keys [version records]}]
  (let [{expected-version :version
         expected-counts :volcano-counts-by-region
         expected-missing :detailed-wfs-missing-regions} (load-definition)
        reviewed-ids (set (load-reviewed-ids))
        records-by-id (into {} (map (juxt :volcano-number identity)) records)
        actual-ids (set (keys records-by-id))
        missing-reviewed (set/difference reviewed-ids actual-ids)
        expected-missing-ids (set (keys expected-missing))
        reviewed-regions
        (frequencies
         (keep (fn [volcano-number]
                 (or (:subregion (get records-by-id volcano-number))
                     (get expected-missing volcano-number)))
               reviewed-ids))
        reasons (cond-> []
                  (not= version expected-version)
                  (conj {:code :upstream-version-changed
                         :expected expected-version :actual version})

                  (not= missing-reviewed expected-missing-ids)
                  (conj {:code :reviewed-id-availability-changed
                         :expected-detailed-missing (sort expected-missing-ids)
                         :actual-detailed-missing (sort missing-reviewed)})

                  (not= reviewed-regions expected-counts)
                  (conj {:code :reviewed-region-counts-changed
                         :expected expected-counts :actual reviewed-regions}))]
    {:status (if (seq reasons) :review-required :approved)
     :can-activate-volcano-data? true
     :can-activate-membership? (empty? reasons)
     :region-only-membership-forbidden? true
     :reviewed-volcano-count (count reviewed-ids)
     :reasons reasons}))

(defn review-decision
  "Compares upstream metadata to the reviewed PROF definition. This function does
  not infer volcano membership from region names: the GVP definition has
  volcano-level exclusions inside included regions."
  [{:keys [version volcano-count region-names]}]
  (let [{expected-version :version
         expected-count :expected-volcano-count
         expected-regions :regions} (load-definition)
        actual-regions (set region-names)
        required-regions (set expected-regions)
        reasons (cond-> []
                  (not= version expected-version)
                  (conj {:code :upstream-version-changed
                         :expected expected-version :actual version})

                  (not= volcano-count expected-count)
                  (conj {:code :volcano-count-changed
                         :expected expected-count :actual volcano-count})

                  (not= actual-regions required-regions)
                  (conj {:code :region-set-changed
                         :missing (sort (set/difference required-regions actual-regions))
                         :unexpected (sort (set/difference actual-regions required-regions))}))]
    {:status (if (seq reasons) :review-required :approved)
     :can-activate-volcano-data? true
     :can-activate-membership? (empty? reasons)
     :region-only-membership-forbidden? true
     :reasons reasons}))
