(ns restless-pacific.security.guest-token-test
  (:require [buddy.sign.jwt :as jwt]
            [clojure.test :refer [deftest is testing]]
            [restless-pacific.repository.atlas :as repo]
            [restless-pacific.security.guest-token :as token]))

(def secret "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
(def config {:secret secret :ttl-seconds 3600
             :allowed-origins #{"http://www.localhost"}})

(deftest issues-one-hour-hs256-token-for-allowlisted-resource
  (with-redefs [repo/metabase-resource
                (fn [_ entity-type entity-id]
                  (when (= ["dashboard" 5] [entity-type entity-id])
                    {:entity_type entity-type
                     :entity_id entity-id
                     ;; This is the decoded shape produced by the repository's
                     ;; allowed_parameters::text conversion.
                     :allowed_parameters ["region" "start_year"]}))]
    (let [issued (token/issue! :db config
                               {:entityType "dashboard"
                                :entityId 5
                                :customContext {:region "Andes" :start_year 1960}})
          claims (jwt/unsign (:jwt issued) secret {:alg :hs256})]
      (is (= #{:jwt} (set (keys issued))))
      (is (= {:dashboard 5} (:resource claims)))
      (is (= {:region "Andes" :start_year 1960} (:params claims)))
      (is (= 3600 (- (:exp claims) (:iat claims)))))))

(deftest rejects-unknown-resource-and-parameter
  (testing "resource IDs must be explicitly published"
    (with-redefs [repo/metabase-resource (constantly nil)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"allow-list"
                            (token/issue! :db config
                                          {:entityType "dashboard" :entityId 999})))))
  (testing "custom context cannot smuggle uncontrolled filters"
    (with-redefs [repo/metabase-resource
                  (constantly {:allowed_parameters ["region"]})]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not allowed"
                            (token/issue! :db config
                                          {:entityType "question" :entityId 1
                                           :customContext {:admin true}}))))))

(deftest explicit-origin-policy
  (is (token/origin-allowed? config "http://www.localhost"))
  (is (token/origin-allowed? config nil))
  (is (false? (token/origin-allowed? config "https://attacker.example"))))
