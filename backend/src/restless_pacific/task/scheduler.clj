(ns restless-pacific.task.scheduler
  (:gen-class)
  (:require [clojure.string :as str]
            [hikari-cp.core :as hikari]
            [restless-pacific.config :as config]
            [restless-pacific.task.ingest :as ingest])
  (:import (java.time Instant)))

(defn- env-long [name default]
  (Long/parseLong (or (System/getenv name) (str default))))

(defn- env-true? [name]
  (= "true" (some-> (System/getenv name) str/lower-case)))

(defn- safe-run! [label task]
  (try
    (println (str (Instant/now)) "starting scheduled" label "refresh")
    (let [result (task)]
      (println (str (Instant/now)) "completed scheduled" label "refresh" result)
      {:ok? true})
    (catch Throwable error
      ;; The pipeline already rolls back and records failures. Keeping this
      ;; process alive preserves the last good dataset and allows the next tick.
      (binding [*out* *err*]
        (println (str (Instant/now)) "scheduled" label "refresh failed:"
                 (.getMessage error)))
      {:ok? false :error error})))

(defn- due? [now next-run]
  (>= now next-run))

(defn- schedule-next [now interval-seconds]
  (+ now (* interval-seconds 1000)))

(defn run-loop! [datasource]
  (let [intervals {:usgs (env-long "USGS_POLL_SECONDS" 300)
                   :reconcile (env-long "USGS_RECONCILE_SECONDS" 86400)
                   :gvp (env-long "GVP_REFRESH_SECONDS" 604800)
                   :plates (env-long "PLATE_REFRESH_SECONDS" 2592000)
                   :noaa (env-long "NOAA_REFRESH_SECONDS" 2592000)}
        now (System/currentTimeMillis)
        slow-start? (env-true? "SCHEDULER_RUN_SLOW_ON_START")
        initial (into {}
                      (map (fn [[key seconds]]
                             [key (if (or (= key :usgs) (= key :reconcile) slow-start?)
                                    now
                                    (schedule-next now seconds))]))
                      intervals)]
    (when (env-true? "USGS_HISTORY_ENABLED")
      (safe-run! "USGS historical M5+" #(ingest/backfill-usgs! datasource)))
    (loop [next-runs initial]
      (let [now (System/currentTimeMillis)
            jobs {:usgs #(ingest/ingest-usgs! datasource)
                  :reconcile #(ingest/reconcile-usgs! datasource)
                  :gvp #(ingest/ingest-gvp! datasource)
                  :plates #(ingest/ingest-plates! datasource)
                  :noaa #(if (System/getenv "NOAA_TSV_URL")
                           (ingest/ingest-noaa! datasource)
                           {:status :skipped :reason "NOAA_TSV_URL is not configured."})}
            due (filter #(due? now (get next-runs %)) (keys jobs))
            next-runs
            (reduce (fn [schedule key]
                      (safe-run! (name key) (get jobs key))
                      (assoc schedule key (schedule-next now (get intervals key))))
                    next-runs due)]
        ;; Wake frequently so shutdown does not wait for a full five-minute
        ;; polling interval. No upstream call sleeps while holding a DB lock.
        (Thread/sleep 1000)
        (recur next-runs)))))

(defn -main [& _]
  (let [datasource (hikari/make-datasource (config/db-config))]
    (.addShutdownHook
     (Runtime/getRuntime)
     (Thread. #(hikari/close-datasource datasource)))
    (println "Restless Pacific scheduler started. USGS poll seconds:"
             (env-long "USGS_POLL_SECONDS" 300))
    (run-loop! datasource)))
