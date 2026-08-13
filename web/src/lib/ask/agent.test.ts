import { describe, expect, it, vi } from "vitest";
import type { AskServerConfig } from "@/lib/ask/config";

const { createOpenRouterMock, chatMock } = vi.hoisted(() => ({
  createOpenRouterMock: vi.fn(),
  chatMock: vi.fn(() => ({})),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: createOpenRouterMock,
}));

import { createAskAgent } from "@/lib/ask/agent";

const config = {
  enabled: true,
  available: true,
  unavailableReason: null,
  modelId: "google/gemini-2.5-flash",
  fallbackModelId: "qwen/qwen3.5-122b-a10b",
  openRouterApiKey: "openrouter-key",
  sessionSecret: "s".repeat(32),
  metabaseInternalUrl: "http://metabase:3000",
  metabaseApiKey: "metabase-key",
  metabaseDatabaseName: "Restless Pacific Analytics",
  windowLimit: 10,
  dailyLimit: 50,
  windowMs: 600_000,
} satisfies AskServerConfig;

describe("Ask OpenRouter model routing", () => {
  it("sends the selected primary and fallback with tool-safe provider routing", () => {
    createOpenRouterMock.mockReturnValue({ chat: chatMock });

    createAskAgent({
      config,
      signal: new AbortController().signal,
      emitResult: vi.fn(),
      emitReceipt: vi.fn(),
    });

    expect(chatMock).toHaveBeenCalledWith("google/gemini-2.5-flash", {
      models: ["qwen/qwen3.5-122b-a10b"],
      provider: {
        allow_fallbacks: true,
        require_parameters: true,
        data_collection: "deny",
      },
      usage: { include: true },
    });
  });
});
