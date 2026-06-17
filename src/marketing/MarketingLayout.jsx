import { Link, NavLink } from "react-router-dom";
import { LOGO } from "../assets/logo.js";
import posthog from "../lib/posthog.js";
import { DEMO_MAILTO, FOOTER_LINE } from "./content.js";

/**
 * Shared chrome (header nav + footer) for the public marketing pages.
 *
 * `isAuthenticated` swaps the secondary CTA between "Sign In" (→ /login) and
 * "Go to App" (→ /app), so a logged-in visitor browsing the marketing site
 * gets a direct route back into the tool.
 */
export default function MarketingLayout({ isAuthenticated = false, page = "home", children }) {
  const trackDemo = () => posthog.capture("demo_requested", { page });
  const trackSignIn = () => posthog.capture("landing_signin_clicked", { page, authed: isAuthenticated });

  return (
    <div className="mk-root">
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
          <a href={DEMO_MAILTO} className="mk-btn mk-btn-primary" onClick={trackDemo}>
            Request a Demo
          </a>
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
            <a href={DEMO_MAILTO} className="mk-footer-link" onClick={trackDemo}>Request a Demo</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
