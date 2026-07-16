import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-shell">
      <div className="display-title-group">
        <p className="eyebrow">404 · Beyond the mapped extent</p>
        <h1 className="page-title">This coordinate has no page.</h1>
      </div>
      <p className="page-dek">Return to the Pacific and continue the journey.</p>
      <Link className="text-link" href="/">Back to the journey →</Link>
    </section>
  );
}
