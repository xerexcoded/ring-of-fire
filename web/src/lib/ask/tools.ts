import { tool } from "ai";
import { z } from "zod";
import { compareRingDefinition, lookupAtlas } from "@/lib/ask/atlas-client";
import type { AskServerConfig } from "@/lib/ask/config";
import { lookupCuratedSources, curatedSourceIds } from "@/lib/ask/sources";
import { MetabaseAgentClient } from "@/lib/ask/metabase-client";
import {
  analyticsFields,
  analyticsResources,
  dashboardResourceKeys,
  type NormalizedResult,
  type SourceReceipt,
} from "@/lib/ask/types";

const fieldName = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/);

type AskToolContext = {
  config: AskServerConfig;
  signal: AbortSignal;
  emitResult: (result: NormalizedResult) => void;
  emitReceipt?: (receipt: SourceReceipt) => void;
  onToolExecuted?: (name: string, rowCount?: number) => void;
};

export function createAskTools({ config, signal, emitResult, emitReceipt, onToolExecuted }: AskToolContext) {
  const metabase = new MetabaseAgentClient(config, signal);
  let dataToolExecutions = 0;

  async function bounded<T>(name: string, run: () => Promise<T>, rowCount?: (value: T) => number | undefined) {
    dataToolExecutions += 1;
    if (dataToolExecutions > 4) throw new Error("The four-tool data budget for this answer has been exhausted.");
    const value = await run();
    onToolExecuted?.(name, rowCount?.(value));
    return value;
  }

  function emit(result: NormalizedResult) {
    emitResult(result);
    return result;
  }

  return {
    searchAnalytics: tool({
      description: "Find relevant read-only analytics views in the governed Metabase semantic layer. Results are restricted to the five allowlisted analytics views.",
      inputSchema: z.object({ query: z.string().min(1).max(120) }),
      execute: ({ query }) => bounded("searchAnalytics", () => metabase.search(query)),
    }),
    inspectAnalytics: tool({
      description: "Inspect the fields and semantic types of one allowlisted analytics view before constructing a query.",
      inputSchema: z.object({ resource: z.enum(analyticsResources) }),
      execute: ({ resource }) => bounded("inspectAnalytics", () => metabase.inspect(resource)),
    }),
    queryAnalytics: tool({
      description: "Construct and run a read-only select or aggregate query through Metabase Agent API. No SQL, writes, saved questions, or unlisted resources are possible. Request source_version when provenance detail is useful.",
      inputSchema: z.object({
        resource: z.enum(analyticsResources),
        select: z.array(fieldName).max(10).optional(),
        groupBy: z.array(fieldName).max(3).optional(),
        aggregation: z.object({
          function: z.enum(["count", "sum", "average", "minimum", "maximum"]),
          field: fieldName.optional(),
        }).optional(),
        filters: z.array(z.object({
          field: fieldName,
          operator: z.enum(["equals", "not-equals", "greater-than", "greater-or-equal", "less-than", "less-or-equal", "contains"]),
          value: z.union([z.string().max(200), z.number().finite(), z.boolean()]),
        })).max(5).optional(),
        orderBy: z.array(z.object({ field: fieldName, direction: z.enum(["ascending", "descending"]) })).max(3).optional(),
        limit: z.number().int().min(1).max(100).default(100),
      }).superRefine((input, context) => {
        const allowed = analyticsFields[input.resource];
        const fields = [
          ...(input.select ?? []),
          ...(input.groupBy ?? []),
          ...(input.filters ?? []).map((filter) => filter.field),
          ...(input.orderBy ?? []).map((order) => order.field),
          ...(input.aggregation?.field ? [input.aggregation.field] : []),
        ];
        for (const field of fields) {
          if (!allowed.includes(field)) context.addIssue({ code: "custom", message: `${field} is not available on analytics.${input.resource}.` });
        }
        if (input.aggregation && input.aggregation.function !== "count" && !input.aggregation.field) {
          context.addIssue({ code: "custom", message: `${input.aggregation.function} requires a field.` });
        }
      }),
      execute: (input) => bounded("queryAnalytics", async () => emit(await metabase.query(input)), (result) => result.rowCount),
    }),
    lookupAtlas: tool({
      description: "Read the existing Restless Pacific volcano, earthquake, plate-boundary, tsunami, search, or source-status APIs. This is observed catalog data, not live web search.",
      inputSchema: z.object({
        kind: z.enum(["volcanoes", "earthquakes", "boundaries", "tsunamis", "search", "source-status"]),
        query: z.string().min(1).max(120).optional(),
        region: z.string().min(1).max(100).optional(),
        start: z.string().max(40).optional(),
        end: z.string().max(40).optional(),
        minMagnitude: z.number().min(-2).max(10).optional(),
        maxDepthKm: z.number().min(0).max(800).optional(),
        minVei: z.number().int().min(0).max(8).optional(),
        limit: z.number().int().min(1).max(100).default(100),
      }),
      execute: (input) => bounded("lookupAtlas", async () => emit(await lookupAtlas(input, signal)), (result) => result.rowCount),
    }),
    compareRingDefinition: tool({
      description: "Run the existing Ringmaker comparison contract. Its Restless Pacific rule is an explicit comparison lens, never a scientific truth or hazard boundary.",
      inputSchema: z.object({
        tectonic: z.enum(["all", "subduction"]),
        maxDistanceKm: z.union([z.number().min(0).max(2_000), z.null()]),
        eruptedSince: z.union([z.literal(1800), z.literal(1960), z.null()]),
      }),
      execute: (input) => bounded("compareRingDefinition", async () => emit(await compareRingDefinition(input, signal)), (result) => result.rowCount),
    }),
    lookupCuratedSource: tool({
      description: "Return explanatory context and links from the bundled approved USGS, GVP, NOAA, and project Sourcebook catalog. It never accesses the open web.",
      inputSchema: z.object({ sourceIds: z.array(z.enum(curatedSourceIds as [typeof curatedSourceIds[number], ...typeof curatedSourceIds[number][]])).min(1).max(6) }),
      execute: ({ sourceIds }) => bounded("lookupCuratedSource", async () => {
        const sources = lookupCuratedSources(sourceIds);
        if (emitReceipt) {
          sources.forEach((source) => emitReceipt(source));
        }
        return { sources };
      }),
    }),
    showWorkspace: tool({
      description: "Select one of the four existing published Metabase Data Lab dashboards for an inline workspace. This does not create or alter Metabase content.",
      inputSchema: z.object({ resourceKey: z.enum(dashboardResourceKeys) }),
      execute: ({ resourceKey }) => bounded("showWorkspace", async () => ({ resourceKey })),
    }),
  };
}

export type AskTools = ReturnType<typeof createAskTools>;
