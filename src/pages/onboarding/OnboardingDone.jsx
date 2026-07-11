import { doneSummary } from "../../lib/onboarding.js";

// Closes the loop: recap + tier/provenance-aware "what's next". Copy comes
// from doneSummary() in the state machine so it stays in lockstep with the
// predicates that decided which steps this account actually saw.
export default function OnboardingDone({ role, provenance, onFinish }) {
  const { checklist, nextSteps } = doneSummary({ role, provenance });

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <div style={{
            width: 48, height: 48, borderRadius: "50%", margin: "0 auto 14px",
            background: "linear-gradient(155deg,#1A8A9A,#0A5260)", display: "grid", placeItems: "center",
            color: "#fff", fontSize: 22, boxShadow: "0 6px 20px rgba(14,107,120,0.35)",
          }}>
            ✓
          </div>
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">Complete</div>
          <div className="login-divider" />
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0A3D47", textAlign: "center", margin: "0 0 8px" }}>
          You're set up
        </h1>

        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px" }}>
          {checklist.map((item) => (
            <li key={item} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#0F4F5E", marginBottom: 8, lineHeight: 1.4 }}>
              <span style={{ flex: "none", width: 16, height: 16, borderRadius: "50%", background: "#0f9d78", color: "#fff", fontSize: 10, display: "grid", placeItems: "center", marginTop: 1 }}>✓</span>
              {item}
            </li>
          ))}
        </ul>

        <div style={{ borderTop: "1px solid #d3dce7", paddingTop: 14, marginBottom: 18 }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>
            What's next
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {nextSteps.map((step) => (
              <li key={step} style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, marginBottom: 4 }}>{step}</li>
            ))}
          </ul>
        </div>

        <button className="login-btn" type="button" onClick={onFinish}>
          Go to my dashboard
        </button>
      </div>
    </div>
  );
}
