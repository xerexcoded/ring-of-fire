"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/paths";

export type EmbedStatus = "loading" | "ready" | "offline";

type MetabaseDashboardElement = HTMLElement;

declare global {
  interface Window {
    metabaseConfig?: {
      isGuest: boolean;
      instanceUrl: string;
      guestEmbedProviderUri: string;
      theme: {
        preset: "dark" | "light";
      };
    };
  }
}

let embedScriptPromise: Promise<void> | null = null;
export const EMBED_RENEWAL_MS = 55 * 60 * 1000;
export const METABASE_THEME_PRESET = "dark" as const;

export function scheduleEmbedRenewal(callback: () => void) {
  return setTimeout(callback, EMBED_RENEWAL_MS);
}

function loadEmbedScript(instanceUrl: string) {
  if (customElements.get("metabase-dashboard")) return Promise.resolve();
  if (embedScriptPromise) return embedScriptPromise;

  embedScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-restless-metabase]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => {
        existing.remove();
        embedScriptPromise = null;
        reject(new Error("Metabase embed script failed"));
      }, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `${instanceUrl.replace(/\/$/, "")}/app/embed.js`;
    script.defer = true;
    script.dataset.restlessMetabase = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      embedScriptPromise = null;
      reject(new Error("Metabase embed script failed"));
    };
    document.head.appendChild(script);
  });
  return embedScriptPromise;
}

type MetabaseEmbedProps = {
  resourceKey: string;
  onStatusChange?: (status: EmbedStatus) => void;
};

export function MetabaseEmbed({ resourceKey, onStatusChange }: MetabaseEmbedProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<EmbedStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { onStatusChange?.(status); }, [onStatusChange, status]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? withBasePath("/api/v1");
    const instanceUrl = (process.env.NEXT_PUBLIC_METABASE_URL ?? "http://analytics.localhost").replace(/\/$/, "");
    const guestEmbedProviderUri = `${apiBase.replace(/\/$/, "")}/metabase/guest-token`;
    const controller = new AbortController();
    let renewalTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    setStatus("loading");

    async function initialize() {
      try {
        const resourceResponse = await fetch(
          `${apiBase.replace(/\/$/, "")}/metabase/resources/${encodeURIComponent(resourceKey)}`,
          { signal: controller.signal, credentials: "include", headers: { Accept: "application/json" } },
        );
        if (!resourceResponse.ok) throw new Error(`Resource endpoint returned ${resourceResponse.status}`);
        const resource = await resourceResponse.json() as { entityType?: string; entityId?: number };
        if (resource.entityType !== "dashboard" || !Number.isInteger(resource.entityId) || Number(resource.entityId) <= 0) {
          throw new Error("Metabase dashboard resource is not provisioned");
        }

        const tokenResponse = await fetch(guestEmbedProviderUri, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ entityType: "dashboard", entityId: Number(resource.entityId) }),
        });
        if (!tokenResponse.ok) throw new Error(`Guest token endpoint returned ${tokenResponse.status}`);
        const tokenBody = await tokenResponse.json() as { jwt?: string };
        if (!tokenBody.jwt) throw new Error("Guest token endpoint returned no JWT");

        window.metabaseConfig = {
          isGuest: true,
          instanceUrl,
          guestEmbedProviderUri,
          theme: { preset: METABASE_THEME_PRESET },
        };
        await loadEmbedScript(instanceUrl);
        if (!active || !mount) return;

        const element = document.createElement("metabase-dashboard") as MetabaseDashboardElement;
        element.setAttribute("token", tokenBody.jwt);
        element.setAttribute("with-title", "true");
        element.setAttribute("auto-refresh-interval", "300");
        mount.replaceChildren(element);
        setStatus("ready");
        renewalTimer = scheduleEmbedRenewal(() => setAttempt((value) => value + 1));
      } catch {
        if (!controller.signal.aborted && active) setStatus("offline");
      }
    }

    void initialize();
    return () => {
      active = false;
      controller.abort();
      if (renewalTimer !== null) clearTimeout(renewalTimer);
      mount.replaceChildren();
    };
  }, [attempt, resourceKey]);

  return (
    <div className="metabase-embed-shell" data-resource-key={resourceKey} data-status={status}>
      <div ref={mountRef} className="metabase-mount" />
      {status === "loading" && <div className="embed-loading" role="status"><span />Connecting to the analytical store…</div>}
      {status === "offline" && (
        <div className="embed-offline" role="status">
          <AlertTriangle aria-hidden="true" />
          <div><strong>This workspace is temporarily unavailable</strong><p>The other analytical sections remain usable. Metabase may still be starting or provisioning this dashboard.</p></div>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}><RotateCcw /> Retry workspace</button>
        </div>
      )}
    </div>
  );
}

export function LazyMetabaseEmbed({ resourceKey }: { resourceKey: string }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [status, setStatus] = useState<EmbedStatus>("loading");

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sentinelRef} className="lazy-metabase-dashboard" data-loaded={shouldLoad} data-status={shouldLoad ? status : "deferred"}>
      {shouldLoad
        ? <MetabaseEmbed resourceKey={resourceKey} onStatusChange={setStatus} />
        : <div className="embed-deferred" role="status"><span />Workspace loads as you approach</div>}
    </div>
  );
}
