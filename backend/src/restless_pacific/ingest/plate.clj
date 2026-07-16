(ns restless-pacific.ingest.plate
  (:require [clojure.string :as str]
            [restless-pacific.ingest.parse :as parse]))

(defn- valid-line! [line]
  (when (< (count line) 2)
    (throw (ex-info "Plate boundary line must have at least two positions." {})))
  (mapv parse/coordinates! line))

(defn parse-feature [index feature]
  (let [properties (or (parse/value feature :properties) {})
        geometry (parse/required feature "geometry" :geometry)
        geometry-type (parse/required geometry "geometry.type" :type)
        raw-coordinates (parse/required geometry "geometry.coordinates" :coordinates)
        coordinates (case geometry-type
                      "LineString" [(valid-line! raw-coordinates)]
                      "MultiLineString" (mapv valid-line! raw-coordinates)
                      (throw (ex-info "Plate geometry must be LineString or MultiLineString."
                                      {:geometry-type geometry-type})))
        boundary-type (or (parse/value properties :TYPE "TYPE" :Type "Type" :type)
                          "other")]
    {:boundary-id (str (or (parse/value feature :id)
                           (parse/value properties :OBJECTID :objectid)
                           index))
     :name (or (parse/value properties :Name :NAME :name)
               (str boundary-type " boundary"))
     :boundary-type (-> boundary-type str str/lower-case)
     :description (parse/value properties :Description :DESCRIPTION :description)
     :geometry {:type "MultiLineString" :coordinates coordinates}}))

(defn parse-feed [feature-collection]
  (let [features (parse/required feature-collection "features" :features)]
    (reduce-kv
     (fn [result index feature]
       (try
         (update result :records conj (parse-feature index feature))
         (catch Throwable error
           (update result :rejections conj
                   {:index index :reason (.getMessage error) :raw feature}))))
     {:records [] :rejections []}
     (vec features))))
