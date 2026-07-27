import { describe, expect, it } from "vitest";
import {
  fallbackDefinitionComparison,
  fallbackVolcanoes,
  historyMoments,
  storyChapters,
  volcanoProfiles,
} from "@/lib/data";

describe("editorial fixtures", () => {
  it("ships all planned story and profile surfaces with stable identifiers", () => {
    expect(storyChapters).toHaveLength(6);
    expect(historyMoments).toHaveLength(7);
    expect(volcanoProfiles).toHaveLength(10);
    expect(new Set(volcanoProfiles.map(({ slug }) => slug)).size).toBe(10);
    expect(new Set(volcanoProfiles.map(({ volcanoNumber }) => volcanoNumber)).size).toBe(10);
  });

  it("keeps the fallback GeoJSON contract explicit and provenance-aware", () => {
    expect(fallbackVolcanoes.meta).toMatchObject({
      count: 10,
      limit: 1000,
      offset: 0,
      sourceDataset: "gvp-volcanoes",
      isFallback: true,
    });
    expect(fallbackVolcanoes.features.every(({ properties }) =>
      properties.source.url.startsWith("https://")
      && Boolean(properties.source.version)
      && properties.confidence === "authoritative",
    )).toBe(true);
  });

  it("keeps Ringmaker usable as an honest demonstration when the API is offline", () => {
    const subduction = fallbackDefinitionComparison({
      tectonic: "subduction",
      maxDistanceKm: null,
      eruptedSince: null,
    });
    const anySetting = fallbackDefinitionComparison({
      tectonic: "all",
      maxDistanceKm: null,
      eruptedSince: null,
    });

    expect(subduction.meta).toMatchObject({
      count: 13,
      baselineCount: 11,
      isFallback: true,
      fingerprint: "fallback:demonstration-subset",
    });
    expect(subduction.features.find(({ properties }) =>
      properties.name === "Krakatau",
    )?.properties.comparison).toBe("rule-only");
    expect(anySetting.meta.candidateCount).toBeGreaterThan(
      subduction.meta.candidateCount,
    );
    expect(Object.values(subduction.meta.comparisonCounts).reduce(
      (sum, count) => sum + count,
      0,
    )).toBe(subduction.meta.count);
  });
});
