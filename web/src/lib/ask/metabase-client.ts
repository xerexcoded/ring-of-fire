import { randomUUID } from "node:crypto";
import type { AskServerConfig } from "@/lib/ask/config";
import { sourceReceiptsForResource } from "@/lib/ask/sources";
import {
  analyticsFields,
  type AnalyticsResource,
  type NormalizedResult,
  type ResultColumn,
  type ResultValue,
} from "@/lib/ask/types";

export type AnalyticsFilter = {
  field: string;
  operator: "equals" | "not-equals" | "greater-than" | "greater-or-equal" | "less-than" | "less-or-equal" | "contains";
  value: string | number | boolean;
};

export type QueryAnalyticsInput = {
  resource: AnalyticsResource;
  select?: string[];
  groupBy?: string[];
  aggregation?: { function: "count" | "sum" | "average" | "minimum" | "maximum"; field?: string };
  filters?: AnalyticsFilter[];
  orderBy?: Array<{ field: string; direction: "ascending" | "descending" }>;
  limit?: number;
};

type SearchItem = {
  type?: string;
  id?: number;
  name?: string;
  display_name?: string;
  description?: string | null;
  database_schema?: string;
  database_id?: number;
  verified?: boolean;
};

type AgentQueryResponse = {
  status?: string;
  error?: string;
  data?: {
    cols?: Array<{ name?: string; display_name?: string; base_type?: string; effective_type?: string }>;
    rows?: unknown[][];
  };
  row_count?: number;
  running_time?: number;
  continuation_token?: string;
};

export class AskDependencyError extends Error {
  constructor(public readonly code: "metabase-offline" | "atlas-offline" | "model-offline" | "invalid-upstream-response", message: string) {
    super(message);
    this.name = "AskDependencyError";
  }
}

function isResultValue(value: unknown): value is ResultValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function assertAllowedField(resource: AnalyticsResource, field: string) {
  if (!analyticsFields[resource].includes(field)) {
    throw new Error(`Field ${field} is not available on analytics.${resource}.`);
  }
}

function fieldExpression(database: string, resource: AnalyticsResource, field: string) {
  assertAllowedField(resource, field);
  return ["field", {}, [database, "analytics", resource, field]];
}

function buildExternalQuery(database: string, input: QueryAnalyticsInput) {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 100);
  const stage: Record<string, unknown> = {
    "lib/type": "mbql.stage/mbql",
    "source-table": [database, "analytics", input.resource],
    limit,
  };

  const select = input.select?.slice(0, 10) ?? [];
  const groupBy = input.groupBy?.slice(0, 3) ?? [];
  select.forEach((field) => assertAllowedField(input.resource, field));
  groupBy.forEach((field) => assertAllowedField(input.resource, field));
  if (input.aggregation) {
    const operator = {
      count: "count",
      sum: "sum",
      average: "avg",
      minimum: "min",
      maximum: "max",
    }[input.aggregation.function];
    const aggregate = input.aggregation.function === "count" && !input.aggregation.field
      ? [operator, {}]
      : [operator, {}, fieldExpression(database, input.resource, input.aggregation.field ?? "")];
    stage.aggregation = [aggregate];
    if (groupBy.length) stage.breakout = groupBy.map((field) => fieldExpression(database, input.resource, field));
  } else if (select.length) {
    stage.fields = select.map((field) => fieldExpression(database, input.resource, field));
  }

  if (input.filters?.length) {
    const operators = {
      equals: "=",
      "not-equals": "!=",
      "greater-than": ">",
      "greater-or-equal": ">=",
      "less-than": "<",
      "less-or-equal": "<=",
      contains: "contains",
    } as const;
    const filters = input.filters.slice(0, 5).map(({ field, operator, value }) => [
      operators[operator], {}, fieldExpression(database, input.resource, field), value,
    ]);
    stage.filters = [filters.length === 1 ? filters[0] : ["and", {}, ...filters]];
  }
  if (input.orderBy?.length) {
    stage["order-by"] = input.orderBy.slice(0, 3).map(({ field, direction }) => [
      direction === "ascending" ? "asc" : "desc",
      {},
      fieldExpression(database, input.resource, field),
    ]);
  }

  return { query: { "lib/type": "mbql/query", stages: [stage] } };
}

function querySummary(input: QueryAnalyticsInput) {
  const sections = [`analytics.${input.resource}`];
  if (input.aggregation) sections.push(`${input.aggregation.function}${input.aggregation.field ? `(${input.aggregation.field})` : ""}`);
  else if (input.select?.length) sections.push(`fields: ${input.select.join(", ")}`);
  if (input.groupBy?.length) sections.push(`grouped by ${input.groupBy.join(", ")}`);
  if (input.filters?.length) sections.push(`${input.filters.length} filter${input.filters.length === 1 ? "" : "s"}`);
  sections.push(`limit ${Math.min(input.limit ?? 100, 100)}`);
  return sections.join(" · ");
}

