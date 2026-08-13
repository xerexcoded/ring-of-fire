(ns restless-pacific.config
  (:require [clojure.string :as str]
            [integrant.core :as ig]))

(defn- env
  ([name default]
   (or (System/getenv name) default))
  ([name]
   (System/getenv name)))

(defn- parse-long-env [value]
  (Long/parseLong (str value)))

(defn- comma-list [value]
  (->> (str/split (or value "") #",")
       (map str/trim)
       (remove str/blank?)
       set))

(def production-defaults
  {"POSTGRES_PASSWORD" "dev-only-postgres-change-me"
   "DATABASE_PASSWORD" "dev-only-ring-writer-change-me"
   "METABASE_DB_PASSWORD" "dev-only-metabase-app-change-me"
   "METABASE_READER_PASSWORD" "dev-only-metabase-reader-change-me"
   "METABASE_ADMIN_PASSWORD" "RestlessPacific-Atlas!2026-Local"
   "METABASE_EMBEDDING_SECRET"
   "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
   "METABASE_ENCRYPTION_SECRET" "dev-only-encryption-secret-change-me-32chars"})

(defn- production? [read-env]
  (= "production" (some-> (read-env "APP_ENV" "development") str/trim str/lower-case)))

(defn validate-production-secrets!
  "Reject repository-known development credentials before a production service starts."
  ([] (validate-production-secrets! env))
  ([read-env]
   (when (production? read-env)
    (let [values (into {} (map (fn [name] [name (some-> (read-env name) str/trim)]) (keys production-defaults)))
          missing-or-default (->> values
                                  (keep (fn [[name value]]
                                          (when (or (str/blank? value)
                                                    (= value (get production-defaults name)))
                                            name))))
          secret-values (vals values)]
      (when (seq missing-or-default)
        (throw (ex-info (str "Production secrets must be set to unique non-development values: "
                             (str/join ", " (sort missing-or-default)))
                        {:type :invalid-production-configuration
                         :variables missing-or-default})))
      (when-not (re-matches #"[0-9a-fA-F]{64}" (get values "METABASE_EMBEDDING_SECRET"))
        (throw (ex-info "METABASE_EMBEDDING_SECRET must be a 64-character hexadecimal key in production."
                        {:type :invalid-production-configuration})))
      (when (< (count (get values "METABASE_ENCRYPTION_SECRET")) 32)
        (throw (ex-info "METABASE_ENCRYPTION_SECRET must contain at least 32 characters in production."
                        {:type :invalid-production-configuration})))
      (when (not= (count secret-values) (count (set secret-values)))
        (throw (ex-info "Production database, Metabase, and administrator secrets must be unique."
                        {:type :invalid-production-configuration})))))
  true))

(defn db-config []
  (validate-production-secrets! env)
  {:jdbc-url (env "DATABASE_URL" "jdbc:postgresql://localhost:5432/ring_data")
   :username (or (env "DATABASE_USER") (env "DB_USER") "ring_writer")
   :password (or (env "DATABASE_PASSWORD") (env "DB_PASSWORD") "ring_writer_dev")
   :maximum-pool-size (parse-long-env (env "DATABASE_POOL_SIZE" "10"))})

(defn token-config []
  {:secret (env "METABASE_EMBEDDING_SECRET"
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
   :ttl-seconds (parse-long-env (env "METABASE_TOKEN_TTL_SECONDS" "3600"))
   :allowed-origins (comma-list
                     (env "ALLOWED_ORIGINS"
                          "http://localhost:3000,http://localhost"))})

(defn system-config []
  {:db/pool (db-config)
   :security/guest-token (token-config)
   :app/router {:db (ig/ref :db/pool)
                :token-config (ig/ref :security/guest-token)}
   :http/server {:handler (ig/ref :app/router)
                 :port (parse-long-env (env "PORT" "8080"))
                 :join? false}})
