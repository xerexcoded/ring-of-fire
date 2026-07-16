import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileMap } from "@/components/profile-map";
import { volcanoBySlug, volcanoProfiles } from "@/lib/data";

type ProfilePageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return volcanoProfiles.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const volcano = volcanoBySlug.get(slug);
  if (!volcano) return { title: "Volcano not found" };
  return {
    title: volcano.name,
    description: volcano.dek,
  };
}

export default async function VolcanoProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;
  const volcano = volcanoBySlug.get(slug);
  if (!volcano) notFound();

  const index = volcanoProfiles.findIndex((item) => item.slug === slug);
  const previous = volcanoProfiles[(index - 1 + volcanoProfiles.length) % volcanoProfiles.length];
  const next = volcanoProfiles[(index + 1) % volcanoProfiles.length];

  return (
    <article className="volcano-profile">
      <header className="profile-hero">
        <div className="profile-map"><ProfileMap position={volcano.position} volcanoNumber={volcano.volcanoNumber} /></div>
        <div className="profile-hero-shade" />
        <Link className="profile-back" href="/atlas"><ArrowLeft /> Back to atlas</Link>
        <div className="profile-identity">
          <div className="display-title-group">
            <p className="eyebrow">Volcano {String(index + 1).padStart(2, "0")} / {volcanoProfiles.length}</p>
            <h1>{volcano.name}</h1>
          </div>
          {volcano.localName && <p className="local-name">{volcano.localName}</p>}
          <p className="profile-dek">{volcano.dek}</p>
        </div>
        <div className="profile-coordinates">
          <span>{Math.abs(volcano.position[1]).toFixed(3)}°{volcano.position[1] >= 0 ? "N" : "S"}</span>
          <span>{Math.abs(volcano.position[0]).toFixed(3)}°{volcano.position[0] >= 0 ? "E" : "W"}</span>
        </div>
      </header>

      <section className="profile-facts" aria-label={`${volcano.name} key facts`}>
        <dl>
          <div><dt>Form</dt><dd>{volcano.volcanoType}</dd></div>
          <div><dt>Elevation</dt><dd>{volcano.elevationM ? `${volcano.elevationM.toLocaleString()} m` : "Not recorded"}</dd></div>
          <div><dt>Last known eruption</dt><dd>{volcano.lastKnownEruption ?? "Unknown"}</dd></div>
          <div><dt>GVP number</dt><dd>{volcano.volcanoNumber}</dd></div>
        </dl>
      </section>

      <section className="profile-narrative">
        <div className="profile-section-label"><span>01</span> Read the landform</div>
        <div className="profile-body">
          <p className="profile-lead">{volcano.introduction}</p>
          <div className="profile-context">
            <div><h2>Tectonic setting</h2><p>{volcano.tectonicSetting}</p></div>
            <div><h2>Membership note</h2><p>{volcano.membershipNote}</p></div>
          </div>
        </div>
      </section>

      <section className="eruption-record">
        <div className="profile-section-label"><span>02</span> Selected eruption record</div>
        <div className="eruption-list">
          {volcano.notableEruptions.map((eruption) => (
            <div key={`${eruption.year}-${eruption.label}`}>
              <time>{eruption.year}</time>
              <div><h2>{eruption.label}</h2><p>{eruption.detail}</p></div>
              <span>{eruption.precision} precision</span>
            </div>
          ))}
          <p className="record-note">This is a curated profile excerpt, not the complete eruption catalog. Historical year, month, and day fields remain nullable in the analytical database.</p>
        </div>
      </section>

      <section className="profile-sources">
        <div className="profile-section-label"><span>03</span> Source record</div>
        <div>
          <p>Claim-level values in this profile resolve to the source below. Dataset membership and narrative interpretation are stored separately.</p>
          <ul>
            {volcano.sources.map((source) => (
              <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.label}<ExternalLink /></a></li>
            ))}
          </ul>
          <div className="profile-version">
            <span>Fixture version</span><strong>{volcano.source.version}</strong>
            <span>Confidence</span><strong>{volcano.confidence}</strong>
            <span>Fixture refreshed</span><strong>{volcano.source.refreshedAt ? new Date(volcano.source.refreshedAt).toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" }) : "Not reported"}</strong>
          </div>
        </div>
      </section>

      <nav className="profile-pagination" aria-label="Volcano profiles">
        <Link href={`/volcanoes/${previous.slug}`}><ArrowLeft /><span>Previous<br /><strong>{previous.name}</strong></span></Link>
        <Link href={`/volcanoes/${next.slug}`}><span>Next<br /><strong>{next.name}</strong></span><ArrowRight /></Link>
      </nav>
    </article>
  );
}
