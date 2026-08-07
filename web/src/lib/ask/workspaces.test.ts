import { describe, expect, it } from "vitest";
import type { AskUIMessage } from "@/lib/ask/types";
import { specIncludesWorkspace, workspaceFromToolParts } from "@/lib/ask/workspaces";

describe("Ask workspace rendering", () => {
  it("turns a successful showWorkspace tool result into an allowlisted presentation", () => {
    const parts = [{
      type: "tool-showWorkspace",
      toolCallId: "workspace-call",
      state: "output-available",
      input: { resourceKey: "tsunami-impact-data-lab" },
      output: { resourceKey: "tsunami-impact-data-lab" },
    }] as AskUIMessage["parts"];

    expect(workspaceFromToolParts(parts)).toMatchObject({
      resourceKey: "tsunami-impact-data-lab",
      title: "Historical tsunamis and recorded impacts",
      anchor: "tsunamis",
    });
  });

  it("rejects failed and unapproved workspace outputs", () => {
    const failed = [{
      type: "tool-showWorkspace",
      toolCallId: "workspace-call",
      state: "output-error",
      input: { resourceKey: "tsunami-impact-data-lab" },
      errorText: "offline",
    }] as AskUIMessage["parts"];
    const unapproved = [{
      type: "tool-showWorkspace",
      toolCallId: "workspace-call",
      state: "output-available",
      input: { resourceKey: "arbitrary-dashboard" },
      output: { resourceKey: "arbitrary-dashboard" },
    }] as AskUIMessage["parts"];

    expect(workspaceFromToolParts(failed)).toBeNull();
    expect(workspaceFromToolParts(unapproved)).toBeNull();
  });

  it("detects a model-generated workspace so the fallback is not duplicated", () => {
    expect(specIncludesWorkspace({
      root: "workspace",
      elements: {
        workspace: {
          type: "MetabaseWorkspace",
          props: { resourceKey: "earthquake-plate-data-lab", title: "Earthquakes" },
          children: [],
        },
      },
    })).toBe(true);
    expect(specIncludesWorkspace(null)).toBe(false);
  });
});
