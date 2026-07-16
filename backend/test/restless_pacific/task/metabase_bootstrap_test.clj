(ns restless-pacific.task.metabase-bootstrap-test
  (:require [clojure.test :refer [deftest is testing]]
            [restless-pacific.task.metabase-bootstrap :as bootstrap]))

(deftest bootstrap-defines-six-questions-and-controlled-filters
  (is (= 6 (count bootstrap/question-specs)))
  (with-redefs [bootstrap/request!
                (fn [_ method path _]
                  (cond
                    (and (= :get method) (= "/api/dashboard" path)) []
                    (and (= :post method) (= "/api/dashboard" path))
                    {:id 10 :name "Restless Pacific — Ring of Fire Data Lab"}
                    (and (= :get method) (= "/api/dashboard/10" path)) {:dashcards []}
                    (= :put method) {:id 10}
                    :else (throw (ex-info "Unexpected test request" {:method method :path path}))))]
    (is (= #{"region" "start_year"}
           (set (:allowed-parameters
                 (bootstrap/ensure-dashboard! {:test true} 7 [])))))))

(deftest historical-questions-default-to-1960
  (let [historical (filter #(some #{"start_year"} (:parameters %))
                           bootstrap/question-specs)]
    (is (= 3 (count historical)))
    (doseq [question historical]
      (is (re-find #"\{\{start_year\}\}" (:query question)))
      (is (= 1960 (get-in question [:template-tags :start_year :default]))))))

(deftest numeric-historical-charts-pin-their-axes
  (let [by-key (into {} (map (juxt :key identity)) bootstrap/question-specs)]
    (is (= {:graph.dimensions ["decade"] :graph.metrics ["eruptions"]}
           (:visualization-settings (by-key "eruptions-by-decade"))))
    (is (= {:graph.dimensions ["vei"] :graph.metrics ["eruptions"]}
           (:visualization-settings (by-key "vei-distribution"))))))

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
