"use client";

import { useEffect, useState } from "react";
import { atlasApi, type AtlasFilters } from "@/lib/api";
import {
  fallbackBoundaries,
  fallbackEarthquakes,
  fallbackTsunamis,
  fallbackVolcanoes,
} from "@/lib/data";
import type {
  BoundaryProperties,
  EarthquakeProperties,
  FeatureCollection,
  LineGeometry,
  PointGeometry,
  TsunamiProperties,
  VolcanoProperties,
} from "@/lib/types";

export type AtlasData = {
  volcanoes: FeatureCollection<PointGeometry, VolcanoProperties>;
  earthquakes: FeatureCollection<PointGeometry, EarthquakeProperties>;
  boundaries: FeatureCollection<LineGeometry, BoundaryProperties>;
  tsunamis: FeatureCollection<PointGeometry, TsunamiProperties>;
  loading: boolean;
};

export function useAtlasData(filters: AtlasFilters = {}): AtlasData {
  const [data, setData] = useState<Omit<AtlasData, "loading"> & { requestKey: string }>({
    volcanoes: fallbackVolcanoes,
    earthquakes: fallbackEarthquakes,
    boundaries: fallbackBoundaries,
    tsunamis: fallbackTsunamis,
    requestKey: "",
  });
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      atlasApi.volcanoes(filters, controller.signal),
      atlasApi.earthquakes(filters, controller.signal),
      atlasApi.boundaries(filters, controller.signal),
      atlasApi.tsunamis(filters, controller.signal),
    ])
      .then(([volcanoes, earthquakes, boundaries, tsunamis]) => {
        setData({ volcanoes, earthquakes, boundaries, tsunamis, requestKey: filterKey });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setData((current) => ({ ...current, requestKey: filterKey }));
        }
      });

    return () => controller.abort();
    // filterKey is the stable serialization of the public filter object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  return {
    volcanoes: data.volcanoes,
    earthquakes: data.earthquakes,
    boundaries: data.boundaries,
    tsunamis: data.tsunamis,
    loading: data.requestKey !== filterKey,
  };
}
