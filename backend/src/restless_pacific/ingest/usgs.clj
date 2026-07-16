(ns restless-pacific.ingest.usgs
  (:require [clojure.set :as set]
            [restless-pacific.ingest.parse :as parse])
  (:import (java.time Instant)))

(defn- epoch-millis->instant [value]
  (when-let [millis (parse/integer value)]
    (Instant/ofEpochMilli millis)))

(defn parse-feature [feature]
  (let [properties (parse/required feature "properties" :properties)
        event-id (parse/required feature "id" :id)
        deleted? (or (= "deleted" (parse/value properties :status))
                     (true? (parse/value properties :deleted)))]
    (if (and deleted? (nil? (parse/value feature :geometry)))
      {:event-id event-id
       :updated-at-source (epoch-millis->instant (parse/value properties :updated))
       :status "deleted"
       :deleted? true}
      (let [geometry (parse/required feature "geometry" :geometry)
            [longitude latitude depth]
            (parse/coordinates!
             (parse/required geometry "geometry.coordinates" :coordinates))]
        {:event-id event-id
     :occurred-at (epoch-millis->instant
                   (parse/required properties "time" :time))
     :updated-at-source (epoch-millis->instant
                         (parse/required properties "updated" :updated))
     :magnitude (parse/decimal (parse/value properties :mag))
     :magnitude-type (parse/value properties :magType)
     :depth-km (or depth 0.0)
     :place (parse/value properties :place)
     :event-type (or (parse/value properties :type) "earthquake")
     :significance (parse/integer (parse/value properties :sig))
     :tsunami-flag (= 1 (parse/integer (parse/value properties :tsunami)))
     :felt-reports (parse/integer (parse/value properties :felt))
     :alert-level (parse/value properties :alert)
     :status (parse/value properties :status)
     :detail-url (parse/value properties :detail)
     :longitude longitude
     :latitude latitude
         :deleted? deleted?}))))

(defn parse-feed [feature-collection]
  (parse/parse-many parse-feature
                    (parse/required feature-collection "features" :features)))

(defn reconciliation-deletions
  "Returns stored event IDs missing from the authoritative reconciliation
  window. Callers must scope stored IDs to the exact feed time range first."
  [stored-event-ids upstream-event-ids]
  (vec (sort (set/difference (set stored-event-ids)
                             (set upstream-event-ids)))))
