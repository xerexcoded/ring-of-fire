import { describe, expect, it } from "vitest";
import { getAskServerConfig } from "@/lib/ask/config";

const complete = {
  NODE_ENV: "test",
  AI_CHAT_ENABLED: "true",
  AI_MODEL: "deepseek/deepseek-v4-flash-0731",
  OPENROUTER_API_KEY: "openrouter-key",
  AI_SESSION_SECRET: "s".repeat(32),
  METABASE_INTERNAL_URL: "http://metabase:3000/",
  METABASE_AGENT_API_KEY: "metabase-key",
} satisfies NodeJS.ProcessEnv;

describe("getAskServerConfig", () => {
  it("fails closed when the feature is disabled or secrets are incomplete", () => {
    expect(getAskServerConfig({ ...complete, AI_CHAT_ENABLED: "false" }).available).toBe(false);
    const missing = getAskServerConfig({ ...complete, METABASE_AGENT_API_KEY: "" });
    expect(missing.available).toBe(false);
    expect(missing.unavailableReason).toBe("missing-configuration");
  });

  it("pins the expected model and normalizes limits and the internal URL", () => {
    const config = getAskServerConfig({ ...complete, AI_RATE_LIMIT_10_MINUTES: "12", AI_RATE_LIMIT_DAILY: "80" });
    expect(config.available).toBe(true);
    expect(config.modelId).toBe("deepseek/deepseek-v4-flash-0731");
    expect(config.metabaseInternalUrl).toBe("http://metabase:3000");
    expect(config.windowLimit).toBe(12);
    expect(config.dailyLimit).toBe(80);
  });
});
