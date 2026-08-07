import { describe, expect, it } from "vitest";
import { ASK_DATA_TOOL_BUDGET, evidenceBudgetStep } from "@/lib/ask/budget";

describe("Ask evidence budget", () => {
  it("leaves tools available while evidence remains", () => {
    expect(evidenceBudgetStep(ASK_DATA_TOOL_BUDGET - 1, "guide")).toBeUndefined();
  });

  it("forces a final synthesis after the fourth successful tool", () => {
    const step = evidenceBudgetStep(ASK_DATA_TOOL_BUDGET, "guide");
    expect(step).toMatchObject({ activeTools: [], toolChoice: "none" });
    expect(step?.instructions).toContain("Synthesize the final answer");
    expect(step?.instructions).toContain("Do not call another tool");
  });
});
