(ns restless-pacific.http.routes-test
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is]]
            [restless-pacific.http.routes :as routes]
            [restless-pacific.repository.atlas :as repo]))

(def token-config
  {:secret "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
   :ttl-seconds 3600
   :allowed-origins #{"http://www.localhost"}})

(deftest geojson-contract-and-cors
  (with-redefs [repo/volcanoes
                (fn [_ _]
                  [{:type "Feature"
                    :geometry {:type "Point" :coordinates [138.727 35.361]}
                    :properties {:volcanoNumber 283030
                                 :slug "fuji"
                                 :name "Fuji"
                                 :source {:dataset "gvp"
                                          :version "5.3.6"
                                          :refreshedAt "2026-07-15T00:00:00Z"}}}])]
    (let [handler (routes/handler {:db :db :token-config token-config})
          response (handler {:request-method :get
                             :uri "/api/v1/atlas/volcanoes"
                             :query-string "limit=1&minVei=5"
                             :headers {"origin" "http://www.localhost"}})
          body (json/parse-string (:body response) true)]
      (is (= 200 (:status response)))
      (is (= "application/geo+json; charset=utf-8"
             (get-in response [:headers "Content-Type"])))
      (is (= "http://www.localhost"
             (get-in response [:headers "Access-Control-Allow-Origin"])))
      (is (= "true" (get-in response [:headers "Access-Control-Allow-Credentials"])))
      (is (= "FeatureCollection" (:type body)))
      (is (= {:count 1 :limit 1 :offset 0 :sourceDataset "gvp"}
             (select-keys (:meta body) [:count :limit :offset :sourceDataset])))
      (is (= "fuji" (get-in body [:features 0 :properties :slug])))
      (is (some? (get-in body [:features 0 :properties :source :refreshedAt]))))))

(deftest problems-use-rfc7807-media-type
  (let [handler (routes/handler {:db :db :token-config token-config})
        response (handler {:request-method :get
                           :uri "/api/v1/atlas/volcanoes"
                           :query-string "bbox=bad"
                           :headers {}})
        body (json/parse-string (:body response) true)]
    (is (= 400 (:status response)))
    (is (= "application/problem+json; charset=utf-8"
           (get-in response [:headers "Content-Type"])))
    (is (= 400 (:status body)))
    (is (= "/api/v1/atlas/volcanoes" (:instance body)))))

(deftest resolves-enabled-metabase-resource-key-to-public-numeric-id
  (with-redefs [repo/metabase-resource-by-key
                (fn [_ key]
                  (when (= "ring-of-fire-data-lab" key)
                    {:resource_key key
                     :entity_type "dashboard"
                     :entity_id 5
                     :display_name "Restless Pacific Data Lab"}))]
    (let [handler (routes/handler {:db :db :token-config token-config})
          response (handler {:request-method :get
                             :uri "/api/v1/metabase/resources/ring-of-fire-data-lab"
                             :headers {}})
          body (json/parse-string (:body response) true)]
      (is (= 200 (:status response)))
      (is (= {:entityType "dashboard"
              :entityId 5
              :resourceKey "ring-of-fire-data-lab"
              :displayName "Restless Pacific Data Lab"}
             body)))
    (let [handler (routes/handler {:db :db :token-config token-config})
          response (handler {:request-method :get
                             :uri "/api/v1/metabase/resources/not-published"
                             :headers {}})]
      (is (= 404 (:status response)))
      (is (= "application/problem+json; charset=utf-8"
             (get-in response [:headers "Content-Type"]))))))
