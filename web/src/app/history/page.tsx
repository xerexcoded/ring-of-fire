import type { Metadata } from "next";
import { ArrowDown, ExternalLink } from "lucide-react";
import { historyMoments } from "@/lib/data";

export const metadata: Metadata = {
  title: "Seven Moments",
  description: "Seven sourced moments that changed how the Pacific’s volcanoes, earthquakes, and tsunamis are understood.",
};

export default function HistoryPage() {
  return (
    <article className="history-page">
      <header className="history-hero">
        <div className="display-title-group">
          <p className="eyebrow">1815 — 2022 · Seven sourced moments</p>
          <h1>History, written in <em>ash</em> and water.</h1>
        </div>
        <div className="history-hero-note">
          <p>Measured facts are kept separate from our interpretation. Uncertainty remains visible instead of being rounded into certainty.</p>
          <a href="#history-moments">Move through time <ArrowDown /></a>
        </div>
        <div className="history-scale" aria-hidden="true">
          {historyMoments.map((moment) => <span key={moment.id}>{moment.year}</span>)}
        </div>
      </header>

      <section id="history-moments" className="history-moments" aria-label="Seven historical moments">
        {historyMoments.map((moment, index) => (
          <article key={moment.id} id={moment.id} className="history-moment">
            <div className="history-year"><span>{String(index + 1).padStart(2, "0")}</span>{moment.year}</div>
            <div className="history-event-head">
              <p>{moment.kind}</p>
              <h2>{moment.title}</h2>
              <span>{moment.place}</span>
            </div>
            <div className="history-evidence">
              <div className="evidence-row measured">
                <h3>Measured / recorded</h3>
                <p>{moment.measured}</p>
              </div>
              <div className="evidence-row interpretation">
                <h3>Narrative interpretation</h3>
                <p>{moment.interpretation}</p>
              </div>
              <div className="evidence-row uncertainty">
                <h3>Uncertainty preserved</h3>
                <p>{moment.uncertainty}</p>
              </div>
              <a href={moment.sourceUrl} target="_blank" rel="noreferrer">{moment.sourceLabel}<ExternalLink /></a>
            </div>
          </article>
        ))}
      </section>

      <section className="history-method">
        <p className="eyebrow">Reading rule</p>
        <blockquote>“A number without its method is atmosphere, not evidence.”</blockquote>
        <p>Historical databases combine observations created for different purposes, in different eras, with different levels of precision. Trend charts in the Data Lab therefore default to 1960 onward.</p>
      </section>
    </article>
  );
}
