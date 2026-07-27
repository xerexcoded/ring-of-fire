import type { Metadata } from "next";
import { RingmakerExperience } from "@/components/ringmaker-experience";
import type { DefinitionRule } from "@/lib/types";

export const metadata: Metadata = {
  title: "Ringmaker — Restless Pacific",
  description:
    "Build a counterfactual Ring of Fire definition and inspect every volcano whose membership changes.",
};

type RingmakerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseInitialRule(
  searchParams: Record<string, string | string[] | undefined>,
): DefinitionRule {
  const tectonic = firstValue(searchParams.tectonic) === "all"
    ? "all"
    : "subduction";
  const distanceValue = Number(firstValue(searchParams.maxDistanceKm));
  const maxDistanceKm = Number.isFinite(distanceValue)
    && distanceValue >= 25
    && distanceValue <= 500
    ? distanceValue
    : null;
  const eruptedSinceValue = Number(firstValue(searchParams.eruptedSince));
  const eruptedSince = eruptedSinceValue === 1800 || eruptedSinceValue === 1960
    ? eruptedSinceValue
    : null;

  return { tectonic, maxDistanceKm, eruptedSince };
}

export default async function RingmakerPage({
  searchParams,
}: RingmakerPageProps) {
  return (
    <RingmakerExperience
      initialRule={parseInitialRule(await searchParams)}
    />
  );
}
