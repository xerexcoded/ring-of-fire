(ns restless-pacific.ingest.gvp
  (:require [restless-pacific.ingest.parse :as parse]))

(defn- optional-date-part
  "GVP uses zero for an unknown month or day in historical records. Preserve
  that uncertainty as NULL and reject other out-of-range values before the
  staging transaction reaches database constraints."
  [value maximum label]
  (let [parsed (parse/integer value)]
    (cond
      (or (nil? parsed) (zero? parsed)) nil
      (<= 1 parsed maximum) parsed
      :else (throw (ex-info (str "Invalid GVP " label ".")
                            {:value parsed :minimum 1 :maximum maximum})))))

(defn parse-volcano-feature [feature]
  (let [properties (parse/required feature "properties" :properties)
        geometry (parse/required feature "geometry" :geometry)
        coordinates (parse/coordinates!
                     (parse/required geometry "geometry.coordinates" :coordinates))
        volcano-number (parse/integer
                        (parse/required properties "Volcano_Number" :Volcano_Number))
        name (parse/required properties "Volcano_Name" :Volcano_Name)]
    {:volcano-number volcano-number
     :name name
     :slug (str (parse/slug name) "-" volcano-number)
     :country (parse/value properties :Country)
     :region (parse/value properties :Region)
     :subregion (parse/value properties :Subregion)
     :volcano-type (or (parse/value properties :Primary_Volcano_Type)
                       (parse/value properties :Volcanic_Landform))
     :tectonic-setting (parse/value properties :Tectonic_Setting)
     :evidence-category (parse/value properties :Evidence_Category)
     :elevation-m (parse/integer (parse/value properties :Elevation))
     :last-eruption-year (parse/integer (parse/value properties :Last_Eruption_Year))
     :description (parse/value properties :Geological_Summary)
     :longitude (first coordinates)
     :latitude (second coordinates)}))

(defn parse-eruption-feature [feature]
  (let [properties (parse/required feature "properties" :properties)
        year (parse/integer (parse/value properties :StartDateYear))
        month (optional-date-part (parse/value properties :StartDateMonth) 12 "start month")
        day (optional-date-part (parse/value properties :StartDateDay) 31 "start day")
        end-month (optional-date-part (parse/value properties :EndDateMonth) 12 "end month")
        end-day (optional-date-part (parse/value properties :EndDateDay) 31 "end day")]
    (when (and day (nil? month))
      (throw (ex-info "GVP start day requires a known start month." {:day day})))
    (when (and end-day (nil? end-month))
      (throw (ex-info "GVP end day requires a known end month." {:day end-day})))
    {:eruption-number (parse/integer
                       (parse/required properties "Eruption_Number" :Eruption_Number))
     :volcano-number (parse/integer
                      (parse/required properties "Volcano_Number" :Volcano_Number))
     :eruption-category (parse/value properties :Activity_Type)
     :area-of-activity (parse/value properties :ActivityArea)
     :start-year year
     :start-month month
     :start-day day
     :end-year (parse/integer (parse/value properties :EndDateYear))
     :end-month end-month
     :end-day end-day
     :date-precision (parse/date-precision year month day)
     :vei (parse/decimal (parse/value properties :ExplosivityIndexMax))
     :evidence-method (parse/value properties :StartEvidenceMethod)
     :certainty (parse/value properties :Activity_Type)}))

(defn parse-e3-volcano-feature
  "Parses the official 1,215-row E3 catalog layer. It lacks Volcanic Region,
  so callers must join reviewed region metadata rather than infer membership
  from coordinates."
  [feature]
  (let [properties (parse/required feature "properties" :properties)
        geometry (parse/value feature :geometry)
        coordinates (parse/coordinates!
                     (or (parse/value geometry :coordinates)
                         [(parse/value properties :LongitudeDecimal)
                          (parse/value properties :LatitudeDecimal)]))
        volcano-number (parse/integer
                        (parse/required properties "VolcanoNumber" :VolcanoNumber))
        name (parse/required properties "VolcanoName" :VolcanoName)]
    {:volcano-number volcano-number
     :name name
     :slug (str (parse/slug name) "-" volcano-number)
     :country (parse/value properties :Country)
     :volcano-type (parse/value properties :VolcanoType)
     :tectonic-setting (parse/value properties :TectonicSetting)
     :elevation-m (parse/integer (parse/value properties :Elevation))
     :last-eruption-year (parse/integer (parse/value properties :LastEruption))
     :description (parse/value properties :Remarks)
     :longitude (first coordinates)
     :latitude (second coordinates)}))

(defn parse-volcanoes [feature-collection]
  (parse/parse-many parse-volcano-feature
                    (parse/required feature-collection "features" :features)))

(defn parse-eruptions [feature-collection]
  (parse/parse-many parse-eruption-feature
                    (parse/required feature-collection "features" :features)))

(defn retain-known-eruptions
  "Separates valid eruption rows whose volcano exists in the activated catalog.
  The eruption WFS occasionally references records absent from the detailed
  volcano WFS; those are provenance-visible rejections, never invented parent
  volcanoes or a reason to discard the rest of a valid refresh."
  [parsed known-volcano-numbers]
  (let [{known true orphan false}
        (group-by #(contains? known-volcano-numbers (:volcano-number %))
                  (:records parsed))]
    (-> parsed
        (assoc :records (vec known))
        (update :rejections into
                (map (fn [record]
                       {:raw record
                        :reason "Referenced volcano is absent from the activated GVP volcano catalog."})
                     orphan)))))

(defn parse-e3-volcanoes [feature-collection]
  (parse/parse-many parse-e3-volcano-feature
                    (parse/required feature-collection "features" :features)))
