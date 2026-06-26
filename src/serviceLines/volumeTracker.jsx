import { useState, useMemo } from "react";

const M = { fontFamily: "'DM Mono',monospace" };

const card = {
  background: "#ffffff",
  borderRadius: 10,
  padding: 14,
  border: "1px solid #d0dae8",
  boxShadow: "0 2px 10px rgba(13,26,42,0.06)",
};

const labelStyle = {
  fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5, ...M,
  marginBottom: 3,
};

const sectionHeading = {
  fontSize: 11, fontWeight: 700, color: "#0A3D47", ...M,
  textTransform: "uppercase", letterSpacing: 1, marginBottom: 12,
};

const thStyle = {
  padding: "6px 10px", textAlign: "left", color: "#64748b",
  fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 1,
};

function genVolumeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return "vol_" + crypto.randomUUID().slice(0, 8);
  }
  return "vol_" + Math.random().toString(36).slice(2, 10);
}

function formatMonth(yyyyMM) {
  const [y, m] = yyyyMM.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPriorMonth(yyyyMM) {
  const [y, mo] = yyyyMM.split("-").map(Number);
  return mo === 1
    ? `${y - 1}-12`
    : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_KEYS   = ["01","02","03","04","05","06","07","08","09","10","11","12"];

export function VolumeTrackerTab({ shared, serviceLines, onUpsert, onDelete }) {
  const volumeLog = shared.volumeLog ?? [];
  const activeSLs = (serviceLines ?? []).filter(sl => !sl.archived);

  const [formMonth,   setFormMonth]   = useState(currentMonthStr());
  const [formScopeId, setFormScopeId] = useState(null); // null = whole company
  const [formCount,   setFormCount]   = useState("");
  const [formNotes,   setFormNotes]   = useState("");
  const [editingId,   setEditingId]   = useState(null);
  const [annualScope, setAnnualScope] = useState(null); // null = whole company

  // Most-recent-first sorted log
  const sortedLog = useMemo(
    () => [...volumeLog].sort((a, b) => b.month.localeCompare(a.month)),
    [volumeLog]
  );

  // Fast lookup for MoM delta: "scopeKey:YYYY-MM" → clientCount
  const logMap = useMemo(() => {
    const m = new Map();
    for (const e of volumeLog) {
      m.set(`${e.serviceLineId ?? "co"}:${e.month}`, e.clientCount);
    }
    return m;
  }, [volumeLog]);

  function getMoMDelta(entry) {
    const prior = logMap.get(`${entry.serviceLineId ?? "co"}:${getPriorMonth(entry.month)}`);
    return prior === undefined ? null : entry.clientCount - prior;
  }

  function getScopeName(serviceLineId) {
    if (!serviceLineId) return "Whole Company";
    const sl = activeSLs.find(s => s.id === serviceLineId);
    return sl ? (sl.name || sl.type) : serviceLineId;
  }

  function handleSubmit() {
    const count = Number(formCount);
    if (!formMonth || formCount === "" || isNaN(count)) return;
    onUpsert({
      id: editingId ?? genVolumeId(),
      month: formMonth,
      serviceLineId: formScopeId,
      clientCount: count,
      notes: formNotes.trim(),
    });
    setFormCount("");
    setFormNotes("");
    setEditingId(null);
  }

  function handleEdit(entry) {
    setEditingId(entry.id);
    setFormMonth(entry.month);
    setFormScopeId(entry.serviceLineId);
    setFormCount(String(entry.clientCount));
    setFormNotes(entry.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setFormCount("");
    setFormNotes("");
  }

  // Annual summary pivot
  const annualRows = useMemo(() => {
    const relevant = volumeLog.filter(e =>
      annualScope === null ? e.serviceLineId === null : e.serviceLineId === annualScope
    );
    const byYear = new Map();
    for (const e of relevant) {
      const [y, mo] = e.month.split("-");
      if (!byYear.has(y)) byYear.set(y, {});
      byYear.get(y)[mo] = e.clientCount;
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, monthMap]) => {
        const counts  = MONTH_KEYS.map(mo => monthMap[mo] ?? null);
        const filled  = counts.filter(v => v !== null);
        const avg     = filled.length ? Math.round(filled.reduce((s, v) => s + v, 0) / filled.length) : null;
        const peak    = filled.length ? Math.max(...filled) : null;
        const peakIdx = peak !== null ? counts.indexOf(peak) : -1;
        return { year, counts, avg, peak, peakLabel: peakIdx >= 0 ? `${MONTH_LABELS[peakIdx]} (${peak})` : "—" };
      });
  }, [volumeLog, annualScope]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Entry form ── */}
      <div style={card}>
        <div style={sectionHeading}>{editingId ? "Edit Entry" : "Log Client Volume"}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>

          <div>
            <div style={labelStyle}>Month</div>
            <input type="month" value={formMonth} onChange={e => setFormMonth(e.target.value)}
              style={{ padding: "4px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 13, ...M, background: "#fff" }}/>
          </div>

          <div>
            <div style={labelStyle}>Service Line</div>
            <select value={formScopeId ?? ""} onChange={e => setFormScopeId(e.target.value || null)}
              style={{ padding: "4px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 13, background: "#fff", minWidth: 150 }}>
              <option value="">Whole Company</option>
              {activeSLs.map(sl => (
                <option key={sl.id} value={sl.id}>{sl.name || sl.type}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Clients</div>
            <input type="number" min={0} step={1} value={formCount}
              onChange={e => setFormCount(e.target.value)} placeholder="0"
              style={{ width: 72, padding: "4px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 13, ...M, textAlign: "right", background: "#fff" }}/>
          </div>

          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={labelStyle}>Notes (optional)</div>
            <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)}
              placeholder="e.g. Mid-month census"
              style={{ width: "100%", padding: "4px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 13, fontFamily: "'Sora',sans-serif", background: "#fff", boxSizing: "border-box" }}/>
          </div>

          <button onClick={handleSubmit}
            style={{ padding: "6px 18px", background: "#0E6B78", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, ...M, whiteSpace: "nowrap" }}>
            {editingId ? "Save" : "+ Add"}
          </button>
          {editingId && (
            <button onClick={cancelEdit}
              style={{ padding: "6px 12px", background: "transparent", border: "1px solid #c8d4e4", borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 12, ...M }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── Monthly log ── */}
      {sortedLog.length > 0 && (
        <div style={card}>
          <div style={sectionHeading}>Monthly Log</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, ...M }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #d0dae8" }}>
                  {["Month", "Service Line", "Clients", "MoM", "Notes", ""].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedLog.map((entry, i) => {
                  const delta      = getMoMDelta(entry);
                  const deltaColor = delta === null ? "#94a3b8" : delta > 0 ? "#22c55e" : delta < 0 ? "#f87171" : "#94a3b8";
                  const deltaStr   = delta === null ? "—" : delta > 0 ? `+${delta}` : String(delta);
                  return (
                    <tr key={entry.id} style={{ borderBottom: "1px solid #edf2f7", background: i % 2 === 0 ? "#fafcff" : "#fff" }}>
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: "#0A3D47" }}>{formatMonth(entry.month)}</td>
                      <td style={{ padding: "7px 10px", color: "#475569" }}>{getScopeName(entry.serviceLineId)}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#0A3D47" }}>{entry.clientCount}</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", color: deltaColor, fontWeight: 600 }}>{deltaStr}</td>
                      <td style={{ padding: "7px 10px", color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.notes || ""}
                      </td>
                      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                        <button onClick={() => handleEdit(entry)}
                          style={{ marginRight: 6, padding: "2px 8px", fontSize: 10, background: "transparent", border: "1px solid #c8d4e4", borderRadius: 4, cursor: "pointer", color: "#475569", ...M }}>
                          Edit
                        </button>
                        <button onClick={() => onDelete(entry.id)}
                          style={{ padding: "2px 8px", fontSize: 10, background: "transparent", border: "1px solid #fca5a5", borderRadius: 4, cursor: "pointer", color: "#ef4444", ...M }}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Annual summary ── */}
      {annualRows.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ ...sectionHeading, marginBottom: 0 }}>Annual Summary</div>
            <select value={annualScope ?? ""} onChange={e => setAnnualScope(e.target.value || null)}
              style={{ padding: "3px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 11, background: "#fff", ...M }}>
              <option value="">Whole Company</option>
              {activeSLs.map(sl => (
                <option key={sl.id} value={sl.id}>{sl.name || sl.type}</option>
              ))}
            </select>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11, ...M }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #d0dae8" }}>
                  <th style={{ ...thStyle, minWidth: 52 }}>Year</th>
                  {MONTH_LABELS.map(ml => (
                    <th key={ml} style={{ ...thStyle, textAlign: "center", minWidth: 36 }}>{ml}</th>
                  ))}
                  <th style={{ ...thStyle, textAlign: "right", minWidth: 44 }}>Avg</th>
                  <th style={{ ...thStyle, textAlign: "right", minWidth: 90 }}>Peak</th>
                </tr>
              </thead>
              <tbody>
                {annualRows.map((row, i) => (
                  <tr key={row.year} style={{ borderBottom: "1px solid #edf2f7", background: i % 2 === 0 ? "#fafcff" : "#fff" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: "#0A3D47" }}>{row.year}</td>
                    {row.counts.map((c, mi) => (
                      <td key={mi} style={{ padding: "6px 8px", textAlign: "center", color: c !== null ? "#0A3D47" : "#d0dae8", fontWeight: c !== null ? 600 : 400 }}>
                        {c !== null ? c : "·"}
                      </td>
                    ))}
                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#0E6B78", fontWeight: 700 }}>
                      {row.avg !== null ? row.avg : "—"}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#475569" }}>{row.peakLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {volumeLog.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: 40, color: "#64748b" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📈</div>
          <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 600, color: "#0A3D47" }}>No client volume data yet</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            Use the form above to log monthly census counts and track client growth over time.
          </div>
        </div>
      )}

    </div>
  );
}
