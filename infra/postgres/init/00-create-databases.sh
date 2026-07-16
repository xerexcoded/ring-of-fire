#!/bin/sh
set -eu

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set ring_writer_password="$RING_WRITER_PASSWORD" \
  --set metabase_app_password="$METABASE_DB_PASSWORD" \
  --set metabase_reader_password="$METABASE_READER_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE ring_writer LOGIN PASSWORD %L', :'ring_writer_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ring_writer') \gexec

SELECT format('CREATE ROLE metabase_app LOGIN PASSWORD %L', :'metabase_app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_app') \gexec

SELECT format('CREATE ROLE metabase_reader LOGIN PASSWORD %L', :'metabase_reader_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_reader') \gexec

SELECT 'CREATE DATABASE ring_data OWNER ring_writer'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ring_data') \gexec

SELECT 'CREATE DATABASE metabase_app OWNER metabase_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'metabase_app') \gexec
SQL

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname ring_data <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS core AUTHORIZATION ring_writer;
CREATE SCHEMA IF NOT EXISTS staging AUTHORIZATION ring_writer;
CREATE SCHEMA IF NOT EXISTS analytics AUTHORIZATION ring_writer;
CREATE SCHEMA IF NOT EXISTS ops AUTHORIZATION ring_writer;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA core, staging, ops FROM metabase_reader;
GRANT CONNECT ON DATABASE ring_data TO metabase_reader;
GRANT USAGE ON SCHEMA analytics TO metabase_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO metabase_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE ring_writer IN SCHEMA analytics
  GRANT SELECT ON TABLES TO metabase_reader;
SQL

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname metabase_app <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO metabase_app;
SQL

