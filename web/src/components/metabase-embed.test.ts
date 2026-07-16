import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBED_RENEWAL_MS, scheduleEmbedRenewal } from "@/components/metabase-embed";

describe("Metabase embed renewal", () => {
  afterEach(() => vi.useRealTimers());

  it("remounts before a 60-minute guest JWT expires", () => {
    vi.useFakeTimers();
    const renew = vi.fn();
    scheduleEmbedRenewal(renew);

    vi.advanceTimersByTime(EMBED_RENEWAL_MS - 1);
    expect(renew).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(renew).toHaveBeenCalledOnce();
    expect(EMBED_RENEWAL_MS).toBe(55 * 60 * 1000);
  });
});
