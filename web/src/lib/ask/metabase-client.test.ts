import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskServerConfig } from "@/lib/ask/config";
import { MetabaseAgentClient } from "@/lib/ask/metabase-client";

const config = {
  enabled: true,
  available: true,
  unavailableReason: null,
  modelId: "deepseek/deepseek-v4-flash-0731",
  metabaseInternalUrl: "http://metabase:3000",
  metabaseApiKey: "secret",
  metabaseDatabaseName: "Restless Pacific Analytics",
  windowLimit: 10,
  dailyLimit: 50,
  windowMs: 600_000,
} satisfies AskServerConfig;

afterEach(() => vi.unstubAllGlobals());

describe("MetabaseAgentClient", () => {
  it("constructs a portable allowlisted query and normalizes the result", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const stage = body.query.stages[0];
      expect(stage["source-table"]).toEqual(["Restless Pacific Analytics", "analytics", "earthquakes"]);
      expect(stage.filters).toEqual([[">=", {}, ["field", {}, ["Restless Pacific Analytics", "analytics", "earthquakes", "magnitude"]], 6]]);
      expect(stage.limit).toBe(100);
      return Response.json({
        status: "completed",
        data: { cols: [{ name: "magnitude", display_name: "Magnitude", base_type: "type/Float" }, { name: "source_version", display_name: "Source version", base_type: "type/Text" }], rows: [[6.2, "usgs-fixture"]] },
        row_count: 1,
        running_time: 8,
      }, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new MetabaseAgentClient(config, new AbortController().signal);
    const result = await client.query({ resource: "earthquakes", select: ["magnitude", "source_version"], filters: [{ field: "magnitude", operator: "greater-or-equal", value: 6 }], limit: 100 });
    expect(result.rows).toEqual([[6.2, "usgs-fixture"]]);
    expect(result.sourceVersion).toBe("usgs-fixture");
    expect(result.resultId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects fields outside the selected analytics view before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new MetabaseAgentClient(config, new AbortController().signal);
    await expect(client.query({ resource: "volcanoes", select: ["password"], limit: 10 })).rejects.toThrow(/not available/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
