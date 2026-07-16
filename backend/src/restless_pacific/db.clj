(ns restless-pacific.db
  (:require [hikari-cp.core :as hikari]
            [integrant.core :as ig]
            [migratus.core :as migratus]
            [next.jdbc :as jdbc]
            [next.jdbc.prepare :as prepare]
            [next.jdbc.result-set :as rs])
  (:import (java.sql Timestamp)
           (java.time Instant)))

(extend-protocol prepare/SettableParameter
  Instant
  (set-parameter [value statement index]
    (.setTimestamp statement index (Timestamp/from value))))

(def query-options {:builder-fn rs/as-unqualified-lower-maps})

(defmethod ig/init-key :db/pool [_ config]
  (hikari/make-datasource config))

(defmethod ig/halt-key! :db/pool [_ datasource]
  (hikari/close-datasource datasource))

(defn execute! [connectable statement]
  (jdbc/execute! connectable statement query-options))

(defn execute-one! [connectable statement]
  (jdbc/execute-one! connectable statement query-options))

(defn migrate! [datasource]
  (migratus/migrate {:store :database
                     :migration-dir "migrations"
                     :db {:datasource datasource}}))

(defn rollback! [datasource]
  (migratus/rollback {:store :database
                      :migration-dir "migrations"
                      :db {:datasource datasource}}))
