"use client";

import { getToolName, type ToolUIPart } from "ai";
import { AlertCircle, Check, ListChecks, Minus, RotateCw } from "lucide-react";
import { Steps, StepsBar, StepsContent, StepsItem, StepsTrigger } from "@/components/prompt-kit/steps";

const toolLabels: Record<string, string> = {
  inspectAnalytics: "Inspect analytics fields",
  searchAnalytics: "Find governed data",
  queryAnalytics: "Query analytical records",
  lookupAtlas: "Read atlas records",
  compareRingDefinition: "Compare Ring definitions",
  lookupCuratedSource: "Attach approved sources",
  showWorkspace: "Open published workspace",
};

type EvidenceStepState = "complete" | "running" | "skipped" | "unavailable";

function isBudgetExhaustion(part: ToolUIPart, completedBefore = 0) {
  return part.state === "output-error" && (
    part.errorText.toLowerCase().includes("four-tool data budget")
    || completedBefore >= 4
  );
}

function stepState(part: ToolUIPart, completedBefore = 0): EvidenceStepState {
  if (isBudgetExhaustion(part, completedBefore) || part.state === "output-denied") return "skipped";
  if (part.state === "output-error") return "unavailable";
  if (part.state === "output-available") return "complete";
  if (part.state === "approval-responded" && !part.approval.approved) return "skipped";
  return "running";
}

function stepCopy(part: ToolUIPart, state: EvidenceStepState, completedBefore: number) {
  if (state === "running") return { status: "In progress", note: "Reading governed evidence for this answer." };
  if (state === "skipped" && isBudgetExhaustion(part, completedBefore)) return { status: "Skipped", note: "Evidence budget reached; completed results were kept." };
  if (state === "skipped") return { status: "Skipped", note: "This step was not needed for the final answer." };
  if (state === "unavailable") return { status: "Unavailable", note: "This source did not return data; completed evidence remains available." };

  const output = "output" in part && typeof part.output === "object" && part.output !== null
    ? part.output as Record<string, unknown>
    : null;
  if (typeof output?.rowCount === "number") {
    const noun = output.rowCount === 1 ? "record" : "records";
    return { status: "Complete", note: `${output.rowCount.toLocaleString()} ${noun} returned.` };
  }
  if (getToolName(part) === "showWorkspace") return { status: "Complete", note: "Published Data Lab workspace ready." };
  return { status: "Complete", note: "Evidence returned and available to the answer." };
}

function StepIcon({ state }: { state: EvidenceStepState }) {
  if (state === "complete") return <Check aria-hidden="true" />;
  if (state === "running") return <RotateCw aria-hidden="true" />;
  if (state === "skipped") return <Minus aria-hidden="true" />;
  return <AlertCircle aria-hidden="true" />;
}

function EvidenceStep({ part, state, completedBefore }: { part: ToolUIPart; state: EvidenceStepState; completedBefore: number }) {
  const copy = stepCopy(part, state, completedBefore);
  const toolName = getToolName(part);
  const input = "input" in part ? part.input : undefined;
  const hasInput = input !== undefined && input !== null;

  return (
    <StepsItem className="ask-tool-step" data-step-state={state}>
      <span className="ask-tool-step-icon"><StepIcon state={state} /></span>
      <span className="ask-tool-step-copy">
        <span className="ask-tool-step-heading">
          <strong>{toolLabels[toolName] ?? toolName}</strong>
          <small>{copy.status}</small>
        </span>
        <span>{copy.note}</span>
        {hasInput && (
          <details className="ask-tool-step-details">
            <summary>Details</summary>
            <pre>{JSON.stringify(input, null, 2)}</pre>
          </details>
        )}
      </span>
    </StepsItem>
  );
}

export function ToolSteps({ parts, isStreaming }: { parts: ToolUIPart[]; isStreaming: boolean }) {
  if (!parts.length) return null;
  const steps = parts.reduce<{
    completed: number;
    items: Array<{ part: ToolUIPart; state: EvidenceStepState; completedBefore: number }>;
  }>((summary, part) => {
    const state = stepState(part, summary.completed);
    return {
      completed: summary.completed + (state === "complete" ? 1 : 0),
      items: [...summary.items, { part, state, completedBefore: summary.completed }],
    };
  }, { completed: 0, items: [] }).items;
  const counts = steps.reduce<Record<EvidenceStepState, number>>((total, step) => {
    total[step.state] += 1;
    return total;
  }, { complete: 0, running: 0, skipped: 0, unavailable: 0 });
  const summary = [
    counts.complete ? `${counts.complete} complete` : "",
    counts.running ? `${counts.running} active` : "",
    counts.skipped ? `${counts.skipped} skipped` : "",
    counts.unavailable ? `${counts.unavailable} unavailable` : "",
  ].filter(Boolean).join(" · ");

  return (
    <Steps className="ask-tool-steps" defaultOpen={isStreaming || counts.running > 0 || counts.unavailable > 0}>
      <StepsTrigger className="ask-tool-steps-trigger" leftIcon={<ListChecks aria-hidden="true" />}>
        <span className="ask-tool-steps-label"><span>Evidence process</span><small>· {summary}</small></span>
      </StepsTrigger>
      <StepsContent className="ask-tool-steps-content" bar={<StepsBar className="ask-tool-steps-bar" />}>
        {steps.map((step) => <EvidenceStep key={step.part.toolCallId} {...step} />)}
      </StepsContent>
    </Steps>
  );
}
