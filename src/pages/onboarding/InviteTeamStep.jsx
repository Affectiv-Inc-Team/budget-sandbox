// Light step pointing at the real Team & Invitations screen — only ever
// shown to a tier that can actually invite someone (invite_team's predicate
// in lib/onboarding.js already filters this out for House Lead).
export default function InviteTeamStep({ onGoToTeam, onContinue }) {
  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">Team access</div>
          <div className="login-divider" />
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0A3D47", textAlign: "center", margin: "0 0 8px" }}>
          Invite your team
        </h1>
        <p style={{ fontSize: 12.5, color: "#64748b", textAlign: "center", lineHeight: 1.6, margin: "0 0 20px" }}>
          Add teammates whenever you're ready — their tier decides what they see, not just
          what they can click.
        </p>

        <button className="login-btn" type="button" onClick={onGoToTeam}>
          Invite your team →
        </button>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button
            type="button"
            onClick={onContinue}
            style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#94a3b8", cursor: "pointer" }}
          >
            I'll do this later
          </button>
        </div>
      </div>
    </div>
  );
}
