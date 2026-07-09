import { useState } from "react";
import { LOGO } from "../../assets/logo.js";

// Reused in two places: as a step inside the onboarding sequence (an Owner
// who hasn't been assigned a company yet) and standalone from ToolPage for a
// user who once had a company but no longer does (e.g. their invite was
// revoked) — in both cases the fix is the same and out of the user's hands.
export default function AwaitingCompany({ onCheckAgain, onSkip }) {
  const [checking, setChecking] = useState(false);

  async function handleCheckAgain() {
    setChecking(true);
    try {
      await onCheckAgain?.();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <a href="/" aria-label="Intrinsic home"><img src={LOGO} alt="Intrinsic" className="login-logo" style={{ cursor: "pointer" }} /></a>
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">Workspace status</div>
          <div className="login-divider" />
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0A3D47", textAlign: "center", margin: "0 0 8px" }}>
          Your workspace is being set up
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6, margin: "0 0 20px" }}>
          Intrinsic provisions every company by hand. You'll get access the moment your
          administrator assigns one to your account — no action needed from you.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 20 }}>
          <ChecklistRow state="done" label="Account activated" sub={null} />
          <ChecklistRow state="active" label="Awaiting company assignment" sub="Typically same business day" />
          <ChecklistRow state="pending" label="Access granted — you're in" sub="You'll land straight in the tool" />
        </div>

        <button className="login-btn" type="button" onClick={handleCheckAgain} disabled={checking}>
          {checking ? "Checking…" : "Check again"}
        </button>

        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 14 }}>
          <a href="mailto:support@intrinsic.agency" style={{ fontSize: 12, color: "#0E6B78", fontWeight: 600 }}>
            Contact administrator
          </a>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#94a3b8", cursor: "pointer" }}
            >
              Skip setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({ state, label, sub }) {
  const dot =
    state === "done" ? { background: "#0f9d78", border: "none", content: "✓" } :
    state === "active" ? { background: "rgba(212,165,32,0.18)", border: "2px solid #D4A520", content: "" } :
    { background: "#f0f5f8", border: "1px solid #d3dce7", content: "" };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px dashed #e2e8f0" }}>
      <div
        style={{
          flex: "none", width: 20, height: 20, borderRadius: "50%", marginTop: 1,
          display: "grid", placeItems: "center", fontSize: 11, color: "#fff",
          background: dot.background, border: dot.border,
        }}
      >
        {dot.content}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: state === "pending" ? "#94a3b8" : "#0A3D47" }}>
          {state === "active" && <span aria-hidden style={{ color: "#D4A520", marginRight: 4 }}>●</span>}
          {label}
        </div>
        {sub && <div style={{ fontSize: 11, color: "#94a3b8" }}>{sub}</div>}
      </div>
    </div>
  );
}
