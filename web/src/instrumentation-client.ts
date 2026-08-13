import posthog from "posthog-js";
import { redactNavigationProperties } from "@/lib/telemetry";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (token) {
  posthog.init(token, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-05-30",
    autocapture: false,
    disable_session_recording: true,
    capture_pageleave: false,
    capture_performance: false,
    capture_exceptions: false,
    capture_dead_clicks: false,
    before_send: redactNavigationProperties,
  });
}
