(ns restless-pacific.http.middleware
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [restless-pacific.http.problem :as problem])
  (:import (java.io InputStream)))

(defn- json-content-type? [request]
  (some-> (get-in request [:headers "content-type"])
          str/lower-case
          (str/starts-with? "application/json")))

(defn wrap-json-body [handler]
  (fn [request]
    (if (and (json-content-type? request) (:body request))
      (try
        (handler (assoc request :json-body
                        (json/parse-stream
                         (java.io.InputStreamReader. ^InputStream (:body request)) true)))
        (catch com.fasterxml.jackson.core.JsonParseException _
          (problem/response request
                            (problem/problem 400 "Malformed JSON"
                                             "The request body is not valid JSON."))))
      (handler request))))

(defn wrap-json-response [handler]
  (fn [request]
    (let [response (handler request)
          content-type (get-in response [:headers "Content-Type"])]
      (if (or (nil? response)
              (string? (:body response))
              (not (or (nil? content-type)
                       (str/includes? content-type "json"))))
        response
        (-> response
            (update :headers #(merge {"Content-Type" "application/json; charset=utf-8"} %))
            (update :body json/generate-string))))))

(defn wrap-problems [handler]
  (fn [request]
    (try
      (or (handler request)
          (problem/response request
                            (problem/problem 404 "Not found"
                                             "No route matches this request.")))
      (catch clojure.lang.ExceptionInfo error
        (if-let [body (:problem (ex-data error))]
          (problem/response request body)
          (do
            (binding [*out* *err*]
              (println "Unhandled ExceptionInfo" (.getMessage error)))
            (problem/response request
                              (problem/problem 500 "Internal error"
                                               "The request could not be completed.")))))
      (catch Throwable error
        (binding [*out* *err*]
          (println "Unhandled request error" (.getMessage error)))
        (problem/response request
                          (problem/problem 500 "Internal error"
                                           "The request could not be completed."))))))

(defn wrap-cors [handler {:keys [allowed-origins]}]
  (fn [request]
    (let [origin (get-in request [:headers "origin"])
          allowed? (and (seq origin) (contains? allowed-origins origin))
          preflight? (= :options (:request-method request))
          response (if preflight?
                     {:status 204 :headers {} :body ""}
                     (handler request))]
      (update response :headers
              #(cond-> (merge {"Vary" "Origin"} %)
                 allowed? (assoc "Access-Control-Allow-Origin" origin
                                 "Access-Control-Allow-Credentials" "true"
                                 "Access-Control-Allow-Methods" "GET, POST, OPTIONS"
                                 "Access-Control-Allow-Headers" "Content-Type"
                                 "Access-Control-Max-Age" "600"))))))
