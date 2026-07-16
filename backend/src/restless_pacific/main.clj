(ns restless-pacific.main
  (:gen-class)
  (:require [integrant.core :as ig]
            [restless-pacific.config :as config]
            [restless-pacific.db]
            [restless-pacific.system]))

(defonce system (atom nil))

(defn stop! []
  (when-let [running @system]
    (ig/halt! running)
    (reset! system nil)))

(defn start! []
  (stop!)
  (let [running (ig/init (config/system-config))]
    (reset! system running)
    running))

(defn -main [& _]
  (.addShutdownHook (Runtime/getRuntime) (Thread. stop!))
  (start!)
  (println "Restless Pacific API listening on port"
           (or (System/getenv "PORT") "8080")))
