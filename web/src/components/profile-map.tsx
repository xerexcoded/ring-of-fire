"use client";

import { PacificMap } from "@/components/pacific-map";
import { useAtlasData } from "@/hooks/use-atlas-data";
import type { Position } from "@/lib/types";

export function ProfileMap({ position, volcanoNumber }: { position: Position; volcanoNumber: number }) {
  const atlas = useAtlasData({ limit: 1000 });
  return (
    <PacificMap
      volcanoes={atlas.volcanoes}
      earthquakes={atlas.earthquakes}
      boundaries={atlas.boundaries}
      tsunamis={atlas.tsunamis}
      center={position}
      zoom={5.3}
      selectedVolcano={volcanoNumber}
      visibleLayers={{ volcanoes: true, earthquakes: true, boundaries: true, tsunamis: false }}
    />
  );
}
