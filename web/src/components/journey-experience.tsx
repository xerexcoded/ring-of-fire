"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PacificMap } from "@/components/pacific-map";
import { useAtlasData } from "@/hooks/use-atlas-data";
import { storyChapters, volcanoProfiles } from "@/lib/data";

export function JourneyExperience() {
  const atlas = useAtlasData({ limit: 1000 });
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const chapterNodes = useRef<Array<HTMLElement | null>>([]);
  const active = storyChapters[activeIndex];

  useEffect(() => {
    const observers = chapterNodes.current.map((node, index) => {
      if (!node) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveIndex(index);
        },
        { rootMargin: "-38% 0px -38% 0px", threshold: 0 },
      );
      observer.observe(node);
      return observer;
    });
    return () => observers.forEach((observer) => observer?.disconnect());
  }, []);

  const setChapterRef = useCallback((index: number, node: HTMLElement | null) => {
    chapterNodes.current[index] = node;
  }, []);

  const goToChapter = (index: number) => {
    setActiveIndex(index);
    chapterNodes.current[index]?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <>
      <section className="journey-hero" aria-labelledby="journey-title">
        <div className="journey-hero-map">
          <PacificMap
            volcanoes={atlas.volcanoes}
            earthquakes={atlas.earthquakes}
            boundaries={atlas.boundaries}
            tsunamis={atlas.tsunamis}
            center={[168, 8]}
            zoom={1.65}
            visibleLayers={{ volcanoes: true, earthquakes: false, boundaries: true, tsunamis: false }}
          />
          <svg className="route-trace" aria-hidden="true" viewBox="0 0 1000 620" preserveAspectRatio="none">
            <motion.path
              d="M620,545 C720,480 785,360 745,245 C705,128 620,75 492,62 C310,45 183,126 135,255 C96,361 176,499 330,551 C450,592 552,580 620,545"
              initial={{ pathLength: 0, opacity: 0.2 }}
              animate={{ pathLength: 1, opacity: 0.75 }}
              transition={{ duration: 3.5, ease: [0.22, 1, 0.36, 1], delay: 0.45 }}
            />
          </svg>
        </div>
        <div className="hero-shade" />
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.15 }}
        >
          <div className="display-title-group">
            <p className="eyebrow">Restless Pacific · Interactive atlas</p>
            <h1 id="journey-title">A ring that <em>isn’t</em> a ring.</h1>
          </div>
          <p>
            There is no scientific start or end—only a popular name for many distinct plate margins. We begin in New Zealand and travel clockwise as a storytelling convention.
          </p>
          <div className="hero-actions">
            <a href="#definition">Begin the journey <ArrowDown aria-hidden="true" /></a>
            <Link href="/atlas">Open the atlas <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </motion.div>
        <div className="hero-coordinate" aria-hidden="true">168°E · 08°N<br />Pacific basin</div>
        <div className="hero-source source-stamp">
          GVP 5.3.6 · 688 volcanoes · 41 PROF regions
        </div>
      </section>

      <section id="definition" className="definition-section" aria-labelledby="definition-title">
        <div className="definition-number" aria-hidden="true">688</div>
        <div className="definition-copy">
          <div className="section-title-group">
            <p className="eyebrow">The definition · GVP 5.3.6</p>
            <h2 id="definition-title">A useful outline.<br />A dangerous simplification.</h2>
          </div>
          <p>
            The Smithsonian Global Volcanism Program currently identifies 688 Holocene volcanoes across 41 regions in its Pacific Ring of Fire grouping. It also cautions that the phrase is popular—not one connected geologic structure.
          </p>
          <a className="text-link" href="https://volcano.si.edu/faq/Pacific_Ring_of_Fire.cfm" target="_blank" rel="noreferrer">
            Read the Smithsonian definition <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <dl className="definition-terms">
          <div><dt>Subduction</dt><dd>One tectonic plate descends beneath another, moving water-bearing rock into hotter, higher-pressure conditions.</dd></div>
          <div><dt>Transform boundary</dt><dd>Plates slide laterally past each other. Earthquakes are common; volcanic arcs generally are not.</dd></div>
          <div><dt>Trench</dt><dd>A deep seafloor depression that traces the surface expression of many subduction zones.</dd></div>
          <div><dt>Volcanic arc</dt><dd>A chain of volcanoes that forms landward of a subduction margin—not directly on the trench itself.</dd></div>
        </dl>
      </section>

      <section className="chapter-journey" aria-labelledby="chapter-title">
        <div className="chapter-sticky">
          <div className="chapter-map" aria-label={`Map focused on ${active.title}`}>
            <PacificMap
              volcanoes={atlas.volcanoes}
              earthquakes={atlas.earthquakes}
              boundaries={atlas.boundaries}
              tsunamis={atlas.tsunamis}
              center={active.center}
              zoom={active.zoom}
              visibleLayers={{ volcanoes: true, earthquakes: true, boundaries: true, tsunamis: false }}
            />
          </div>
          <div className="chapter-readout" aria-live="polite">
            <span>{String(activeIndex + 1).padStart(2, "0")} / 06</span>
            <strong>{active.range}</strong>
          </div>
          <div className="chapter-controls" aria-label="Choose a journey chapter">
            {storyChapters.map((chapter, index) => (
              <button
                key={chapter.id}
                type="button"
                aria-label={`Go to chapter ${index + 1}: ${chapter.title}`}
                aria-pressed={index === activeIndex}
                onClick={() => goToChapter(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="chapter-copy-column">
          <div className="chapter-column-intro">
            <div className="section-title-group">
              <p className="eyebrow">A clockwise convention</p>
              <h2 id="chapter-title">Six margins.<br />No single mechanism.</h2>
            </div>
          </div>
          {storyChapters.map((chapter, index) => (
            <article
              key={chapter.id}
              id={chapter.id}
              ref={(node) => setChapterRef(index, node)}
              className="chapter-article"
              data-active={index === activeIndex}
            >
              <p className="chapter-kicker">{chapter.kicker}</p>
              <h3>{chapter.title}</h3>
              <p>{chapter.body}</p>
              <dl>
                <div><dt>Boundary context</dt><dd>{chapter.boundary}</dd></div>
                <div><dt>Evidence note</dt><dd>{chapter.evidence}</dd></div>
              </dl>
              <div className="chapter-volcanoes">
                {chapter.volcanoSlugs.map((slug) => {
                  const volcano = volcanoProfiles.find((item) => item.slug === slug);
                  return volcano ? <Link key={slug} href={`/volcanoes/${slug}`}>{volcano.name} ↗</Link> : null;
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="indonesia-case" aria-labelledby="indonesia-title">
        <div className="section-title-group">
          <p className="eyebrow">Definition case study · Indonesia</p>
          <h2 id="indonesia-title">Inside the story.<br /><em>Outside this count.</em></h2>
        </div>
        <div>
          <p>
            Popular maps often sweep Indonesia into the Ring of Fire. Smithsonian’s current PROF definition largely does not. Indonesia belongs to the broader story of Pacific-adjacent tectonics, yet counting its volcanoes as part of the 688 would merge two different definitions.
          </p>
          <p className="case-note">This atlas preserves both concepts: versioned Smithsonian membership and a broader editorial route.</p>
          <Link className="text-link" href="/sourcebook">See the inclusion method →</Link>
        </div>
      </section>

      <section className="journey-cta">
        <div className="section-title-group section-title-group--center">
          <p className="eyebrow">Your turn</p>
          <h2>Leave the route.<br />Follow the evidence.</h2>
        </div>
        <Link href="/atlas">Explore the live atlas <ArrowUpRight aria-hidden="true" /></Link>
      </section>
    </>
  );
}
