import Link from "next/link";
import { EmberMark } from "@/components/ember-mark";

export function SiteFooter() {
  const repositoryUrl = process.env.NEXT_PUBLIC_REPOSITORY_URL ?? "https://github.com/";
  return (
    <footer className="site-footer">
      <div className="footer-statement">
        <EmberMark className="footer-mark" />
        <p>Read the evidence.<br />Keep the uncertainty.</p>
      </div>
      <div className="footer-links">
        <div>
          <span>Explore</span>
          <Link href="/atlas">Open atlas</Link>
          <Link href="/history">Seven moments</Link>
          <Link href="/data">Metabase Data Lab</Link>
        </div>
        <div>
          <span>Project</span>
          <Link href="/sourcebook">Sources &amp; methods</Link>
          <a href={repositoryUrl} rel="noreferrer">GitHub repository</a>
          <a href="https://volcano.si.edu/faq/Pacific_Ring_of_Fire.cfm" rel="noreferrer">GVP definition</a>
        </div>
      </div>
      <p className="footer-disclaimer">
        Educational project. Not for alerts, forecasting, evacuation, or emergency response.
        Follow local authorities for current hazard information.
      </p>
    </footer>
  );
}
