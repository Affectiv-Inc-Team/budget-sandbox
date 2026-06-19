import { Link } from "react-router-dom";
import MarketingLayout from "../marketing/MarketingLayout.jsx";
import posthog from "../lib/posthog.js";
import {
  HERO, VALUE_PROPS, STEPS, TRUST, DEMO_MAILTO,
} from "../marketing/content.js";

export default function LandingPage({ isAuthenticated = false }) {
  const trackDemo = () => posthog.capture("demo_requested", { page: "home" });

  return (
    <MarketingLayout isAuthenticated={isAuthenticated} page="home">
      {/* Hero */}
      <section className="mk-hero">
        <div className="mk-hero-inner">
          <span className="mk-eyebrow">{HERO.eyebrow}</span>
          <h1 className="mk-h1">{HERO.headline}</h1>
          <p className="mk-lede">{HERO.subhead}</p>
          <div className="mk-cta-row">
            <a href={DEMO_MAILTO} className="mk-btn mk-btn-primary mk-btn-lg" onClick={trackDemo}>
              Request a Demo
            </a>
            <Link to={isAuthenticated ? "/app" : "/login"} className="mk-btn mk-btn-ghost mk-btn-lg">
              {isAuthenticated ? "Go to App" : "Sign In"}
            </Link>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mk-section">
        <div className="mk-section-head">
          <span className="mk-kicker">Why Intrinsic</span>
          <h2 className="mk-h2">Stop modeling profitability in spreadsheets</h2>
        </div>
        <div className="mk-grid mk-grid-2">
          {VALUE_PROPS.map((v) => (
            <div className="mk-card" key={v.title}>
              <h3 className="mk-card-title">{v.title}</h3>
              <p className="mk-card-body">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mk-section mk-section-alt">
        <div className="mk-section-head">
          <span className="mk-kicker">How it works</span>
          <h2 className="mk-h2">Three steps to a defensible number</h2>
        </div>
        <div className="mk-grid mk-grid-3">
          {STEPS.map((s) => (
            <div className="mk-step" key={s.n}>
              <span className="mk-step-n">{s.n}</span>
              <h3 className="mk-card-title">{s.title}</h3>
              <p className="mk-card-body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="mk-trust">
        {TRUST.map((t) => (
          <span className="mk-trust-item" key={t}>{t}</span>
        ))}
      </section>

      {/* Closing CTA band */}
      <section className="mk-cta-band">
        <h2 className="mk-h2 mk-cta-band-title">See your service lines modeled</h2>
        <p className="mk-cta-band-sub">
          A short walkthrough with your own staffing and caseload numbers.
        </p>
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
