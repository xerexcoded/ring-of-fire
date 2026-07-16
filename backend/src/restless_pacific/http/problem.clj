(ns restless-pacific.http.problem
  (:require [clojure.string :as str]))

(def default-type "https://restless-pacific.dev/problems/internal-error")

(defn problem
  ([status title detail]
   (problem status title detail nil))
  ([status title detail extra]
   (merge {:type (str "https://restless-pacific.dev/problems/"
                      (-> title str/lower-case (str/replace #"[^a-z0-9]+" "-")
                          (str/replace #"(^-|-$)" "")))
           :title title
           :status status
           :detail detail}
          extra)))

(defn fail!
  ([status title detail]
   (throw (ex-info detail {:problem (problem status title detail)})))
  ([status title detail extra]
   (throw (ex-info detail {:problem (problem status title detail extra)}))))

(defn response [request body]
  {:status (:status body 500)
   :headers {"Content-Type" "application/problem+json; charset=utf-8"
             "Cache-Control" "no-store"}
   :body (assoc body :instance (:uri request))})
