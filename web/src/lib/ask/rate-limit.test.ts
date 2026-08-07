import { beforeEach, describe, expect, it } from "vitest";
import type { AskServerConfig } from "@/lib/ask/config";
import { AskRateLimitError, claimAnonymousRequest, resetAskRateLimitsForTests } from "@/lib/ask/rate-limit";

const config = {
  enabled: true,
  available: true,
  unavailableReason: null,
  modelId: "deepseek/deepseek-v4-flash-0731",
  sessionSecret: "s".repeat(32),
  metabaseDatabaseName: "Restless Pacific Analytics",
  windowLimit: 2,
  dailyLimit: 5,
  windowMs: 600_000,
} satisfies AskServerConfig;

function nextRequest(setCookie: string) {
  return new Request("http://localhost/api/ask", { method: "POST", headers: { Cookie: setCookie.split(";", 1)[0], "X-Forwarded-For": "203.0.113.8" } });
}

describe("anonymous Ask rate limits", () => {
  beforeEach(resetAskRateLimitsForTests);

  it("issues a signed HttpOnly cookie and enforces one active request", () => {
    const request = new Request("http://localhost/api/ask", { method: "POST", headers: { "X-Forwarded-For": "203.0.113.8" } });
    const claim = claimAnonymousRequest(request, config, 100);
    expect(claim.setCookie).toContain("HttpOnly");
    expect(() => claimAnonymousRequest(nextRequest(claim.setCookie!), config, 101)).toThrowError(AskRateLimitError);
    claim.release();
    const second = claimAnonymousRequest(nextRequest(claim.setCookie!), config, 102);
    second.release();
  });

  it("limits a session inside the configured window", () => {
    const first = claimAnonymousRequest(new Request("http://localhost/api/ask", { method: "POST", headers: { "X-Forwarded-For": "203.0.113.8" } }), config, 100);
    const cookie = first.setCookie!;
    first.release();
    const second = claimAnonymousRequest(nextRequest(cookie), config, 101);
    second.release();
    expect(() => claimAnonymousRequest(nextRequest(cookie), config, 102)).toThrowError(/rate-limited/);
  });
});
