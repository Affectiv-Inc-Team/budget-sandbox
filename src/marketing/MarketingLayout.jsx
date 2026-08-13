import { useState, useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { LOGO } from "../assets/logo.js";
import posthog from "../lib/posthog.js";
import { FOOTER_LINE } from "./content.js";
import DemoRequestModal from "./DemoRequestModal.jsx";

/**
 * Shared chrome (header nav + footer) for the public marketing pages.
 *
 * `isAuthenticated` swaps the secondary CTA between "Sign In" (→ /login) and
 * "Go to App" (→ /app), so a logged-in visitor browsing the marketing site
 * gets a direct route back into the tool.
 *
 * Hosts the DemoRequestModal. Any child can open it by dispatching
 * `window.dispatchEvent(new CustomEvent('open-demo-modal', { detail: { page } }))`
 * or by importing `openDemoModal()` from this file.
 */
export function openDemoModal(page) {
  window.dispatchEvent(new CustomEvent("open-demo-modal", { detail: { page } }));
}

export default function MarketingLayout({ isAuthenticated = false, page = "home", children }) {
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoPage, setDemoPage] = useState(page);

  useEffect(() => {
    const onOpen = e => {
      setDemoPage(e?.detail?.page ?? page);
      setDemoOpen(true);
      posthog.capture("demo_requested", { page: e?.detail?.page ?? page });
    };
    window.addEventListener("open-demo-modal", onOpen);
    return () => window.removeEventListener("open-demo-modal", onOpen);
  }, [page]);

  const openHere = () => openDemoModal(page);
  const trackSignIn = () => posthog.capture("landing_signin_clicked", { page, authed: isAuthenticated });

  return (
    <div className="mk-root">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="mk-header">
        <Link to="/" className="mk-brand" aria-label="Intrinsic home">

          <img src={LOGO} alt="" className="mk-logo" />
          <span className="mk-wordmark">Intrinsic</span>
        </Link>

        <nav className="mk-nav">
          <NavLink to="/" end className={({ isActive }) => "mk-navlink" + (isActive ? " is-active" : "")}>
            Home
          </NavLink>
          <NavLink to="/features" className={({ isActive }) => "mk-navlink" + (isActive ? " is-active" : "")}>
            Features
          </NavLink>
          <Link
            to={isAuthenticated ? "/app" : "/login"}
            className="mk-navlink mk-navlink-cta"
            onClick={trackSignIn}
          >
            {isAuthenticated ? "Go to App" : "Sign In"}
          </Link>
          <button type="button" className="mk-btn mk-btn-primary" onClick={openHere}>
            Request a Demo
          </button>
        </nav>
      </header>

      <main className="mk-main">{children}</main>

      <footer className="mk-footer">
        <div className="mk-footer-inner">
          <span className="mk-wordmark mk-wordmark-sm">Intrinsic</span>
          <span className="mk-footer-line">{FOOTER_LINE}</span>
          <div className="mk-footer-links">
            <Link to="/features" className="mk-footer-link">Features</Link>
            <Link to={isAuthenticated ? "/app" : "/login"} className="mk-footer-link" onClick={trackSignIn}>
              {isAuthenticated ? "Go to App" : "Sign In"}
            </Link>
            <button type="button" className="mk-footer-link mk-footer-link-btn" onClick={openHere}>
              Request a Demo
            </button>
          </div>
        </div>
      </footer>

      <DemoRequestModal open={demoOpen} onClose={() => setDemoOpen(false)} page={demoPage} />
    </div>
  );
}
