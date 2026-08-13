"use client";

import type { CaptureResult } from "posthog-js";
import posthog from "posthog-js";

export const telemetryEvents = [
  "ask_opened",
  "ask_started",
  "ask_completed",
  "ask_failed",
] as const;

export type TelemetryEvent = (typeof telemetryEvents)[number];

type AskCompletion = {
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
};

function redactedUrl(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

export function redactNavigationProperties(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  if (event.event !== "$pageview" && event.event !== "$pageleave") return event;
  event.properties.$current_url = redactedUrl(event.properties.$current_url);
  event.properties.$referrer = redactedUrl(event.properties.$referrer);
  return event;
}

export function captureTelemetry(event: TelemetryEvent) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  posthog.capture(event);
}

export function askCompletionEvent({ isAbort, isDisconnect, isError }: AskCompletion): TelemetryEvent {
  return isAbort || isDisconnect || isError ? "ask_failed" : "ask_completed";
}
