(ns restless-pacific.ingest.pipeline
  (:refer-clojure :exclude [run!])
  (:require [cheshire.core :as json]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs])
  (:import (java.security MessageDigest)
           (java.time Instant)
           (java.util UUID)))

(def query-options {:builder-fn rs/as-unqualified-lower-maps})

(defn sha256 [text]
  (let [digest (.digest (MessageDigest/getInstance "SHA-256")
                        (.getBytes (str text) "UTF-8"))]
    (apply str (map #(format "%02x" (bit-and % 0xff)) digest))))

(defn default-validation
  [{:keys [records rejections]}]
  (let [accepted (count records)
        rejected (count rejections)
        total (+ accepted rejected)
        rejection-rate (if (zero? total) 1.0 (/ rejected (double total)))]
    {:valid? (and (pos? accepted) (<= rejection-rate 0.05))
     :accepted accepted
     :rejected rejected
     :rejectionRate rejection-rate
     :checks [{:name "non-empty" :passed (pos? accepted)}
              {:name "rejection-rate-at-most-five-percent"
               :passed (<= rejection-rate 0.05)}]}))

(defn- source! [db source-key]
  (or (jdbc/execute-one!
       db ["SELECT id, source_key, current_version FROM ops.source_dataset WHERE source_key=?"
           source-key] query-options)
      (throw (ex-info (str "Unknown source dataset " source-key)
                      {:source-key source-key}))))

(defn- create-run! [db source-id run-id version published-at checksum fetched-count]
  (jdbc/execute-one!
   db
   ["INSERT INTO ops.ingestion_run
       (id, source_dataset_id, status, upstream_version, upstream_published_at,
        fetched_count, checksum_sha256)
     VALUES (?, ?, 'running', ?, ?, ?, ?)"
    run-id source-id version published-at fetched-count checksum]
   query-options))

(defn- safe-json [record]
  (json/generate-string
   (reduce-kv (fn [result key value]
                (assoc result key (if (instance? java.time.temporal.Temporal value)
                                    (str value)
                                    value)))
              {} record)))

(defn- stage! [tx run-id record-type id-fn records]
  (doseq [record records]
    (jdbc/execute-one!
     tx
     ["INSERT INTO ops.ingestion_staging
         (ingestion_run_id, record_type, upstream_id, normalized_record)
       VALUES (?, ?, ?, ?::jsonb)"
      run-id record-type (str (id-fn record)) (safe-json record)])))

(defn- record-rejections! [tx run-id rejections]
  (doseq [{:keys [raw reason]} rejections]
    (jdbc/execute-one!
     tx
     ["INSERT INTO ops.ingestion_rejection
         (ingestion_run_id, reason, raw_record) VALUES (?, ?, ?::jsonb)"
      run-id reason (json/generate-string raw)])))

(defn- mark-run! [db run-id status fields]
  (jdbc/execute-one!
   db
   ["UPDATE ops.ingestion_run
     SET status=?, finished_at=now(), staged_count=?, activated_count=?,
         rejected_count=?, validation_report=?::jsonb,
         error_class=?, error_message=?
     WHERE id=?"
    status (:staged-count fields) (:activated-count fields)
    (or (:rejected-count fields) 0)
    (json/generate-string (or (:validation fields) {}))
    (:error-class fields) (:error-message fields) run-id]
   query-options))

(defn run!
  "Runs a source refresh with a PostgreSQL advisory lock and a transactional
  staging/validation/activation boundary. If validation or activation fails,
  domain tables and source_dataset remain at the last good version. The failed
  run is recorded separately after rollback."
  [db {:keys [source-key version published-at checksum parsed record-type id-fn
              validate activate! membership-review-status]
       :or {validate default-validation}}]
  (let [source (source! db source-key)
        run-id (UUID/randomUUID)
        records (:records parsed)
        rejections (:rejections parsed)
        checksum (or checksum (sha256 (pr-str parsed)))]
    (create-run! db (:id source) run-id version published-at checksum
                 (+ (count records) (count rejections)))
    (try
      (let [outcome
            (jdbc/with-transaction [tx db {:isolation :serializable}]
              (let [lock-row
                    (jdbc/execute-one!
                     tx ["SELECT pg_try_advisory_xact_lock(hashtext(?)) locked" source-key]
                     query-options)]
                (when-not (:locked lock-row)
                  (throw (ex-info "Another refresh holds the source advisory lock."
                                  {:type :source-locked})))
                (stage! tx run-id record-type id-fn records)
                (record-rejections! tx run-id rejections)
                (let [validation (validate parsed)]
                  (when-not (:valid? validation)
                    (throw (ex-info "Ingestion validation failed."
                                    {:type :validation-failed
                                     :validation validation})))
                  (let [activated-count (activate! tx (:id source) version records)]
                    (jdbc/execute-one!
                     tx
                     ["UPDATE ops.source_dataset
                       SET current_version=?, current_published_at=?,
                           last_successful_run_at=now(),
                           membership_review_status=COALESCE(?, membership_review_status),
                           updated_at=now()
                       WHERE id=?"
                      version published-at membership-review-status (:id source)])
                    (jdbc/execute-one!
                     tx
                     ["UPDATE ops.ingestion_run
                       SET status='succeeded', finished_at=now(), staged_count=?,
                           activated_count=?, rejected_count=?, validation_report=?::jsonb
                       WHERE id=?"
                      (count records) activated-count (count rejections)
                      (json/generate-string validation) run-id])
                    {:run-id run-id :status :succeeded
                     :staged-count (count records)
                     :activated-count activated-count
                     :validation validation}))))]
        outcome)
      (catch clojure.lang.ExceptionInfo error
        (let [data (ex-data error)
              locked? (= :source-locked (:type data))
              status (if locked? "skipped_locked" "failed")]
          (mark-run! db run-id status
                     {:staged-count 0 :activated-count 0
                      :rejected-count (count rejections)
                      :validation (:validation data)
                      :error-class (some-> (:type data) name)
                      :error-message (.getMessage error)})
          (if locked?
            {:run-id run-id :status :skipped-locked}
            (throw error))))
      (catch Throwable error
        (mark-run! db run-id "failed"
                   {:staged-count 0 :activated-count 0
                    :rejected-count (count rejections)
                    :error-class (.getName (class error))
                    :error-message (.getMessage error)})
        (throw error)))))
