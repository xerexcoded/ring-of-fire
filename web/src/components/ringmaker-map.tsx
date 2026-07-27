"use client";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type {
  BoundaryProperties,
  DefinitionComparisonResponse,
  FeatureCollection,
  LineGeometry,
} from "@/lib/types";

type RingmakerMapProps = {
  comparison: DefinitionComparisonResponse;
  boundaries: FeatureCollection<LineGeometry, BoundaryProperties>;
  selectedVolcano: number | null;
  onSelect: (volcanoNumber: number) => void;
};

function featureData(collection: { type: "FeatureCollection"; features: unknown[] }) {
  return { type: collection.type, features: collection.features } as never;
}

function setSource(
  map: MapLibreMap,
  id: string,
  collection: { type: "FeatureCollection"; features: unknown[] },
) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) source.setData(featureData(collection));
}

export function RingmakerMap({
  comparison,
  boundaries,
  selectedVolcano,
  onSelect,
}: RingmakerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("maplibre-gl")
      .then(({ default: maplibregl }) => {
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style:
            process.env.NEXT_PUBLIC_MAP_STYLE_URL
            ?? "https://tiles.openfreemap.org/styles/fiord",
          center: [168, 4],
          zoom: 1.45,
          minZoom: 1,
          maxZoom: 10,
          renderWorldCopies: true,
          attributionControl: false,
          cooperativeGestures: true,
        });
        mapRef.current = map;
        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution:
              '<a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a>',
          }),
          "bottom-right",
        );
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right",
        );

        map.once("load", () => {
          if (cancelled) return;
          map.addSource("ringmaker-boundaries", {
            type: "geojson",
            data: featureData(boundaries),
          });
          map.addSource("ringmaker-volcanoes", {
            type: "geojson",
            data: featureData(comparison),
          });

          map.addLayer({
            id: "ringmaker-boundaries",
            type: "line",
            source: "ringmaker-boundaries",
            paint: {
              "line-color": [
                "match",
                ["get", "boundaryType"],
                "convergent",
                "#ff7955",
                "transform",
                "#6ea3b7",
                "#ada89f",
              ],
              "line-opacity": 0.58,
              "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 6, 2.4],
              "line-dasharray": [2, 2],
            },
          });
          map.addLayer({
            id: "ringmaker-volcanoes",
            type: "circle",
            source: "ringmaker-volcanoes",
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                ["match", ["get", "comparison"], "neither", 1.5, 3.6],
                7,
                ["match", ["get", "comparison"], "neither", 3, 8],
              ],
              "circle-color": [
                "match",
                ["get", "comparison"],
                "both",
                "#f1efe8",
                "smithsonian-only",
                "#ff5a2f",
                "rule-only",
                "#76d7e5",
                "#59656a",
              ],
              "circle-opacity": [
                "match",
                ["get", "comparison"],
                "neither",
                0.2,
                0.88,
              ],
              "circle-stroke-color": [
                "match",
                ["get", "comparison"],
                "both",
                "#191d1f",
                "smithsonian-only",
                "#43170d",
                "rule-only",
                "#0d3037",
                "#172025",
              ],
              "circle-stroke-width": [
                "match",
                ["get", "comparison"],
                "neither",
                0,
                0.9,
              ],
              "circle-opacity-transition": { duration: 220 },
              "circle-radius-transition": { duration: 220 },
            },
          });
          map.addLayer({
            id: "ringmaker-selection",
            type: "circle",
            source: "ringmaker-volcanoes",
            filter: ["==", ["get", "volcanoNumber"], -1],
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 9, 7, 17],
              "circle-color": "rgba(255,90,47,.08)",
              "circle-stroke-color": "#ffb09b",
              "circle-stroke-width": 1.5,
            },
          });

          const selectVolcano = (event: MapLayerMouseEvent) => {
            const volcanoNumber = Number(
              event.features?.[0]?.properties?.volcanoNumber,
            );
            if (Number.isFinite(volcanoNumber)) {
              onSelectRef.current(volcanoNumber);
            }
          };
          map.on("click", "ringmaker-volcanoes", selectVolcano);
          map.on("mouseenter", "ringmaker-volcanoes", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "ringmaker-volcanoes", () => {
            map.getCanvas().style.cursor = "";
          });
          setReady(true);
        });
        map.on("error", (event) => {
          if (event.error?.message?.includes("style")) setFailed(true);
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is initialized once; subsequent data arrives through GeoJSON sources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setSource(map, "ringmaker-volcanoes", comparison);
    setSource(map, "ringmaker-boundaries", boundaries);
  }, [boundaries, comparison, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("ringmaker-selection", [
      "==",
      ["get", "volcanoNumber"],
      selectedVolcano ?? -1,
    ]);
  }, [ready, selectedVolcano]);

  return (
    <div className="ringmaker-map" data-ready={ready} data-failed={failed}>
      <div ref={containerRef} className="map-canvas" aria-hidden="true" />
      {!ready && (
        <div className="map-loading" aria-live="polite">
          <span />
          {failed
            ? "Basemap unavailable — comparison remains below"
            : "Preparing the definition field…"}
        </div>
      )}
    </div>
  );
}
