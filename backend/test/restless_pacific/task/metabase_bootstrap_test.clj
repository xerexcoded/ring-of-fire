(ns restless-pacific.task.metabase-bootstrap-test
  (:require [clojure.test :refer [deftest is testing]]
            [next.jdbc :as jdbc]
            [restless-pacific.task.metabase-bootstrap :as bootstrap]))

(def test-dashboard-specs
  (bootstrap/dashboard-specs ["Taupo Volcanic Arc" "Tofua Volcanic Arc"]
                             ["Earthquake" "Volcano"]))

(deftest bootstrap-defines-sixteen-questions-and-four-dashboards
  (let [question-keys (mapv :key bootstrap/question-specs)
        dashboard-keys (mapv :key test-dashboard-specs)
        placed-keys (mapcat :question-keys test-dashboard-specs)]
    (is (= 16 (count question-keys)))
    (is (= 16 (count (set question-keys))))
    (is (= 16 (count (set (map :name bootstrap/question-specs)))))
    (is (= ["ring-of-fire-data-lab"
            "volcano-eruption-data-lab"
            "earthquake-plate-data-lab"
            "tsunami-impact-data-lab"]
           dashboard-keys))
    (is (every? #(= 4 (count (:question-keys %))) test-dashboard-specs))
    (is (= (set question-keys) (set placed-keys)))
    (doseq [dashboard test-dashboard-specs
            question-key (:question-keys dashboard)]
      (let [{:keys [col size_x]} (get-in dashboard [:layout question-key])]
        (is (<= (+ col size_x) 24))))))

(deftest historical-questions-default-to-1960
  (let [historical (filter #(some #{"start_year"} (:parameters %))
                           bootstrap/question-specs)]
    (is (= 6 (count historical)))
    (doseq [question historical]
      (is (re-find #"\{\{start_year\}\}" (:query question)))
      (is (= 1960 (get-in question [:template-tags :start_year :default]))))))

(deftest charts-pin-required-axes-and-map-density
  (let [by-key (into {} (map (juxt :key identity)) bootstrap/question-specs)]
    (is (= {:graph.dimensions ["decade"] :graph.metrics ["eruptions"]}
           (:visualization-settings (by-key "eruptions-by-decade"))))
    (is (= {:graph.dimensions ["vei"] :graph.metrics ["eruptions"]}
           (:visualization-settings (by-key "vei-distribution"))))
    (doseq [key ["pacific-observation-density" "earthquake-density" "tsunami-density"]]
      (is (= "grid" (get-in by-key [key :visualization-settings :map.type])))
      (is (= "latitude" (get-in by-key [key :visualization-settings :map.latitude_column])))
      (is (= "longitude" (get-in by-key [key :visualization-settings :map.longitude_column]))))))

(deftest volcano-and-eruption-questions-use-reviewed-prof-membership
  (let [by-key (into {} (map (juxt :key identity)) bootstrap/question-specs)]
    (is (re-find #"WHERE in_smithsonian_prof"
                 (:query (by-key "volcanoes-by-region-type"))))
    (is (re-find #"WHERE in_smithsonian_prof"
                 (:query (by-key "membership-by-region"))))
    (doseq [key ["eruptions-by-decade" "vei-distribution"]]
      (is (re-find #"JOIN analytics\.volcanoes v"
                   (:query (by-key key))))
      (is (re-find #"v\.in_smithsonian_prof"
                   (:query (by-key key)))))))

(deftest dashboard-filters-use-deterministic-native-values
  (let [by-key (into {} (map (juxt :key identity)) test-dashboard-specs)
        volcano-parameters (:parameters (by-key "volcano-eruption-data-lab"))
        seismic-parameters (:parameters (by-key "earthquake-plate-data-lab"))
        tsunami-parameters (:parameters (by-key "tsunami-impact-data-lab"))]
    (is (= ["Taupo Volcanic Arc" "Tofua Volcanic Arc"]
           (get-in volcano-parameters [0 :values_source_config :values])))
    (is (= 1960 (get-in volcano-parameters [1 :default])))
    (is (= 30 (get-in seismic-parameters [0 :default])))
    (is (= 2.5 (get-in seismic-parameters [1 :default])))
    (is (= ["Earthquake" "Volcano"]
           (get-in tsunami-parameters [1 :values_source_config :values])))))

(deftest question-reconciliation-recognizes-legacy-names
  (let [requests (atom [])
        spec (some #(when (= "membership-by-region" (:key %)) %) bootstrap/question-specs)]
    (with-redefs [bootstrap/request!
                  (fn [_ method path body]
                    (swap! requests conj [method path body])
                    (if (= [:post "/api/card"] [method path])
                      (throw (ex-info "Legacy card should be updated, not duplicated" {}))
                      {:id 42}))]
      (let [card (bootstrap/ensure-question! {:test true} 5 7
                                             [{:id 42 :name "Ring membership by GVP region"}]
                                             spec)]
        (is (= 42 (:id card)))
        (is (= "Reviewed volcanoes by GVP region" (:name card)))
        (is (= 2 (count @requests)))
        (is (every? #(= :put (first %)) @requests))))))

(deftest dashboard-reconciliation-uses-four-positioned-cards
  (let [spec (second test-dashboard-specs)
        by-key (into {} (map (juxt :key identity)) bootstrap/question-specs)
        cards (mapv (fn [index key]
                      {:id (+ 100 index)
                       :resource-key key
                       :allowed-parameters (:parameters (by-key key))})
                    (range) (:question-keys spec))
        update-body (atom nil)]
    (with-redefs [bootstrap/request!
                  (fn [_ method path body]
                    (cond
                      (and (= :get method) (= "/api/dashboard" path)) []
                      (and (= :post method) (= "/api/dashboard" path))
                      {:id 10 :name (:name spec)}
                      (and (= :get method) (= "/api/dashboard/10" path)) {:dashcards []}
                      (and (= :put method) (= "/api/dashboard/10" path))
                      (do (reset! update-body body) {:id 10})
                      :else (throw (ex-info "Unexpected test request" {:method method :path path}))))]
      (let [dashboard (bootstrap/ensure-dashboard! {:test true} 7 cards spec)]
        (is (= #{"region" "start_year"} (set (:allowed-parameters dashboard))))
        (is (= 4 (count (:dashcards @update-body))))
        (is (= #{24}
               (set (map #(+ (:col %) (:size_x %))
                         (filter #(= 12 (:col %)) (:dashcards @update-body))))))))))

(deftest stale-managed-resources-are-disabled
  (let [statement (atom nil)]
    (with-redefs [jdbc/execute-one! (fn [_ sql-params]
                                     (reset! statement sql-params)
                                     {:next.jdbc/update-count 1})]
      (bootstrap/disable-stale-resources! :datasource ["overview" "volcanoes"])
      (is (re-find #"resource_key NOT IN \(\?,\?\)" (first @statement)))
      (is (= ["overview" "volcanoes"] (subvec (vec @statement) 1))))))
