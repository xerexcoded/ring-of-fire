import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { curatedSourceIds } from "@/lib/ask/sources";
import { dashboardResourceKeys } from "@/lib/ask/types";

const fieldName = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_]+$/);
const resultId = z.string().uuid();

export const askCatalog = defineCatalog(schema, {
  components: {
    MetricStrip: {
      props: z.object({
        resultId,
        title: z.string().min(1).max(120),
        metrics: z.array(z.object({
          label: z.string().min(1).max(60),
          field: fieldName,
          format: z.enum(["number", "integer", "percent", "year"]).default("number"),
        }).strict()).min(1).max(4),
      }).strict(),
      description: "One to four headline values taken from the first row of a server-issued query result.",
    },
    InteractiveSeries: {
      props: z.object({
        resultId,
        title: z.string().min(1).max(120),
        mode: z.enum(["line", "bar", "scatter"]),
        xField: fieldName,
        yField: fieldName,
        seriesField: fieldName.nullable().default(null),
      }).strict(),
      description: "A fixed accessible line, bar, or scatter visualization backed only by a server-issued result ID.",
    },
    EvidenceTable: {
      props: z.object({
        resultId,
        title: z.string().min(1).max(120),
        columns: z.array(z.object({ field: fieldName, label: z.string().min(1).max(60) }).strict()).min(1).max(8),
      }).strict(),
      description: "A compact evidence table backed only by a server-issued result ID.",
    },
    PacificMap: {
      props: z.object({
        resultId,
        title: z.string().min(1).max(120),
        latitudeField: fieldName,
        longitudeField: fieldName,
        labelField: fieldName.nullable().default(null),
      }).strict(),
      description: "An interactive Pacific map for a server result containing latitude and longitude fields.",
    },
    EventTimeline: {
      props: z.object({
        resultId,
        title: z.string().min(1).max(120),
        dateField: fieldName,
        labelField: fieldName,
        detailField: fieldName.nullable().default(null),
      }).strict(),
      description: "A chronological evidence timeline backed only by a server-issued result ID.",
    },
    DefinitionReceipt: {
      props: z.object({ resultId, title: z.string().min(1).max(120) }).strict(),
      description: "A receipt for a Restless Pacific rule comparison, including fingerprint and disagreement counts.",
    },
    MetabaseWorkspace: {
      props: z.object({
        resourceKey: z.enum(dashboardResourceKeys),
        title: z.string().min(1).max(120),
      }).strict(),
      description: "One of four existing published read-only Metabase dashboard workspaces.",
    },
    SourceList: {
      props: z.object({
        title: z.string().min(1).max(120),
        sourceIds: z.array(z.enum(curatedSourceIds as [typeof curatedSourceIds[number], ...typeof curatedSourceIds[number][]])).min(1).max(6),
      }).strict(),
      description: "Links and context from the fixed approved scientific source catalog.",
    },
  },
  actions: {},
});

export const askCatalogPrompt = askCatalog.prompt({
  mode: "inline",
  customRules: [
    "Prefer prose-only answers when a visual block would not materially improve understanding.",
    "Use only resultId values returned by tools in the current answer. Never invent UUIDs.",
    "Never put numerical data arrays in component props. Data components resolve data by resultId.",
    "Never emit JavaScript, JSX, HTML, CSS, URLs, component names outside this catalog, or actions.",
    "Every visual answer using analytical data should include a SourceList or rely on the evidence receipt rendered with the block.",
  ],
});

export function validateAskSpec(spec: unknown): Spec | null {
  if (typeof spec !== "object" || spec === null || !("elements" in spec) || typeof spec.elements !== "object" || spec.elements === null) return null;
  const componentDefinitions = askCatalog.data.components as Record<string, { props: z.ZodType }>;
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(spec.elements)) {
    if (typeof value !== "object" || value === null) return null;
    const element = value as Record<string, unknown>;
    if (typeof element.type !== "string" || !(element.type in componentDefinitions)) return null;
    const parsedProps = componentDefinitions[element.type].props.safeParse(element.props);
    if (!parsedProps.success) return null;
    entries.push([key, { ...element, props: parsedProps.data, visible: "visible" in element ? element.visible : null }]);
  }
  const elements = Object.fromEntries(entries);
  const validated = askCatalog.validate({ ...spec, elements });
  if (!validated.success || !validated.data) return null;
  return {
    ...validated.data,
    elements: Object.fromEntries(Object.entries(validated.data.elements).map(([key, value]) => {
      const { visible, ...element } = value;
      return [key, visible === null ? element : value];
    })),
  } as Spec;
}
