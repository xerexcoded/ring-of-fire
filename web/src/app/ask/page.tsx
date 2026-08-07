import type { Metadata } from "next";
import { AskExperience } from "@/components/ask/ask-experience";
import { publicAskAvailability } from "@/lib/ask/config";

export const metadata: Metadata = {
  title: "Ask the Pacific | Restless Pacific",
  description: "A source-aware geology guide for volcanoes, tectonic plates, earthquakes, tsunamis, and the evidentiary definitions of the Ring of Fire.",
};

export const dynamic = "force-dynamic";

export default function AskPage() {
  const availability = publicAskAvailability();
  return (
    <main className="ask-page">
      <div className="ask-page-intro">
        <p className="eyebrow">Agentic geology guide</p>
        <h1>Ask the <em>Pacific.</em></h1>
        <p>Follow an answer from observation to explanation, with governed analytical queries, source receipts, and interactive evidence kept in view.</p>
      </div>
      <AskExperience available={availability.available} unavailableReason={availability.reason} />
    </main>
  );
}
