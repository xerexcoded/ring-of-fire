(ns restless-pacific.http.routes
  (:require [integrant.core :as ig]
            [next.jdbc :as jdbc]
            [reitit.ring :as ring]
            [restless-pacific.http.middleware :as middleware]
            [restless-pacific.http.params :as params]
            [restless-pacific.http.problem :as problem]
            [restless-pacific.repository.atlas :as repo]
            [restless-pacific.security.guest-token :as guest-token]
            [ring.middleware.params :refer [wrap-params]])
  (:import (java.time Instant)))

(defn- geojson-response [source-dataset options features]
  {:status 200
   :headers {"Content-Type" "application/geo+json; charset=utf-8"
             "Cache-Control" "public, max-age=60, stale-while-revalidate=300"}
   :body {:type "FeatureCollection"
          :features features
          :meta {:count (count features)
                 :limit (:limit options)
                 :offset (:offset options)
                 :sourceDataset source-dataset
                 :generatedAt (str (Instant/now))}}})

(defn- atlas-handler [db source-dataset fetch]
  (fn [request]
    (let [options (params/atlas-options (:query-params request))]
      (geojson-response source-dataset options (fetch db options)))))

(defn- parse-volcano-number [request]
  (try
    (Long/parseLong (get-in request [:path-params :volcanoNumber]))
    (catch NumberFormatException _
      (problem/fail! 400 "Invalid volcano number" "volcanoNumber must be numeric."))))

(defn- volcano-handler [db]
  (fn [request]
    (let [number (parse-volcano-number request)]
      (if-let [volcano (repo/volcano db number)]
        {:status 200
         :headers {"Cache-Control" "public, max-age=300, stale-while-revalidate=3600"}
         :body volcano}
        (problem/fail! 404 "Volcano not found"
                       (str "No volcano exists with volcanoNumber " number "."))))))

(defn- search-handler [db]
  (fn [request]
    (let [q (params/search-query (:query-params request))]
      {:status 200
       :headers {"Cache-Control" "public, max-age=30"}
       :body {:query q :items (repo/search db q)}})))

(defn- sources-handler [db]
  (fn [_]
    {:status 200
     :headers {"Cache-Control" "public, max-age=60"}
     :body {:generatedAt (str (Instant/now))
            :datasets (repo/source-status db)
            :disclaimer "Educational context only. Not an alert, forecast, or emergency-response product."}}))

(defn- health-handler [db]
  (fn [request]
    (try
      (jdbc/execute-one! db ["SELECT 1"])
      {:status 200
       :headers {"Cache-Control" "no-store"}
       :body {:status "ok" :service "restless-pacific-api"}}
      (catch Throwable _
        (problem/response request
                          (problem/problem 503 "Database unavailable"
                                           "The service is running but its database is unavailable."))))))

(defn- token-handler [db token-config]
  (fn [request]
    (let [origin (get-in request [:headers "origin"])]
      (when-not (guest-token/origin-allowed? token-config origin)
        (problem/fail! 403 "Origin not allowed"
                       "This origin cannot request Metabase guest tokens."))
      (let [response (guest-token/issue! db token-config (:json-body request))]
        {:status 200
         :headers (cond-> {"Cache-Control" "no-store" "Vary" "Origin"}
                    (seq origin) (assoc "Access-Control-Allow-Origin" origin))
         :body response}))))

(defn- metabase-resource-handler [db]
  (fn [request]
    (let [resource-key (get-in request [:path-params :resourceKey])]
      (if-let [resource (repo/metabase-resource-by-key db resource-key)]
        {:status 200
         :headers {"Cache-Control" "public, max-age=60, stale-while-revalidate=300"}
         :body {:entityType (:entity_type resource)
                :entityId (:entity_id resource)
                :resourceKey (:resource_key resource)
                :displayName (:display_name resource)}}
        (problem/fail! 404 "Metabase resource not found"
                       "The requested embed resource is not published.")))))

(defn- options-handler [token-config]
  (fn [request]
    (let [origin (get-in request [:headers "origin"])]
      (when-not (guest-token/origin-allowed? token-config origin)
        (problem/fail! 403 "Origin not allowed"
                       "This origin cannot request Metabase guest tokens."))
      {:status 204
       :headers (cond-> {"Access-Control-Allow-Methods" "POST, OPTIONS"
                         "Access-Control-Allow-Headers" "Content-Type"
                         "Access-Control-Max-Age" "600"
                         "Vary" "Origin"}
                  (seq origin) (assoc "Access-Control-Allow-Origin" origin))
       :body ""})))

(defn handler [{:keys [db token-config]}]
  (->
   (ring/ring-handler
    (ring/router
     [["/healthz" {:get (health-handler db)}]
      ["/readyz" {:get (health-handler db)}]
      ["/api/v1"
       ["/atlas/volcanoes" {:get (atlas-handler db "gvp" repo/volcanoes)}]
       ["/atlas/earthquakes" {:get (atlas-handler db "usgs-earthquakes" repo/earthquakes)}]
       ["/atlas/boundaries" {:get (atlas-handler db "usgs-plates" repo/boundaries)}]
       ["/atlas/tsunamis" {:get (atlas-handler db "noaa-tsunami" repo/tsunamis)}]
       ["/volcanoes/:volcanoNumber" {:get (volcano-handler db)}]
       ["/search" {:get (search-handler db)}]
       ["/sources/status" {:get (sources-handler db)}]
       ["/metabase/resources/:resourceKey" {:get (metabase-resource-handler db)}]
       ["/metabase/guest-token"
        {:post (token-handler db token-config)
         :options (options-handler token-config)}]]])
    (ring/create-default-handler))
   wrap-params
   middleware/wrap-json-body
   middleware/wrap-problems
   (middleware/wrap-cors token-config)
   middleware/wrap-json-response))

(defmethod ig/init-key :app/router [_ config]
  (handler config))
