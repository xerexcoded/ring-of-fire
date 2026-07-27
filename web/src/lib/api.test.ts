import { describe, expect, it } from "vitest";
import { buildAtlasQuery, buildDefinitionQuery } from "@/lib/api";

describe("buildAtlasQuery", () => {
  it("maps UI filter names to the bounded public API contract", () => {
    const params = new URLSearchParams(buildAtlasQuery({
      bbox: [170, -40, -70, 60],
      region: "andes",
      startDate: "2026-07-01",
      endDate: "2026-07-15",
      minMagnitude: 4.5,
      maxDepth: 300,
      minVei: 3,
      maxVei: 7,
      volcanoType: "Stratovolcano",
      confidence: "authoritative",
      limit: 1000,
    }).slice(1));

    expect(Object.fromEntries(params)).toEqual({
      bbox: "170,-40,-70,60",
      region: "andes",
      start: "2026-07-01T00:00:00Z",
      end: "2026-07-15T23:59:59Z",
      minMagnitude: "4.5",
      maxDepthKm: "300",
      minVei: "3",
      maxVei: "7",
      type: "Stratovolcano",
      confidence: "authoritative",
      limit: "1000",
    });
  });
});

describe("buildDefinitionQuery", () => {
  it("serializes only the explicit bounded comparison rules", () => {
    expect(Object.fromEntries(new URLSearchParams(buildDefinitionQuery({
      tectonic: "subduction",
      maxDistanceKm: 175,
      eruptedSince: 1960,
    }).slice(1)))).toEqual({
      tectonic: "subduction",
      maxDistanceKm: "175",
      eruptedSince: "1960",
    });
  });

  it("omits disabled optional rules", () => {
    expect(buildDefinitionQuery({
      tectonic: "all",
      maxDistanceKm: null,
      eruptedSince: null,
    })).toBe("?tectonic=all");
  });
});
