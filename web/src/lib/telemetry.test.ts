import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import { askCompletionEvent, redactNavigationProperties, telemetryEvents } from "@/lib/telemetry";

describe("site telemetry", () => {
  it("has a deliberately small, metadata-only Ask event taxonomy", () => {
    expect(telemetryEvents).toEqual([
      "ask_opened",
      "ask_started",
      "ask_completed",
      "ask_failed",
    ]);
  });

  it.each([
    [{ isAbort: false, isDisconnect: false, isError: false }, "ask_completed"],
    [{ isAbort: true, isDisconnect: false, isError: false }, "ask_failed"],
    [{ isAbort: false, isDisconnect: true, isError: false }, "ask_failed"],
    [{ isAbort: false, isDisconnect: false, isError: true }, "ask_failed"],
  ] as const)("records %o as %s", (completion, event) => {
    expect(askCompletionEvent(completion)).toBe(event);
  });

  it("removes query strings and fragments from navigation events before delivery", () => {
    const event = {
      uuid: "00000000-0000-4000-8000-000000000001",
      event: "$pageview",
      properties: {
        $current_url: "https://restless.example/ask?question=private#answer",
        $referrer: "https://search.example/results?q=private#top",
      },
    } as CaptureResult;

    expect(redactNavigationProperties(event)?.properties).toMatchObject({
      $current_url: "https://restless.example/ask",
      $referrer: "https://search.example/results",
    });
  });

  it("leaves non-navigation events unchanged", () => {
    const event = {
      uuid: "00000000-0000-4000-8000-000000000002",
      event: "ask_started",
      properties: { source: "user-input" },
    } as CaptureResult;
    expect(redactNavigationProperties(event)).toBe(event);
  });
});
