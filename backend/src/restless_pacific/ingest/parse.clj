(ns restless-pacific.ingest.parse
  (:require [clojure.string :as str])
  (:import (java.text Normalizer Normalizer$Form)))

(defn value
  "Returns the first non-nil value for keys, accepting keyword and string maps."
  [record & keys]
  (loop [[key & remaining] keys]
    (when key
      (let [keyword-key (if (keyword? key) key (keyword key))
            string-key (if (string? key) key (name key))
            found? (or (contains? record keyword-key)
                       (contains? record string-key))
            result (if (contains? record keyword-key)
                     (get record keyword-key)
                     (get record string-key))]
        (if (and found? (some? result))
          result
          (recur remaining))))))

(defn required [record label & keys]
  (or (apply value record keys)
      (throw (ex-info (str "Missing required field " label)
                      {:field label :record record}))))

(defn integer [value]
  (when-not (or (nil? value) (and (string? value) (str/blank? value)))
    (cond
      (integer? value) (long value)
      (number? value) (long value)
      :else (Long/parseLong (str/trim value)))))

(defn decimal [value]
  (when-not (or (nil? value) (and (string? value) (str/blank? value)))
    (cond
      (number? value) (double value)
      :else (Double/parseDouble (str/trim value)))))

(defn coordinates! [[longitude latitude & [depth]]]
  (let [longitude (decimal longitude)
        latitude (decimal latitude)
        depth (decimal depth)]
    (when-not (and longitude latitude
                   (<= -180.0 longitude 180.0)
                   (<= -90.0 latitude 90.0))
      (throw (ex-info "Coordinates are missing or outside RFC 7946 bounds."
                      {:longitude longitude :latitude latitude})))
    (cond-> [longitude latitude]
      (some? depth) (conj depth))))

(defn slug [text]
  (let [ascii (Normalizer/normalize (str text) Normalizer$Form/NFD)]
    (-> ascii
        (str/replace #"\p{M}" "")
        str/lower-case
        (str/replace #"[^a-z0-9]+" "-")
        (str/replace #"(^-|-$)" ""))))

(defn date-precision [year month day]
  (cond
    (nil? year) "unknown"
    (some? day) "day"
    (some? month) "month"
    :else "year"))

(defn parse-many [parse-one records]
  (reduce-kv
   (fn [result index record]
     (try
       (update result :records conj (parse-one record))
       (catch Throwable error
         (update result :rejections conj
                 {:index index
                  :reason (.getMessage error)
                  :raw record}))))
   {:records [] :rejections []}
   (vec records)))
