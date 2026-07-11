import { canSeeCompanyDollars, canSeeMargin } from "../../lib/access.js";

const $k = (v) => `$${Math.round(v ?? 0).toLocaleString()}`;
const pct = (v) => `${((v ?? 0) * 100).toFixed(1)}%`;

// The payoff moment: a real P&L shape within a minute of finishing setup.
// Shows the just-added line's own revenue/labor (from FinancialTool's
// per-line breakdown) plus the whole company's net margin — this app
// allocates overhead company-wide, so a per-line margin isn't a real number;
// margin is shown at the company level rather than invented per line.
export default function FirstLineResult({ role, lineLabel, lineRevenue, lineLabor, netMargin, saveError, onContinue }) {
  const showDollars = canSeeCompanyDollars(role);
  const showMargin = canSeeMargin(role);

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">First result</div>
          <div className="login-divider" />
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0A3D47", textAlign: "center", margin: "0 0 8px" }}>
          {lineLabel} is live
        </h1>
        <p style={{ fontSize: 12.5, color: "#64748b", textAlign: "center", lineHeight: 1.6, margin: "0 0 18px" }}>
          Built from your shared wage and overhead inputs plus the Idaho fee schedule.
          Adjust caseload and pay any time — the P&amp;L recalculates immediately.
        </p>

        <div style={{ background: "#f0f5f8", border: "1px solid #d3dce7", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          <Row label="Annual revenue" value={showDollars ? $k(lineRevenue) : null} />
          <Row label="Annual direct labor" value={showDollars ? $k(lineLabor) : null} />
          {showMargin && (
            <Row label="Company net margin" value={pct(netMargin)} last />
          )}
        </div>

        {!showDollars && (
          <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", margin: "0 0 14px" }}>
            Dollar figures are visible to Owner, CEO, and Finance tiers only.
          </p>
        )}
        {saveError && (
          <div className="login-error" style={{ marginBottom: 14 }}>
            <span>⚠</span>
            <span>{saveError}</span>
          </div>
        )}

        <button className="login-btn" type="button" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 12.5,
      borderBottom: last ? "none" : "1px solid #d3dce7",
      fontWeight: last ? 700 : 400, color: last ? "#0A3D47" : "#5b6b7a",
    }}>
      <span>{label}</span>
      <span style={{ color: value === null ? "#94a3b8" : "#0A3D47", fontWeight: 600 }}>{value === null ? "Hidden" : value}</span>
    </div>
  );
}
