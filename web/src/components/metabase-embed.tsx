"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ParameterValue = string | string[] | null;
type Parameters = Record<string, ParameterValue>;
type EmbedStatus = "loading" | "ready" | "offline";

type MetabaseDashboardElement = HTMLElement & {
  parameters?: Parameters;
};

declare global {
  interface Window {
    metabaseConfig?: {
      isGuest: boolean;
      instanceUrl: string;
      guestEmbedProviderUri: string;
    };
  }
}

let embedScriptPromise: Promise<void> | null = null;
export const EMBED_RENEWAL_MS = 55 * 60 * 1000;

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
  dashboardId: number;
  parameters: Parameters;
  onParametersChange?: (parameters: Parameters) => void;
  onStatusChange?: (status: EmbedStatus) => void;
};

export function MetabaseEmbed({ dashboardId, parameters, onParametersChange, onStatusChange }: MetabaseEmbedProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<MetabaseDashboardElement | null>(null);
  const onChangeRef = useRef(onParametersChange);
  const [status, setStatus] = useState<EmbedStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { onChangeRef.current = onParametersChange; }, [onParametersChange]);
  useEffect(() => { onStatusChange?.(status); }, [onStatusChange, status]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
    const instanceUrl = (process.env.NEXT_PUBLIC_METABASE_URL ?? "http://analytics.localhost").replace(/\/$/, "");
    const guestEmbedProviderUri = `${apiBase.replace(/\/$/, "")}/metabase/guest-token`;
    const controller = new AbortController();
    let renewalTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    setStatus("loading");

    async function initialize() {
      try {
        if (!Number.isInteger(dashboardId) || dashboardId <= 0) {
          throw new Error("Metabase dashboard resource is not provisioned");
        }
        const tokenResponse = await fetch(guestEmbedProviderUri, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ entityType: "dashboard", entityId: dashboardId }),
        });
        if (!tokenResponse.ok) throw new Error(`Guest token endpoint returned ${tokenResponse.status}`);
        const tokenBody = await tokenResponse.json() as { jwt?: string };
        if (!tokenBody.jwt) throw new Error("Guest token endpoint returned no JWT");
        window.metabaseConfig = { isGuest: true, instanceUrl, guestEmbedProviderUri };
        await loadEmbedScript(instanceUrl);
        if (!active || !mount) return;

        const element = document.createElement("metabase-dashboard") as MetabaseDashboardElement;
        element.setAttribute("token", tokenBody.jwt);
        element.setAttribute("with-title", "true");
        element.setAttribute("auto-refresh-interval", "300");
        element.parameters = parameters;
        const handleParametersChange = (event: Event) => {
          const detail = (event as CustomEvent<{ parameters?: Parameters }>).detail;
          if (detail?.parameters) onChangeRef.current?.(detail.parameters);
        };
        element.addEventListener("parameters-change", handleParametersChange);
        mount.replaceChildren(element);
        elementRef.current = element;
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
      elementRef.current = null;
      mount.replaceChildren();
    };
    // `attempt` intentionally remounts the provider after an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, dashboardId]);

  useEffect(() => {
    if (elementRef.current) elementRef.current.parameters = parameters;
  }, [parameters]);

  return (
    <div className="metabase-embed-shell" data-status={status}>
      <div ref={mountRef} className="metabase-mount" />
      {status === "loading" && <div className="embed-loading" role="status"><span />Connecting to the analytical store…</div>}
      {status === "offline" && (
        <div className="embed-offline" role="status">
          <AlertTriangle aria-hidden="true" />
          <div><strong>Data Lab is temporarily unavailable</strong><p>The atlas and sourcebook remain usable. The analytics service may still be starting.</p></div>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}><RotateCcw /> Retry embed</button>
        </div>
      )}
    </div>
  );
}
