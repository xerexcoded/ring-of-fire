(ns restless-pacific.task.migrate
  (:gen-class)
  (:require [hikari-cp.core :as hikari]
            [restless-pacific.config :as config]
            [restless-pacific.db :as db]))

(defn -main [& [command]]
  (let [datasource (hikari/make-datasource (config/db-config))]
    (try
      (case command
        "rollback" (db/rollback! datasource)
        (db/migrate! datasource))
      (finally
        (hikari/close-datasource datasource)))))
