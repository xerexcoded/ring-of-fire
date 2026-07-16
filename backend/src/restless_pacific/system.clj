(ns restless-pacific.system
  (:require [integrant.core :as ig]
            [restless-pacific.http.routes]
            [ring.adapter.jetty :as jetty]))

(defmethod ig/init-key :http/server [_ {:keys [handler port join?]}]
  (jetty/run-jetty handler {:port port :join? join?}))

(defmethod ig/halt-key! :http/server [_ server]
  (.stop server))
