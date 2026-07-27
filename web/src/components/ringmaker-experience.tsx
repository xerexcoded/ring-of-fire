"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  RotateCcw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RingmakerMap } from "@/components/ringmaker-map";
import { atlasApi, buildDefinitionQuery } from "@/lib/api";
import {
  fallbackBoundaries,
  fallbackDefinitionComparison,
  volcanoBySlug,
} from "@/lib/data";
import type {
  DefinitionComparison,
  DefinitionComparisonResponse,
  DefinitionRule,
} from "@/lib/types";

type RingmakerExperienceProps = {
  initialRule: DefinitionRule;
};

type TableCategory = DefinitionComparison | "all" | "disagreements";

const defaultRule: DefinitionRule = {
  tectonic: "subduction",
  maxDistanceKm: null,
  eruptedSince: null,
};

const comparisonLabels: Record<DefinitionComparison, string> = {
  both: "Included by both",
  "smithsonian-only": "Smithsonian only",
  "rule-only": "Restless Pacific rule only",
  neither: "Excluded by both",
};

function ruleSummary(rule: DefinitionRule) {
  const parts = [
    rule.tectonic === "subduction"
      ? "subduction settings"
      : "any tectonic setting",
  ];
  if (rule.maxDistanceKm !== null) {
    parts.push(`within ${rule.maxDistanceKm} km of a convergent boundary`);
  }
  if (rule.eruptedSince !== null) {
    parts.push(`last known eruption since ${rule.eruptedSince}`);
  }
  return parts.join(" · ");
}

function displayEruption(value: number | null) {
  if (value === null) return "Not recorded";
  if (value < 0) return `${Math.abs(value)} BCE`;
  return String(value);
}