export class MetabaseAgentClient {
  constructor(private readonly config: AskServerConfig, private readonly signal: AbortSignal) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.config.metabaseInternalUrl || !this.config.metabaseApiKey) {
      throw new AskDependencyError("metabase-offline", "Metabase Agent API is not configured.");
    }
    try {
      const response = await fetch(`${this.config.metabaseInternalUrl}/api/agent${path}`, {
        method: "POST",
        signal: this.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-Key": this.config.metabaseApiKey,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new AskDependencyError("metabase-offline", `Metabase Agent API returned ${response.status}.`);
      if (payload === null) throw new AskDependencyError("invalid-upstream-response", "Metabase returned an invalid response.");
      return payload as T;
    } catch (error) {
      if (this.signal.aborted) throw error;
      if (error instanceof AskDependencyError) throw error;
      throw new AskDependencyError("metabase-offline", "Metabase Agent API is unavailable.");
    }
  }

  async search(term: string) {
    const payload = await this.post<{ data?: SearchItem[]; total_count?: number }>("/v1/search", {
      term_queries: [term.slice(0, 120)],
    });
    const data = (payload.data ?? []).filter((item) =>
      item.type === "table"
      && item.database_schema?.toLowerCase() === "analytics"
      && Object.hasOwn(analyticsFields, item.name?.toLowerCase() ?? ""),
    );
    return {
      resources: data.slice(0, 10).map((item) => ({
        resource: item.name?.toLowerCase() as AnalyticsResource,
        displayName: item.display_name ?? item.name ?? "",
        description: item.description ?? null,
        verified: Boolean(item.verified),
      })),
      totalCount: data.length,
    };
  }

  private async resourceId(resource: AnalyticsResource) {
    const payload = await this.post<{ data?: SearchItem[] }>("/v1/search", { term_queries: [resource] });
    const found = (payload.data ?? []).find((item) =>
      item.type === "table"
      && item.database_schema?.toLowerCase() === "analytics"
      && item.name?.toLowerCase() === resource,
    );
    if (!Number.isInteger(found?.id)) throw new AskDependencyError("invalid-upstream-response", `analytics.${resource} was not found.`);
    return Number(found?.id);
  }

  async inspect(resource: AnalyticsResource) {
    const id = await this.resourceId(resource);
    const payload = await this.post<{ resources?: Array<{ content?: unknown; error?: unknown }> }>("/v1/read-resource", {
      uris: [`metabase://table/${id}/fields`],
    });
    const content = payload.resources?.[0]?.content;
    const record = typeof content === "object" && content !== null ? content as Record<string, unknown> : {};
    const candidates = Array.isArray(content)
      ? content
      : [record.fields, record.data, record.items].find(Array.isArray) ?? [];
    const fields = (candidates as unknown[]).flatMap((candidate) => {
      if (typeof candidate !== "object" || candidate === null) return [];
      const field = candidate as Record<string, unknown>;
      const name = typeof field.name === "string" ? field.name.toLowerCase() : "";
      if (!analyticsFields[resource].includes(name)) return [];
      return [{
        name,
        displayName: typeof field.display_name === "string" ? field.display_name : name,
        baseType: typeof field.base_type === "string" ? field.base_type : "type/*",
        semanticType: typeof field.semantic_type === "string" ? field.semantic_type : null,
        description: typeof field.description === "string" ? field.description : null,
      }];
    });
    return { resource, fields: fields.length ? fields : analyticsFields[resource].map((name) => ({ name, displayName: name, baseType: "type/*", semanticType: null, description: null })) };
  }

  async query(input: QueryAnalyticsInput): Promise<NormalizedResult> {
    const payload = await this.post<AgentQueryResponse>("/v2/query", buildExternalQuery(this.config.metabaseDatabaseName, input));
    if (payload.status !== "completed" || !Array.isArray(payload.data?.cols) || !Array.isArray(payload.data.rows)) {
      throw new AskDependencyError("invalid-upstream-response", payload.error || "Metabase did not complete the query.");
    }
    const columns: ResultColumn[] = payload.data.cols.map((column, index) => ({
      name: column.name?.toLowerCase() || `column_${index + 1}`,
      displayName: column.display_name || column.name || `Column ${index + 1}`,
      baseType: column.effective_type || column.base_type || "type/*",
    }));
    const rows = payload.data.rows.slice(0, 100).map((row) => columns.map((_, index) => isResultValue(row[index]) ? row[index] : String(row[index] ?? "")));
    const versionIndex = columns.findIndex((column) => column.name === "source_version");
    const versions = versionIndex >= 0 ? [...new Set(rows.map((row) => row[versionIndex]).filter((value): value is string => typeof value === "string"))] : [];
    return {
      resultId: randomUUID(),
      resource: `analytics.${input.resource}`,
      columns,
      rows,
      rowCount: Math.min(payload.row_count ?? rows.length, rows.length),
      truncated: Boolean(payload.continuation_token) || (payload.row_count ?? rows.length) > rows.length,
      querySummary: querySummary(input),
      sourceVersion: versions.length ? versions.join(", ") : "Version recorded in the source ledger; request source_version for row-level detail",
      retrievedAt: new Date().toISOString(),
      sources: sourceReceiptsForResource(input.resource),
    };
  }
}
