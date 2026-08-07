import type { Spec } from "@json-render/core";
import { getToolName, isToolUIPart } from "ai";
import type { AskUIMessage, DashboardResourceKey } from "@/lib/ask/types";
import { dashboardResourceKeys } from "@/lib/ask/types";

export type WorkspacePresentation = {
  resourceKey: DashboardResourceKey;
  title: string;
  anchor: string;
  number: string;
  context: string;
};

export const workspacePresentations: Record<DashboardResourceKey, WorkspacePresentation> = {
  "ring-of-fire-data-lab": {
    resourceKey: "ring-of-fire-data-lab",
    title: "Pacific evidence overview",
    anchor: "overview",
    number: "01",
    context: "Coverage and completeness across the analytical store",
  },
  "volcano-eruption-data-lab": {
    resourceKey: "volcano-eruption-data-lab",
    title: "Volcanoes and eruptions",
    anchor: "volcanoes",
    number: "02",
    context: "Reviewed volcanoes, eruptions, and VEI records",
  },
  "earthquake-plate-data-lab": {
    resourceKey: "earthquake-plate-data-lab",
    title: "Earthquakes and plate boundaries",
    anchor: "seismicity",
    number: "03",
    context: "Recent earthquakes with plate-boundary context",
  },
  "tsunami-impact-data-lab": {
    resourceKey: "tsunami-impact-data-lab",
    title: "Historical tsunamis and recorded impacts",
    anchor: "tsunamis",
    number: "04",
    context: "Historical tsunami observations and recorded impacts",
  },
};

export function isDashboardResourceKey(value: unknown): value is DashboardResourceKey {
  return typeof value === "string" && dashboardResourceKeys.includes(value as DashboardResourceKey);
}

export function workspaceFromToolParts(parts: AskUIMessage["parts"]): WorkspacePresentation | null {
  const workspacePart = parts.findLast((part) =>
    isToolUIPart(part)
      && getToolName(part) === "showWorkspace"
      && part.state === "output-available",
  );
  if (!workspacePart || !isToolUIPart(workspacePart) || getToolName(workspacePart) !== "showWorkspace" || workspacePart.state !== "output-available") return null;
  const output = workspacePart.output;
  if (typeof output !== "object" || output === null || !("resourceKey" in output) || !isDashboardResourceKey(output.resourceKey)) return null;
  return workspacePresentations[output.resourceKey];
}

export function specIncludesWorkspace(spec: Spec | null) {
  if (!spec || typeof spec.elements !== "object" || spec.elements === null) return false;
  return Object.values(spec.elements).some((element) => element.type === "MetabaseWorkspace");
}
