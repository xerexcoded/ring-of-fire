import { describe, expect, it } from "vitest";
import { validateAskSpec } from "@/lib/ask/catalog";

const resultId = "3b241101-e2bb-4255-8caf-4136c566a962";

describe("Ask json-render catalog", () => {
  it("accepts a catalog component with a server-issued result reference", () => {
    const result = validateAskSpec({
      root: "metric",
      elements: {
        metric: { type: "MetricStrip", props: { resultId, title: "Reviewed volcanoes", metrics: [{ label: "Volcanoes", field: "count", format: "integer" }] }, children: [] },
      },
    });
    expect(result).not.toBeNull();
  });

  it("rejects fabricated data arrays, hostile URLs, and unknown components", () => {
    const fabricated = validateAskSpec({
      root: "metric",
      elements: {
        metric: { type: "MetricStrip", props: { resultId, title: "Invented", metrics: [{ label: "Count", field: "count", format: "integer" }], data: [1, 2, 3] }, children: [] },
      },
    });
    expect(fabricated).toBeNull();
    expect(validateAskSpec({ root: "x", elements: { x: { type: "ArbitraryHtml", props: { url: "https://evil.test" }, children: [] } } })).toBeNull();
  });
});
