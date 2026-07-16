(ns restless-pacific.http-client
  (:require [cheshire.core :as json]
            [clj-http.client :as http]))

(def default-options
  {:as :text
   :accept :json
   :connection-timeout 10000
   :socket-timeout 30000
   :throw-exceptions true})

(def ^:dynamic *sleep!*
  "Overridable in retry tests; production uses Thread/sleep."
  (fn [milliseconds] (Thread/sleep milliseconds)))

(defn get-text
  ([url] (get-text url {}))
  ([url options]
   (loop [attempt 1]
     (let [result (try
                    {:body (:body (http/get url (merge default-options options)))}
                    (catch Throwable error {:error error}))]
       (if-let [error (:error result)]
         (if (< attempt 3)
           (do
             (*sleep!* (* 250 attempt attempt))
             (recur (inc attempt)))
           (throw (ex-info (str "Upstream request failed after " attempt " attempts.")
                           {:url url :attempts attempt}
                           error)))
         (:body result))))))

(defn get-json
  ([url] (get-json url {}))
  ([url options]
   (json/parse-string (get-text url options) true)))
