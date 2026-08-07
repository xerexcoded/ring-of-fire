export const ASK_DATA_TOOL_BUDGET = 4;

export const ASK_DATA_TOOL_BUDGET_ERROR = "The four-tool data budget for this answer has been exhausted.";

export function evidenceBudgetStep(completedDataTools: number, instructions: string) {
  if (completedDataTools < ASK_DATA_TOOL_BUDGET) return undefined;
  return {
    activeTools: [],
    toolChoice: "none" as const,
    instructions: `${instructions}\n\nEvidence collection is complete for this answer. Synthesize the final answer from the tool results already returned. Do not call another tool, mention an internal tool budget, or repeat a transition into the answer.`,
  };
}
