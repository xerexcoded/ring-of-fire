(ns restless-pacific.ingest.noaa
  (:require [clojure.data.csv :as csv]
            [clojure.string :as str]
            [restless-pacific.ingest.parse :as parse])
  (:import (java.io StringReader)))

(defn- normalize-header [header]
  (-> header str/trim str/lower-case (str/replace #"[^a-z0-9]+" "_") keyword))

(defn- row-value [row & aliases]
  (some #(let [value (get row %)] (when-not (str/blank? value) value)) aliases))

(defn- parse-row [row]
  (let [year (parse/integer (row-value row :year :event_year :yr))
        month (parse/integer (row-value row :month :event_month :mo))
        day (parse/integer (row-value row :day :event_day :dy))
        longitude (parse/decimal (row-value row :longitude :source_longitude))
        latitude (parse/decimal (row-value row :latitude :source_latitude))
        coordinates (when (and longitude latitude)
                      (parse/coordinates! [longitude latitude]))]
    {:event-id (str (or (row-value row :id :event_id :tsunami_event_id)
                        (str year "-" month "-" day "-" longitude "-" latitude)))
     :event-year year
     :event-month month
     :event-day day
     :date-precision (parse/date-precision year month day)
     :cause (row-value row :cause :primary_cause :cause_code)
     :country (row-value row :country :source_country)
     :location-name (row-value row :location_name :location :source_location)
     :source-magnitude (parse/decimal (row-value row :magnitude :source_magnitude :eq_magnitude))
     :maximum-water-height-m
     (parse/decimal (row-value row :maximum_water_height_m :max_water_height :max_runup))
     :deaths (parse/integer (row-value row :deaths :total_deaths))
     :damage-usd (parse/decimal (row-value row :damage_usd :total_damage_usd))
     :validity (row-value row :validity :tsunami_event_validity)
     :source-confidence (or (row-value row :source_confidence :confidence) "historical")
     :notes (row-value row :notes :comments)
     :longitude (first coordinates)
     :latitude (second coordinates)}))

(defn parse-tsv [tsv]
  (let [[headers & rows] (csv/read-csv (StringReader. tsv) :separator \tab)
        headers (mapv normalize-header headers)
        records (mapv #(zipmap headers %) rows)]
    (parse/parse-many parse-row records)))
