"use client";

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { AtlasData } from "@/hooks/use-atlas-data";
import type { Position } from "@/lib/types";

type VisibleLayers = {
  volcanoes: boolean;
  earthquakes: boolean;
  boundaries: boolean;
  tsunamis: boolean;
};

type PacificMapProps = Pick<AtlasData, "volcanoes" | "earthquakes" | "boundaries" | "tsunamis"> & {
  center?: Position;
  zoom?: number;
  mode?: "journey" | "atlas";
  selectedVolcano?: number | null;
  visibleLayers?: VisibleLayers;
  onVolcanoSelect?: (volcanoNumber: number) => void;
};

const defaultVisibility: VisibleLayers = {
  volcanoes: true,
  earthquakes: true,
  boundaries: true,
  tsunamis: true,
};

function featureData(collection: { type: "FeatureCollection"; features: unknown[] }) {
  return { type: collection.type, features: collection.features } as never;
}

function setSource(map: MapLibreMap, id: string, data: { type: "FeatureCollection"; features: unknown[] }) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) source.setData(featureData(data));
}

export function PacificMap({
  volcanoes,
  earthquakes,
  boundaries,
  tsunamis,
  center = [168, 8],
  zoom = 1.65,
  mode = "journey",
  selectedVolcano = null,
  visibleLayers = defaultVisibility,
  onVolcanoSelect,
}: PacificMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onVolcanoSelect);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onVolcanoSelect;
  }, [onVolcanoSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style:
          process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
          "https://tiles.openfreemap.org/styles/fiord",
        center,
        zoom,
        minZoom: 1,
        maxZoom: 11,
        renderWorldCopies: true,
        attributionControl: false,
        cooperativeGestures: mode === "atlas",
        interactive: mode === "atlas",
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
      if (mode === "atlas") {
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      }

      map.once("load", () => {
        if (cancelled) return;
        map.addSource("rp-boundaries", { type: "geojson", data: featureData(boundaries) });
        map.addSource("rp-earthquakes", { type: "geojson", data: featureData(earthquakes) });
        map.addSource("rp-tsunamis", { type: "geojson", data: featureData(tsunamis) });
        map.addSource("rp-volcanoes", { type: "geojson", data: featureData(volcanoes) });

        map.addLayer({
          id: "rp-boundaries",
          type: "line",
          source: "rp-boundaries",
          paint: {
            "line-color": ["match", ["get", "boundaryType"], "transform", "#70a9c0", "divergent", "#c3bbb0", "#ff6a3e"],
            "line-opacity": 0.72,
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1, 6, 2.7],
            "line-dasharray": [2, 1.6],
          },
        });
        map.addLayer({
          id: "rp-earthquakes",
          type: "circle",
          source: "rp-earthquakes",
          paint: {
            "circle-color": ["interpolate", ["linear"], ["get", "magnitude"], 2.5, "#b9d4dd", 5, "#ffb09b", 7, "#ff5a2f"],
            "circle-radius": ["interpolate", ["linear"], ["get", "magnitude"], 2.5, 2.5, 7, 10],
            "circle-opacity": 0.5,
            "circle-stroke-color": "rgba(241,239,232,.7)",
            "circle-stroke-width": 0.55,
          },
        });
        map.addLayer({
          id: "rp-tsunamis",
          type: "circle",
          source: "rp-tsunamis",
          paint: {
            "circle-color": "rgba(5,8,10,.35)",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 5, 6, 10],
            "circle-stroke-color": "#f1efe8",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.95,
          },
        });
        map.addLayer({
          id: "rp-volcanoes-halo",
          type: "circle",
          source: "rp-volcanoes",
          filter: ["==", ["get", "volcanoNumber"], -1],
          paint: {
            "circle-radius": 16,
            "circle-color": "rgba(255,90,47,.15)",
            "circle-stroke-color": "#ff5a2f",
            "circle-stroke-width": 1,
          },
        });
        map.addLayer({
          id: "rp-volcanoes",
          type: "circle",
          source: "rp-volcanoes",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3.5, 7, 8],
            "circle-color": "#ff5a2f",
            "circle-stroke-color": "#30130c",
            "circle-stroke-width": 1.1,
          },
        });

        const handleVolcanoClick = (event: MapLayerMouseEvent) => {
          const volcanoNumber = Number(event.features?.[0]?.properties?.volcanoNumber);
          if (Number.isFinite(volcanoNumber)) onSelectRef.current?.(volcanoNumber);
        };
        map.on("click", "rp-volcanoes", handleVolcanoClick);
        map.on("mouseenter", "rp-volcanoes", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "rp-volcanoes", () => { map.getCanvas().style.cursor = ""; });
        setReady(true);
      });
      map.on("error", (event) => {
        if (event.error?.message?.includes("style")) setFailed(true);
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // A MapLibre map is intentionally initialized only once for this island.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setSource(map, "rp-volcanoes", volcanoes);
    setSource(map, "rp-earthquakes", earthquakes);
    setSource(map, "rp-boundaries", boundaries);
    setSource(map, "rp-tsunamis", tsunamis);
  }, [boundaries, earthquakes, ready, tsunamis, volcanoes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ center, zoom, duration: reduceMotion ? 0 : 1400, essential: false });
  }, [center, ready, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("rp-volcanoes-halo", ["==", ["get", "volcanoNumber"], selectedVolcano ?? -1]);
  }, [ready, selectedVolcano]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const [layer, shown] of Object.entries(visibleLayers)) {
      const id = `rp-${layer}`;
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", shown ? "visible" : "none");
    }
    if (map.getLayer("rp-volcanoes-halo")) {
      map.setLayoutProperty("rp-volcanoes-halo", "visibility", visibleLayers.volcanoes ? "visible" : "none");
    }
  }, [ready, visibleLayers]);

  return (
    <div className="pacific-map" data-ready={ready} data-failed={failed}>
      <div ref={containerRef} className="map-canvas" aria-hidden="true" />
      {!ready && (
        <div className="map-loading" aria-live="polite">
          <span />
          {failed ? "Basemap unavailable — data remains below" : "Resolving the Pacific…"}
        </div>
      )}
    </div>
  );
}