export function RingmakerExperience({
  initialRule,
}: RingmakerExperienceProps) {
  const reduceMotion = useReducedMotion();
  const [rule, setRule] = useState(initialRule);
  const [comparison, setComparison] = useState<DefinitionComparisonResponse>(
    fallbackDefinitionComparison(initialRule),
  );
  const [boundaries, setBoundaries] = useState(fallbackBoundaries);
  const [loading, setLoading] = useState(true);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [tableCategory, setTableCategory] =
    useState<TableCategory>("disagreements");
  const [tableQuery, setTableQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    atlasApi.boundaries({ limit: 1000 }, controller.signal)
      .then(setBoundaries)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setBoundaries(fallbackBoundaries);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      atlasApi.definitionComparison(rule, controller.signal)
        .then(setComparison)
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setComparison(fallbackDefinitionComparison(rule));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 160);

    const nextUrl = `${window.location.pathname}${buildDefinitionQuery(rule)}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [rule]);

  const selected = comparison.features.find(
    ({ properties }) => properties.volcanoNumber === selectedNumber,
  );
  const disagreements = useMemo(
    () => comparison.features
      .filter(({ properties }) => (
        properties.comparison === "smithsonian-only"
        || properties.comparison === "rule-only"
      ))
      .sort((first, second) => (
        first.properties.name.localeCompare(second.properties.name)
      )),
    [comparison.features],
  );
  const tableRows = useMemo(() => {
    const normalized = tableQuery.trim().toLocaleLowerCase();
    return comparison.features
      .filter(({ properties }) => {
        const categoryMatches = tableCategory === "all"
          || (tableCategory === "disagreements"
            ? properties.comparison === "smithsonian-only"
              || properties.comparison === "rule-only"
            : properties.comparison === tableCategory);
        const queryMatches = !normalized
          || [properties.name, properties.country ?? "", properties.region ?? ""]
            .some((value) => value.toLocaleLowerCase().includes(normalized));
        return categoryMatches && queryMatches;
      })
      .sort((first, second) => (
        first.properties.name.localeCompare(second.properties.name)
      ));
  }, [comparison.features, tableCategory, tableQuery]);

  const resetRule = () => setRule(defaultRule);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const downloadReceipt = () => {
    const receipt = {
      title: "Restless Pacific Ringmaker definition receipt",
      generatedAt: comparison.meta.generatedAt,
      baseline: comparison.meta.baseline,
      rule: comparison.meta.rule,
      ruleSummary: ruleSummary(rule),
      catalogCount: comparison.meta.count,
      baselineCount: comparison.meta.baselineCount,
      candidateCount: comparison.meta.candidateCount,
      comparisonCounts: comparison.meta.comparisonCounts,
      fingerprint: comparison.meta.fingerprint,
      notice: comparison.meta.notice,
      source: comparison.meta.source,
    };
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(receipt, null, 2)}\n`], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "restless-pacific-ringmaker-receipt.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="ringmaker-page">
      <section className="ringmaker-stage" aria-labelledby="ringmaker-title">
        <div className="ringmaker-map-stage">
          <RingmakerMap
            comparison={comparison}
            boundaries={boundaries}
            selectedVolcano={selectedNumber}
            onSelect={setSelectedNumber}
          />
        </div>
        <div className="ringmaker-stage-shade" />

        <motion.header
          className="ringmaker-hero-copy"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow">Ringmaker · Definition laboratory</p>
          <h1 id="ringmaker-title">Draw the ring.<br /><em>Watch it break.</em></h1>
          <p>
            The famous outline is a documented choice, not a natural border.
            Adjust the Restless Pacific rule and inspect every volcano that moves.
          </p>
          <a href="#ringmaker-reading">
            Read the disagreement <ArrowDown aria-hidden="true" />
          </a>
        </motion.header>

        <aside className="ringmaker-controls" aria-label="Adjust the Restless Pacific rule">
          <div className="ringmaker-control-head">
            <div>
              <span>Definition controls</span>
              <strong>Restless Pacific rule</strong>
            </div>
            <button type="button" onClick={resetRule}>
              <RotateCcw aria-hidden="true" /> Reset
            </button>
          </div>

          <fieldset>
            <legend>Tectonic setting</legend>
            <div className="ringmaker-segmented">
              <button
                type="button"
                aria-pressed={rule.tectonic === "subduction"}
                onClick={() => setRule((current) => ({
                  ...current,
                  tectonic: "subduction",
                }))}
              >
                Subduction only
              </button>
              <button
                type="button"
                aria-pressed={rule.tectonic === "all"}
                onClick={() => setRule((current) => ({
                  ...current,
                  tectonic: "all",
                }))}
              >
                Any setting
              </button>
            </div>
          </fieldset>

          <fieldset className="ringmaker-distance-rule">
            <legend>Boundary proximity</legend>
            <div className="ringmaker-checkbox-line">
              <label>
                <input
                  type="checkbox"
                  checked={rule.maxDistanceKm !== null}
                  onChange={(event) => setRule((current) => ({
                    ...current,
                    maxDistanceKm: event.target.checked ? 200 : null,
                  }))}
                />
                Apply
              </label>
            </div>
            <label>
              <span>
                Maximum distance
                <b>{rule.maxDistanceKm === null ? "Off" : `${rule.maxDistanceKm} km`}</b>
              </span>
              <input
                type="range"
                min="25"
                max="500"
                step="25"
                disabled={rule.maxDistanceKm === null}
                value={rule.maxDistanceKm ?? 200}
                onChange={(event) => setRule((current) => ({
                  ...current,
                  maxDistanceKm: Number(event.target.value),
                }))}
              />
            </label>
          </fieldset>

          <label className="ringmaker-select-rule">
            Last known eruption
            <select
              value={rule.eruptedSince ?? "all"}
              onChange={(event) => setRule((current) => ({
                ...current,
                eruptedSince: event.target.value === "all"
                  ? null
                  : Number(event.target.value) as 1800 | 1960,
              }))}
            >
              <option value="all">Any Holocene record</option>
              <option value="1800">Since 1800</option>
              <option value="1960">Since 1960</option>
            </select>
          </label>

          <p>
            Proximity is spatial context only. This rule is not a scientific
            boundary, causal claim, or hazard model.
          </p>
        </aside>

        <div className="ringmaker-counts" aria-live="polite" aria-busy={loading}>
          <div>
            <span>Smithsonian</span>
            <strong>{comparison.meta.baselineCount.toLocaleString()}</strong>
          </div>
          <i aria-hidden="true">↔</i>
          <div>
            <span>Restless Pacific rule</span>
            <strong>{comparison.meta.candidateCount.toLocaleString()}</strong>
          </div>
          <small>{loading ? "Recomputing…" : `${disagreements.length.toLocaleString()} disagreements`}</small>
        </div>

        <div className="ringmaker-legend" aria-label="Comparison map legend">
          {(Object.keys(comparisonLabels) as DefinitionComparison[]).map((key) => (
            <span key={key}>
              <i data-comparison={key} aria-hidden="true" />
              {comparisonLabels[key]}
            </span>
          ))}
        </div>

        {comparison.meta.isFallback && (
          <div className="ringmaker-fallback">
            Demonstration subset · live API unavailable
          </div>
        )}

        <AnimatePresence>
          {selected && (
            <motion.aside
              className="ringmaker-inspector"
              aria-label={`${selected.properties.name} comparison details`}
              initial={reduceMotion ? false : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
            >
              <button
                type="button"
                onClick={() => setSelectedNumber(null)}
                aria-label="Close volcano details"
              >
                <X aria-hidden="true" />
              </button>
              <span>{comparisonLabels[selected.properties.comparison]}</span>
              <h2>{selected.properties.name}</h2>
              <p>{selected.properties.country} · {selected.properties.region ?? "Region not assigned"}</p>
              <dl>
                <div>
                  <dt>Smithsonian PROF</dt>
                  <dd>{selected.properties.smithsonianIncluded ? "Included" : "Outside"}</dd>
                </div>
                <div>
                  <dt>Restless Pacific rule</dt>
                  <dd>{selected.properties.ruleIncluded ? "Included" : "Outside"}</dd>
                </div>
                <div>
                  <dt>Tectonic setting</dt>
                  <dd>{selected.properties.tectonicSetting ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Nearest convergent boundary</dt>
                  <dd>
                    {selected.properties.nearestConvergentBoundary
                      ? `${selected.properties.nearestConvergentBoundary.distanceKm} km`
                      : "Not resolved"}
                  </dd>
                </div>
                <div>
                  <dt>Last known eruption</dt>
                  <dd>{displayEruption(selected.properties.lastKnownEruption)}</dd>
                </div>
              </dl>
              <div className="ringmaker-inspector-links">
                {volcanoBySlug.has(selected.properties.slug) && (
                  <Link href={`/volcanoes/${selected.properties.slug}`}>
                    Open profile <ExternalLink aria-hidden="true" />
                  </Link>
                )}
                <a
                  href={`https://volcano.si.edu/volcano.cfm?vn=${selected.properties.volcanoNumber}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  GVP record <ExternalLink aria-hidden="true" />
                </a>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </section>

      <section
        id="ringmaker-reading"
        className="ringmaker-reading"
        aria-labelledby="ringmaker-reading-title"
      >
        <div className="ringmaker-reading-copy">
          <p className="eyebrow">What moved · {ruleSummary(rule)}</p>
          <h2 id="ringmaker-reading-title">Every rule<br />makes an edge.</h2>
          <p>
            Smithsonian’s reviewed set and the Restless Pacific rule agree on{" "}
            <strong>{comparison.meta.comparisonCounts.both.toLocaleString()}</strong>{" "}
            volcanoes. The useful evidence is at the boundary: what one
            definition includes and the other leaves outside.
          </p>
        </div>
        <div className="ringmaker-disagreement-list">
          {disagreements.slice(0, 8).map(({ properties }, index) => (
            <button
              key={properties.volcanoNumber}
              type="button"
              onClick={() => {
                setSelectedNumber(properties.volcanoNumber);
                document.querySelector(".ringmaker-stage")?.scrollIntoView({
                  behavior: reduceMotion ? "auto" : "smooth",
                });
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{properties.name}</strong>
              <small>{properties.country ?? "Country not recorded"}</small>
              <em>{comparisonLabels[properties.comparison]}</em>
            </button>
          ))}
          {disagreements.length === 0 && (
            <p>The two sets currently agree. Change a rule to expose the edge.</p>
          )}
        </div>
      </section>

      <section className="ringmaker-receipt" aria-labelledby="receipt-title">
        <div>
          <p className="eyebrow">Reproducible result</p>
          <h2 id="receipt-title">Definition receipt.</h2>
          <p>
            A count without its inputs is only atmosphere. This receipt keeps
            the source version, rule, result, and fingerprint together.
          </p>
        </div>
        <dl>
          <div><dt>Baseline</dt><dd>{comparison.meta.baseline.label} {comparison.meta.baseline.version}</dd></div>
          <div><dt>Restless Pacific rule</dt><dd>{ruleSummary(rule)}</dd></div>
          <div><dt>Catalog universe</dt><dd>{comparison.meta.count.toLocaleString()} Holocene volcanoes</dd></div>
          <div><dt>Result</dt><dd>{comparison.meta.candidateCount.toLocaleString()} included</dd></div>
          <div><dt>Fingerprint</dt><dd><code>{comparison.meta.fingerprint}</code></dd></div>
        </dl>
        <div className="ringmaker-receipt-actions">
          <button type="button" onClick={copyShareLink}>
            {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <button type="button" onClick={downloadReceipt}>
            <Download aria-hidden="true" /> Download JSON
          </button>
          <a
            href={comparison.meta.baseline.citationUrl}
            target="_blank"
            rel="noreferrer"
          >
            Smithsonian method <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="ringmaker-table-section" aria-labelledby="comparison-table-title">
        <div className="ringmaker-table-head">
          <div>
            <p className="eyebrow">Map-equivalent evidence</p>
            <h2 id="comparison-table-title">Inspect the membership.</h2>
          </div>
          <div className="ringmaker-table-filters">
            <label>
              Comparison
              <select
                value={tableCategory}
                onChange={(event) => setTableCategory(event.target.value as TableCategory)}
              >
                <option value="disagreements">Disagreements</option>
                <option value="all">All volcanoes</option>
                <option value="both">Included by both</option>
                <option value="smithsonian-only">Smithsonian only</option>
                <option value="rule-only">Restless Pacific rule only</option>
                <option value="neither">Excluded by both</option>
              </select>
            </label>
            <label>
              Search
              <input
                type="search"
                value={tableQuery}
                onChange={(event) => setTableQuery(event.target.value)}
                placeholder="Name, country, region…"
              />
            </label>
          </div>
        </div>
        <div className="ringmaker-table-scroll">
          <table>
            <caption>
              {tableRows.length.toLocaleString()} volcanoes matching the table filters.
            </caption>
            <thead>
              <tr>
                <th scope="col">Volcano</th>
                <th scope="col">Comparison</th>
                <th scope="col">Smithsonian</th>
                <th scope="col">Restless Pacific rule</th>
                <th scope="col">Last eruption</th>
                <th scope="col">Convergent boundary</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(({ properties }) => (
                <tr key={properties.volcanoNumber}>
                  <th scope="row">
                    <button
                      type="button"
                      onClick={() => setSelectedNumber(properties.volcanoNumber)}
                    >
                      {properties.name}
                    </button>
                    <small>{properties.country ?? "Country not recorded"}</small>
                  </th>
                  <td>{comparisonLabels[properties.comparison]}</td>
                  <td>{properties.smithsonianIncluded ? "Included" : "Outside"}</td>
                  <td>{properties.ruleIncluded ? "Included" : "Outside"}</td>
                  <td>{displayEruption(properties.lastKnownEruption)}</td>
                  <td>
                    {properties.nearestConvergentBoundary
                      ? `${properties.nearestConvergentBoundary.distanceKm} km`
                      : "Not resolved"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ringmaker-final-cta">
        <p className="eyebrow">Method before myth</p>
        <h2>Keep the rule<br />with the result.</h2>
        <Link href="/sourcebook">
          Read the Sourcebook <ExternalLink aria-hidden="true" />
        </Link>
      </section>
    </article>
  );
}
