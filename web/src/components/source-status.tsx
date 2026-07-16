"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { atlasApi } from "@/lib/api";
import { fallbackSourceStatus } from "@/lib/data";
import type { SourceStatusResponse } from "@/lib/types";

function displayDate(value: string | null) {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} · ${hours}:${minutes} UTC`;
}

export function SourceStatusTable() {
  const [status, setStatus] = useState<SourceStatusResponse>(fallbackSourceStatus);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    atlasApi.sourceStatus(controller.signal)
      .then((response) => {
        setStatus(response);
        setLive(response !== fallbackSourceStatus);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setLive(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="source-status-wrap">
      <div className="source-status-head">
        <div><span className={live ? "status-dot" : "status-pulse"} />{live ? "Live ingestion registry" : "Committed fallback registry"}</div>
        <time dateTime={status.generatedAt}>Generated {displayDate(status.generatedAt)}</time>
      </div>
      <div className="source-status-table" role="table" aria-label="Dataset freshness and licensing">
        <div className="source-status-row source-status-labels" role="row">
          <span role="columnheader">Dataset</span><span role="columnheader">Version</span><span role="columnheader">Last good run</span><span role="columnheader">Cadence</span><span role="columnheader">License</span>
        </div>
        {status.datasets.map((dataset) => (
          <div className="source-status-row" role="row" key={dataset.key}>
            <span role="cell"><strong>{dataset.name}</strong><small>{dataset.authority}</small></span>
            <span role="cell">{dataset.version || "Unversioned feed"}{dataset.publishedAt && <small>Published {displayDate(dataset.publishedAt)}</small>}</span>
            <span role="cell">{displayDate(dataset.lastSuccessfulRunAt)}{dataset.membershipReviewStatus && <small>Review: {dataset.membershipReviewStatus}</small>}</span>
            <span role="cell">{dataset.refreshCadence}</span>
            <span role="cell">
              {dataset.license.url ? <a href={dataset.license.url} target="_blank" rel="noreferrer">{dataset.license.name ?? "Terms"}<ExternalLink /></a> : dataset.license.name ?? "See source"}
              <a href={dataset.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink /></a>
            </span>
          </div>
        ))}
      </div>
      <p className="source-disclaimer">{status.disclaimer}</p>
    </div>
  );
}
