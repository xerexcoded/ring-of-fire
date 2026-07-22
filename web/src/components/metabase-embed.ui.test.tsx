import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DataLab } from "@/components/data-lab";
import { LazyMetabaseEmbed, MetabaseEmbed } from "@/components/metabase-embed";

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observer: IntersectionObserver;
};

const observers: ObserverRecord[] = [];

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.rootMargin = options?.rootMargin ?? "0px";
    this.thresholds = Array.isArray(options?.threshold) ? options.threshold : [Number(options?.threshold ?? 0)];
    observers.push({ callback, options, observer: this });
  }
}

function jsonResponse(ok: boolean, body: unknown, status = ok ? 200 : 503) {
  return { ok, status, json: async () => body } as Response;
}

beforeAll(() => {
  if (!customElements.get("metabase-dashboard")) {
    customElements.define("metabase-dashboard", class extends HTMLElement {});
  }
});

afterEach(() => {
  cleanup();
  observers.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Metabase workspace embeds", () => {
  it("defers resource and token requests until the section approaches", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(true, { entityType: "dashboard", entityId: 12 }))
      .mockResolvedValueOnce(jsonResponse(true, { jwt: "signed-token" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(<LazyMetabaseEmbed resourceKey="ring-of-fire-data-lab" />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Workspace loads as you approach")).toBeVisible();

    const lazyObserver = observers.find(({ options }) => options?.rootMargin === "600px 0px");
    expect(lazyObserver).toBeDefined();
    act(() => lazyObserver?.callback([
      { isIntersecting: true } as IntersectionObserverEntry,
    ], lazyObserver.observer));

    await waitFor(() => expect(document.querySelector("metabase-dashboard")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/metabase/resources/ring-of-fire-data-lab");
  });

  it("resolves the stable resource key again when retrying", async () => {
    let resourceAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/metabase/resources/")) {
        resourceAttempts += 1;
        return resourceAttempts === 1
          ? jsonResponse(false, {})
          : jsonResponse(true, { entityType: "dashboard", entityId: 24 });
      }
      return jsonResponse(true, { jwt: "retry-token" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MetabaseEmbed resourceKey="volcano-eruption-data-lab" />);
    await screen.findByText("This workspace is temporarily unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry workspace" }));

    await waitFor(() => expect(document.querySelector("metabase-dashboard")).toBeInTheDocument());
    expect(resourceAttempts).toBe(2);
  });

  it("keeps an unavailable workspace isolated from a ready workspace", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/metabase/resources/offline-workspace")) return jsonResponse(false, {});
      if (url.includes("/metabase/resources/")) return jsonResponse(true, { entityType: "dashboard", entityId: 33 });
      return jsonResponse(true, { jwt: "ready-token" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<>
      <MetabaseEmbed resourceKey="offline-workspace" />
      <MetabaseEmbed resourceKey="ready-workspace" />
    </>);

    await screen.findByText("This workspace is temporarily unavailable");
    await waitFor(() => expect(document.querySelectorAll("metabase-dashboard")).toHaveLength(1));
  });

  it("marks the section with the strongest viewport intersection as current", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("fetch", vi.fn());
    render(<DataLab />);

    const sectionObserver = observers.find(({ options }) => options?.rootMargin === "-20% 0px -58%");
    const seismicity = document.getElementById("seismicity");
    expect(sectionObserver).toBeDefined();
    expect(seismicity).not.toBeNull();
    act(() => sectionObserver?.callback([
      { isIntersecting: true, intersectionRatio: 0.6, target: seismicity } as unknown as IntersectionObserverEntry,
    ], sectionObserver.observer));

    expect(screen.getByText("Seismicity").closest("a")).toHaveAttribute("aria-current", "location");
    expect(screen.getByText("Overview").closest("a")).not.toHaveAttribute("aria-current");
  });
});
