import { Link } from "react-router-dom";
import MarketingLayout, { openDemoModal } from "../marketing/MarketingLayout.jsx";
import { CAPABILITIES, ROLE_GROUPS } from "../marketing/content.js";
import {
  TYPE_LIST, getActiveTypes, getGroupedPickerOptions,
} from "../serviceLines/types.js";

export default function FeaturesPage({ isAuthenticated = false }) {
  const openDemo = () => openDemoModal("features");

  // Derive the catalog from the live registry so counts never go stale.
  const groups = getGroupedPickerOptions();
  const totalTypes = TYPE_LIST.length;
  const activeCount = getActiveTypes().length;
  const archetypeCount = groups.length;

  return (
    <MarketingLayout isAuthenticated={isAuthenticated} page="features">
      {/* Page header */}
      <section className="mk-hero mk-hero-sm">
        <div className="mk-hero-inner">
          <span className="mk-eyebrow">What's inside</span>
          <h1 className="mk-h1">Every HCBS operating model, one tool</h1>
          <p className="mk-lede">
            {totalTypes} service-line types across {archetypeCount} financial archetypes —
            {" "}{activeCount} with full calculators today, the rest catalog-ready with live rate data.
          </p>
        </div>
      </section>

      {/* Service-line coverage */}
      <section className="mk-section">
        <div className="mk-section-head">
          <span className="mk-kicker">Service-line coverage</span>
          <h2 className="mk-h2">Built around archetypes, not just codes</h2>
        </div>
        <div className="mk-grid mk-grid-2">
          {groups.map((g) => (
            <div className="mk-card" key={g.archetype}>
              <h3 className="mk-card-title">{g.label}</h3>
              <ul className="mk-sl-list">
                {g.types.map((t) => (
                  <li className="mk-sl-item" key={t.type}>
                    <span className="mk-sl-name">{t.shortLabel}</span>
                    <span className={"mk-badge " + (t.status === "active" ? "mk-badge-active" : "mk-badge-catalog")}>
                      {t.status === "active" ? "Live" : "Catalog"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section className="mk-section mk-section-alt">
        <div className="mk-section-head">
          <span className="mk-kicker">Capabilities</span>
          <h2 className="mk-h2">From staffing inputs to a live P&L</h2>
        </div>
        <div className="mk-grid mk-grid-3">
          {CAPABILITIES.map((c) => (
            <div className="mk-card" key={c.title}>
              <h3 className="mk-card-title">{c.title}</h3>
              <p className="mk-card-body">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="mk-section">
        <div className="mk-section-head">
          <span className="mk-kicker">Access</span>
          <h2 className="mk-h2">Built for every role on the org chart</h2>
        </div>
        <div className="mk-grid mk-grid-3">
          {ROLE_GROUPS.map((r) => (
            <div className="mk-card" key={r.tier}>
              <span className="mk-kicker mk-kicker-card">{r.roles}</span>
              <h3 className="mk-card-title">{r.tier}</h3>
              <p className="mk-card-body">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA band */}
      <section className="mk-cta-band">
        <h2 className="mk-h2 mk-cta-band-title">Ready to model your numbers?</h2>
        <p className="mk-cta-band-sub">Request a demo or sign in to start modeling.</p>
        <div className="mk-cta-row mk-cta-row-center">
          <a href={DEMO_MAILTO} className="mk-btn mk-btn-primary mk-btn-lg" onClick={trackDemo}>
            Request a Demo
          </a>
          <Link to={isAuthenticated ? "/app" : "/login"} className="mk-btn mk-btn-ghost mk-btn-lg">
            {isAuthenticated ? "Go to App" : "Sign In"}
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
