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

(defn db-config []
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
