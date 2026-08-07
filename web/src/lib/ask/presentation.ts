const INTERNAL_BUDGET_LANGUAGE = /\b(?:data(?:-tool| tool)?|tool) budget\b/i;

export function presentGuideText(text: string, role: "assistant" | "user" | "system") {
  if (role !== "assistant") return text;
  const withoutBudgetCaveats = text.replace(
    /I (?:couldn['’]t|could not) re-query to confirm within my budget/gi,
    "I couldn’t confirm that from the returned evidence",
  );
  if (!INTERNAL_BUDGET_LANGUAGE.test(withoutBudgetCaveats)) return withoutBudgetCaveats;
  return withoutBudgetCaveats
    .split(/\n{2,}/)
    .filter((paragraph) => !INTERNAL_BUDGET_LANGUAGE.test(paragraph))
    .join("\n\n")
    .trim();
}
