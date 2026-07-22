CREATE OR REPLACE VIEW analytics.plate_boundaries AS
SELECT boundary_id,
       name,
       boundary_type,
       round((ST_Length(geom::geography) / 1000.0)::numeric, 1) AS length_km,
       source_version
FROM core.plate_boundary;
--;;

GRANT SELECT ON analytics.plate_boundaries TO metabase_reader;
--;;
