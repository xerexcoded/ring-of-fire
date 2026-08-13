(ns restless-pacific.config-test
  (:require [clojure.test :refer [deftest is testing]]
            [restless-pacific.config :as config]))

(def valid-production-env
  {"APP_ENV" "production"
   "POSTGRES_PASSWORD" "postgres-production-secret"
   "RING_WRITER_PASSWORD" "ring-production-secret"
   "DATABASE_PASSWORD" "ring-production-secret"
   "METABASE_DB_PASSWORD" "metabase-production-secret"
   "METABASE_READER_PASSWORD" "reader-production-secret"
   "METABASE_ADMIN_PASSWORD" "admin-production-secret"
   "METABASE_EMBEDDING_SECRET" "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"
   "METABASE_ENCRYPTION_SECRET" "encryption-production-secret-32-characters"})

(defn read-env [values]
  (fn
    ([name] (get values name))
    ([name default] (get values name default))))

(deftest production-secrets-reject-development-fallbacks
  (testing "development remains available for local Compose"
    (is (config/validate-production-secrets!
         (read-env {"APP_ENV" "development"}))))
  (testing "production rejects a repository-known default"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"METABASE_ADMIN_PASSWORD"
         (config/validate-production-secrets!
          (read-env (assoc valid-production-env
                            "METABASE_ADMIN_PASSWORD"
                            "RestlessPacific-Atlas!2026-Local")))))))

(deftest production-secrets-accept-unique-values
  (is (config/validate-production-secrets!
       (read-env valid-production-env))))
