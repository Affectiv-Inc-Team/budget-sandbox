import { LOGO } from "../../assets/logo.js";
import { welcomeBullet, accessBlurb } from "../../lib/onboarding.js";
import { ROLE_LABELS } from "../../lib/access.js";

// Welcome and Access Granted — the two pre-dashboard steps every account
// sees (Owner or invited teammate alike). Awaiting Company is its own
// component (AwaitingCompany.jsx): it's Owner-only, and also reused
// standalone outside the onboarding sequence.
export default function OnboardingIntro({ step, role, provenance, invitedByEmail, onContinue, onSkip }) {
  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <a href="/" aria-label="Intrinsic home"><img src={LOGO} alt="Intrinsic" className="login-logo" style={{ cursor: "pointer" }} /></a>
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">{step === "welcome" ? "Welcome" : "Assignment confirmed"}</div>
          <div className="login-divider" />
        </div>

        {step === "welcome" ? <WelcomeBody role={role} /> : <AccessGrantedBody role={role} provenance={provenance} invitedByEmail={invitedByEmail} />}

        <button className="login-btn" type="button" onClick={onContinue}>
          {step === "welcome" ? "Continue" : "Enter workspace →"}
        </button>

        {onSkip && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              type="button"
              onClick={onSkip}
              style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#94a3b8", cursor: "pointer" }}
            >
              Skip setup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeBody({ role }) {
  const bullet = welcomeBullet(role);
  return (
    <>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0A3D47", textAlign: "center", margin: "0 0 4px" }}>
        Welcome to Intrinsic
      </h1>
      <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", margin: "0 0 20px" }}>
        Financial Model Builder for Idaho HCBS &amp; IDD providers.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "0 0 24px" }}>
        <ValueItem icon="📊" title={bullet.title} body={bullet.body} />
        <ValueItem icon="🗂️" title="Idaho rates, already loaded"
          body="Post-9/1/2025 fee schedules and Magellan IBHP behavioral health rates are built in." />
        <ValueItem icon="🔒" title="Scoped to what Intrinsic assigns"
          body="Companies aren't self-serve — you'll only see the ones Intrinsic grants your account access to." />
      </div>
    </>
  );
}

function AccessGrantedBody({ role, provenance, invitedByEmail }) {
  const label = ROLE_LABELS[role] ?? role;
  const blurb = accessBlurb(role, provenance);
  return (
    <>
      <div style={{
        width: 48, height: 48, borderRadius: "50%", margin: "0 auto 14px",
        background: "linear-gradient(155deg,#E8C44A,#D4A520)", display: "grid", placeItems: "center",
        color: "#fff", fontSize: 22, boxShadow: "0 6px 20px rgba(212,165,32,0.35)",
      }}>
        ✓
      </div>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0A3D47", textAlign: "center", margin: "0 0 10px" }}>
        You're in
      </h1>
      {invitedByEmail && provenance === "invited" && (
        <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", margin: "0 0 4px" }}>
          Invited by {invitedByEmail}
        </p>
      )}
      <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6, margin: "0 0 18px" }}>
        {blurb}
      </p>
      <div style={{ textAlign: "center", margin: "0 0 22px" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700,
          letterSpacing: 1, textTransform: "uppercase", padding: "4px 10px", borderRadius: 20,
          background: "rgba(14,107,120,0.10)", color: "#0A5260", border: "1px solid rgba(14,107,120,0.25)",
        }}>
          Role · {label}
        </span>
      </div>
    </>
  );
}

function ValueItem({ icon, title, body }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{
        flex: "none", width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
        fontSize: 14, background: "#FAF4E8", border: "1px solid #ddd0aa",
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0A3D47", marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}
