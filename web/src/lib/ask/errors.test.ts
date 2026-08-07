import { describe, expect, it } from "vitest";
import { askErrorNotice, formatRetryAfter } from "@/lib/ask/errors";

describe("Ask chat error notices", () => {
  it("explains that a rate limit requires waiting rather than a new conversation", () => {
    const notice = askErrorNotice(new Error(JSON.stringify({
      error: { code: "rate-limited", message: "limited", retryAfterSeconds: 125 },
    })));
    expect(notice).toMatchObject({ code: "rate-limited", canRetry: false, canStartFresh: false });
    expect(notice?.message).toContain("Try again in 3 minutes");
    expect(notice?.message).toContain("will not reset this wait");
  });

  it("offers a fresh conversation only for an unclassified generation failure", () => {
    expect(askErrorNotice(new Error("stream failed"))).toMatchObject({
      code: "generation-failed",
      canRetry: true,
      canStartFresh: true,
    });
  });

  it("formats short and long retry windows", () => {
    expect(formatRetryAfter(12)).toBe("12 seconds");
    expect(formatRetryAfter(3_601)).toBe("2 hours");
  });
});
