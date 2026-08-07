import { describe, expect, it } from "vitest";
import { presentGuideText } from "@/lib/ask/presentation";

describe("Ask response presentation", () => {
  it("removes internal budget narration while retaining the answer", () => {
    const text = "I’ve reached my data-tool budget for this answer.\n\n## Reviewed regions\n\nKuril has 66 reviewed volcanoes.";
    expect(presentGuideText(text, "assistant")).toBe("## Reviewed regions\n\nKuril has 66 reviewed volcanoes.");
  });

  it("never rewrites the reader's message", () => {
    const text = "Why does the data budget exist?";
    expect(presentGuideText(text, "user")).toBe(text);
  });

  it("rephrases a retained caveat without exposing the internal budget", () => {
    const text = "I couldn't re-query to confirm within my budget, so I'm flagging that rather than guessing.";
    expect(presentGuideText(text, "assistant")).toBe("I couldn’t confirm that from the returned evidence, so I'm flagging that rather than guessing.");
  });
});
