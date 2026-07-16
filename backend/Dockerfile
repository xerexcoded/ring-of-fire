FROM clojure:temurin-25-tools-deps

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY deps.edn ./
RUN clojure -P -M:run

COPY resources ./resources
COPY src ./src

RUN groupadd --gid 10001 atlas \
    && useradd --uid 10001 --gid atlas --home-dir /app --shell /usr/sbin/nologin atlas \
    && chown -R atlas:atlas /app

USER atlas

EXPOSE 8080

CMD ["clojure", "-M:run"]
