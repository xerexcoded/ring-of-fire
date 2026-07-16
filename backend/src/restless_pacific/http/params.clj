(ns restless-pacific.http.params
  (:require [clojure.string :as str]
            [restless-pacific.http.problem :as problem])
  (:import (java.time Instant DateTimeException)))

(defn- parse-number [label value parse-fn]
  (when-not (str/blank? value)
    (try
      (parse-fn value)
      (catch NumberFormatException _
        (problem/fail! 400 "Invalid query parameter"
                       (str label " must be numeric."))))))

(defn- double-param [query key]
  (parse-number (name key) (get query (name key)) #(Double/parseDouble %)))

(defn- int-param [query key]
  (parse-number (name key) (get query (name key)) #(Long/parseLong %)))

(defn- instant-param [query key]
  (when-let [value (get query (name key))]
    (try
      (Instant/parse value)
      (catch DateTimeException _
        (problem/fail! 400 "Invalid query parameter"
                       (str (name key) " must be an ISO-8601 timestamp."))))))

(defn parse-bbox [value]
  (let [parts (when value (str/split value #","))]
    (when (and parts (not= 4 (count parts)))
      (problem/fail! 400 "Invalid bounding box"
                     "bbox must contain west,south,east,north."))
    (let [[west south east north]
          (if parts
            (mapv #(parse-number "bbox" % (fn [x] (Double/parseDouble x))) parts)
            [-180.0 -90.0 180.0 90.0])]
      (when-not (and (<= -180 west 180)
                     (<= -180 east 180)
                     (<= -90 south 90)
                     (<= -90 north 90)
                     (< south north))
        (problem/fail! 400 "Invalid bounding box"
                       "bbox coordinates are outside RFC 7946 bounds or south is not below north."))
      {:west west :south south :east east :north north
       :crosses-dateline? (> west east)})))

(defn atlas-options [query]
  (let [limit (or (int-param query :limit) 250)
        offset (or (int-param query :offset) 0)
        min-magnitude (double-param query :minMagnitude)
        max-magnitude (double-param query :maxMagnitude)
        min-depth (double-param query :minDepthKm)
        max-depth (double-param query :maxDepthKm)
        min-vei (double-param query :minVei)
        max-vei (double-param query :maxVei)]
    (when-not (<= 1 limit 1000)
      (problem/fail! 400 "Invalid query parameter" "limit must be between 1 and 1000."))
    (when (neg? offset)
      (problem/fail! 400 "Invalid query parameter" "offset cannot be negative."))
    (when (and min-magnitude max-magnitude (> min-magnitude max-magnitude))
      (problem/fail! 400 "Invalid query parameter" "minMagnitude cannot exceed maxMagnitude."))
    (when (and min-depth max-depth (> min-depth max-depth))
      (problem/fail! 400 "Invalid query parameter" "minDepthKm cannot exceed maxDepthKm."))
    (when (or (and min-vei (not (<= 0 min-vei 8)))
              (and max-vei (not (<= 0 max-vei 8))))
      (problem/fail! 400 "Invalid query parameter" "VEI filters must be between 0 and 8."))
    (when (and min-vei max-vei (> min-vei max-vei))
      (problem/fail! 400 "Invalid query parameter" "minVei cannot exceed maxVei."))
    {:bbox (parse-bbox (get query "bbox"))
     :limit limit
     :offset offset
     :region (some-> (get query "region") str/trim not-empty)
     :type (some-> (get query "type") str/trim not-empty)
     :cause (some-> (get query "cause") str/trim not-empty)
     :confidence (some-> (get query "confidence") str/trim not-empty)
     :start (instant-param query :start)
     :end (instant-param query :end)
     :start-year (int-param query :startYear)
     :end-year (int-param query :endYear)
     :min-magnitude min-magnitude
     :max-magnitude max-magnitude
     :min-depth min-depth
     :max-depth max-depth
     :min-vei min-vei
     :max-vei max-vei}))

(defn search-query [query]
  (let [value (some-> (get query "q") str/trim)]
    (when-not (and value (<= 2 (count value) 100))
      (problem/fail! 400 "Invalid search query" "q must contain between 2 and 100 characters."))
    value))
