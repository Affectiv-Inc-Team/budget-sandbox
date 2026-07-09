import { useState } from "react";
import { getGroupedPickerOptions } from "../../serviceLines/types.js";
import { useFeatureFlag } from "../../lib/posthog.js";

// Bootstrapping the first-ever service line for a brand-new company — only
// ever shown once, to an Owner. Mirrors AddServiceLineButton's picker data
// (same getGroupedPickerOptions()/hide-catalog-service-lines flag) as a
// full-screen grid instead of a dropdown, since here it IS the whole screen.
export default function FirstServiceLinePicker({ onContinue }) {
  const [selected, setSelected] = useState(null);
  const groups = getGroupedPickerOptions();
  const hideCatalog = useFeatureFlag("hide-catalog-service-lines");

  return (
    <div className="login-root">
      <div className="login-card" style={{ maxWidth: 560 }}>
        <div className="login-brand">
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">First service line</div>
          <div className="login-divider" />
        </div>

        <h1 style={{ fontSize: 17, fontWeight: 700, color: "#0A3D47", textAlign: "center", margin: "0 0 8px" }}>
          Set up your first service line
        </h1>
        <p style={{ fontSize: 12.5, color: "#64748b", textAlign: "center", lineHeight: 1.6, margin: "0 0 18px" }}>
          Pick the model that matches how this line bills and staffs. You can add the rest
          later — nothing here is your last one.
        </p>

        {groups.map((group) => (
          <div key={group.archetype} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>
              {group.label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {group.types.map((t) => {
                if (hideCatalog && t.status === "catalog") return null;
                const ready = t.status === "active";
                const isSelected = selected === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    disabled={!ready}
                    onClick={() => setSelected(t.type)}
                    style={{
                      textAlign: "left", padding: "12px 11px", borderRadius: 8,
                      border: isSelected ? "1.5px solid #0E6B78" : "1.5px solid #d3dce7",
                      boxShadow: isSelected ? "0 0 0 3px rgba(14,107,120,0.14)" : "none",
                      background: ready ? "#fff" : "#f0f5f8",
                      cursor: ready ? "pointer" : "not-allowed",
                      opacity: ready ? 1 : 0.6,
                    }}
                  >
                    <div style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", color: "#8fa0ac", marginBottom: 3 }}>{t.type}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0A3D47", marginBottom: 6, lineHeight: 1.3 }}>{t.label}</div>
                    <span style={{
                      fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 0.5, padding: "2px 6px", borderRadius: 4,
                      background: ready ? "rgba(15,157,120,0.12)" : "#e2e8f0", color: ready ? "#0f9d78" : "#8fa0ac",
                    }}>
                      {ready ? "Ready" : "Catalog only"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <button
          className="login-btn"
          type="button"
          disabled={!selected}
          onClick={() => onContinue(selected)}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
