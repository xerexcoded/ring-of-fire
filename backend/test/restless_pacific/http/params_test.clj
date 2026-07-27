(ns restless-pacific.http.params-test
  (:require [clojure.test :refer [deftest is testing]]
            [restless-pacific.http.params :as params]))

(deftest bbox-is-bounded-and-supports-the-dateline
  (is (= {:west 170.0 :south -30.0 :east -170.0 :north 30.0
          :crosses-dateline? true}
         (params/parse-bbox "170,-30,-170,30")))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"outside RFC 7946"
                        (params/parse-bbox "190,-20,20,20"))))

(deftest atlas-options-bound-pagination-and-vei
  (let [options (params/atlas-options {"limit" "1000"
                                       "offset" "10"
                                       "minVei" "3"
                                       "maxVei" "6.5"})]
    (is (= 1000 (:limit options)))
    (is (= 10 (:offset options)))
    (is (= 3.0 (:min-vei options)))
    (is (= 6.5 (:max-vei options))))
  (testing "VEI is limited to the scientific scale and ordered"
    (is (thrown? clojure.lang.ExceptionInfo
                 (params/atlas-options {"minVei" "9"})))
    (is (thrown? clojure.lang.ExceptionInfo
                 (params/atlas-options {"minVei" "6" "maxVei" "3"}))))
  (testing "pagination is abuse bounded"
    (is (thrown? clojure.lang.ExceptionInfo
                 (params/atlas-options {"limit" "1001"})))))

(deftest search-query-has-useful-bounds
  (is (= "Fuji" (params/search-query {"q" " Fuji "})))
  (is (thrown? clojure.lang.ExceptionInfo (params/search-query {"q" "x"}))))

(deftest definition-options-allow-only-bounded-transparent-rules
  (is (= {:tectonic "subduction"
          :max-distance-km nil
          :erupted-since nil}
         (params/definition-options {})))
  (is (= {:tectonic "all"
          :max-distance-km 175.0
          :erupted-since 1960}
         (params/definition-options {"tectonic" "all"
                                     "maxDistanceKm" "175"
                                     "eruptedSince" "1960"})))
  (doseq [query [{"tectonic" "popular"}
                 {"maxDistanceKm" "10"}
                 {"maxDistanceKm" "501"}
                 {"eruptedSince" "1900"}]]
    (is (thrown? clojure.lang.ExceptionInfo
                 (params/definition-options query)))))
