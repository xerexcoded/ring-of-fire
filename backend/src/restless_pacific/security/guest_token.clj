(ns restless-pacific.security.guest-token
  (:require [buddy.sign.jwt :as jwt]
            [clojure.set :as set]
            [clojure.string :as str]
            [integrant.core :as ig]
            [restless-pacific.http.problem :as problem]
            [restless-pacific.repository.atlas :as repo])
  (:import (java.time Instant)))

(def allowed-entity-types #{"dashboard" "question"})

(defmethod ig/init-key :security/guest-token [_ config]
  (when-not (re-matches #"[0-9a-fA-F]{64}" (:secret config))
    (throw (ex-info "METABASE_EMBEDDING_SECRET must be a 64-character hexadecimal 256-bit key."
                    {:type :invalid-configuration})))
  (when-not (<= 60 (:ttl-seconds config) 3600)
    (throw (ex-info "METABASE_TOKEN_TTL_SECONDS must be between 60 and 3600."
                    {:type :invalid-configuration})))
  config)

(defn origin-allowed? [{:keys [allowed-origins]} origin]
  (or (str/blank? origin) (contains? allowed-origins origin)))

(defn- normalize-context [custom-context allowed-parameters]
  (when (and custom-context (not (map? custom-context)))
    (problem/fail! 400 "Invalid custom context" "customContext must be a JSON object."))
  (let [allowed (set (map name (or allowed-parameters [])))
        provided (set (map (comp name key) custom-context))
        rejected (set/difference provided allowed)]
    (when (seq rejected)
      (problem/fail! 400 "Disallowed Metabase parameter"
                     (str "These customContext keys are not allowed: "
                          (str/join ", " (sort rejected)) ".")))
    (into {} (map (fn [[key value]] [(name key) value])) custom-context)))

(defn issue!
  [db {:keys [secret ttl-seconds]} {:keys [entityType entityId customContext]}]
  (when-not (contains? allowed-entity-types entityType)
    (problem/fail! 400 "Invalid Metabase entity" "entityType must be dashboard or question."))
  (when-not (integer? entityId)
    (problem/fail! 400 "Invalid Metabase entity" "entityId must be an integer."))
  (let [resource (repo/metabase-resource db entityType entityId)]
    (when-not resource
      (problem/fail! 404 "Metabase resource not found"
                     "The requested embed is not in the public resource allow-list."))
    (let [now (.getEpochSecond (Instant/now))
          context (normalize-context customContext (:allowed_parameters resource))
          claims {:resource {(keyword entityType) entityId}
                  :params context
                  :iat now
                  :exp (+ now ttl-seconds)}]
      {:jwt (jwt/sign claims secret {:alg :hs256})})))
