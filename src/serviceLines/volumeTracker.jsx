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

// Client volume is logged per service level. `clientCount` stays on every entry
// as the total so older entries (logged before the breakdown existed) and all
// downstream rollups keep working unchanged.
export const SERVICE_LEVELS = [
  { key: "intense", label: "Intense Support", color: "#D4A520" },
  { key: "high",    label: "High Support",    color: "#C9921A" },
  { key: "hourly",  label: "Hourly",          color: "#0E6B78" },
];

const EMPTY_LEVELS = { intense: "", high: "", hourly: "" };

// Reads an entry's breakdown; entries predating the feature report no levels.
export function entryLevels(entry) {
  const bl = entry?.byLevel;
  if (!bl) return null;
  const out = {};
  let any = false;
  for (const { key } of SERVICE_LEVELS) {
    const n = Number(bl[key]);
    out[key] = Number.isFinite(n) ? n : 0;
    if (out[key] !== 0) any = true;
  }
  return any || Object.keys(bl).length ? out : null;
}

export function sumLevels(levels) {
  return SERVICE_LEVELS.reduce((sum, { key }) => {
    const n = Number(levels?.[key]);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function monthOffset(yyyyMM, delta) {
  const [y, mo] = yyyyMM.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pct(curr, prior) {
  if (prior === null || prior === undefined || prior === 0) return null;
  return ((curr - prior) / prior) * 100;
}

function fmtPct(v) {
  if (v === null) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}

function fmtDelta(v) {
  if (v === null) return "—";
  return v > 0 ? `+${v}` : String(v);
}

function toneColor(v) {
  if (v === null || v === 0) return "#64748b";
  return v > 0 ? "#15803d" : "#dc2626";
}

/** Stat tile used by the growth panel. */
function Stat({ label, value, sub, color }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 140, background: "#f7fafd", border: "1px solid #e2e9f2", borderRadius: 8, padding: "10px 12px" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, ...M, color: color || "#0A3D47", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#94a3b8", ...M, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

/**
 * Growth trend panel: line chart of total census over the trailing window,
 * with a dashed prior-year line for the same months, plus headline stats.
 */
function GrowthTrendPanel({ volumeLog, activeSLs, scope, setScope, months, setMonths }) {
  const series = useMemo(() => {
    const relevant = volumeLog.filter(e =>
      scope === null ? e.serviceLineId === null : e.serviceLineId === scope
    );
    const byMonth = new Map();
    for (const e of relevant) byMonth.set(e.month, e);
    if (byMonth.size === 0) return null;

    const latestMonth = [...byMonth.keys()].sort().pop();
    const points = [];
    for (let i = months - 1; i >= 0; i--) {
      const m = monthOffset(latestMonth, -i);
      const e = byMonth.get(m);
      const prior = byMonth.get(monthOffset(m, -12));
      points.push({
        month: m,
        value: e ? e.clientCount : null,
        levels: e ? entryLevels(e) : null,
        priorYear: prior ? prior.clientCount : null,
      });
    }
    const filled = points.filter(p => p.value !== null);
    if (!filled.length) return null;

    const latest = filled[filled.length - 1];
    const priorMonthEntry = byMonth.get(monthOffset(latest.month, -1));
    const lastYearEntry   = byMonth.get(monthOffset(latest.month, -12));
    const trailing = filled.slice(-12).map(p => p.value);
    const avg12 = Math.round(trailing.reduce((s, v) => s + v, 0) / trailing.length);
    const peak = Math.max(...filled.map(p => p.value));
    const trough = Math.min(...filled.map(p => p.value));
    const first = filled[0];

    return {
      points,
      latest,
      momDelta: priorMonthEntry ? latest.value - priorMonthEntry.clientCount : null,
      momPct: priorMonthEntry ? pct(latest.value, priorMonthEntry.clientCount) : null,
      yoyDelta: lastYearEntry ? latest.value - lastYearEntry.clientCount : null,
      yoyPct: lastYearEntry ? pct(latest.value, lastYearEntry.clientCount) : null,
      lastYearValue: lastYearEntry ? lastYearEntry.clientCount : null,
      lastYearMonth: monthOffset(latest.month, -12),
      avg12,
      peak,
      trough,
      windowDelta: filled.length > 1 ? latest.value - first.value : null,
      windowPct: filled.length > 1 ? pct(latest.value, first.value) : null,
      firstMonth: first.month,
      hasPriorYear: points.some(p => p.priorYear !== null),
    };
  }, [volumeLog, scope, months]);

  const W = 720, H = 220, PAD_L = 38, PAD_R = 12, PAD_T = 14, PAD_B = 26;

  const chart = useMemo(() => {
    if (!series) return null;
    const vals = [];
    for (const p of series.points) {
      if (p.value !== null) vals.push(p.value);
      if (p.priorYear !== null) vals.push(p.priorYear);
    }
    const maxV = Math.max(...vals, 1);
    const top = Math.ceil(maxV * 1.15) || 1;
    const n = series.points.length;
    const x = i => PAD_L + (n === 1 ? (W - PAD_L - PAD_R) / 2 : (i * (W - PAD_L - PAD_R)) / (n - 1));
    const y = v => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B);

    const path = key => {
      let d = "", pen = false;
      series.points.forEach((p, i) => {
        const v = key === "value" ? p.value : p.priorYear;
        if (v === null) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
        pen = true;
      });
      return d.trim();
    };

    const areaPts = series.points
      .map((p, i) => (p.value === null ? null : `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`))
      .filter(Boolean);
    const firstIdx = series.points.findIndex(p => p.value !== null);
    const lastIdx  = series.points.map(p => p.value).lastIndexOf(series.latest.value);
    const area = areaPts.length
      ? `M${x(firstIdx).toFixed(1)},${(H - PAD_B).toFixed(1)} L${areaPts.join(" L")} L${x(lastIdx >= 0 ? lastIdx : series.points.length - 1).toFixed(1)},${(H - PAD_B).toFixed(1)} Z`
      : "";

    const ticks = [0, 0.5, 1].map(f => Math.round(top * f));
    return { x, y, top, path, area, ticks };
  }, [series]);

  const scopeSelect = (
    <select value={scope ?? ""} onChange={e => setScope(e.target.value || null)}
      style={{ padding: "3px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 11, background: "#fff", ...M }}>
      <option value="">Whole Company</option>
      {activeSLs.map(sl => <option key={sl.id} value={sl.id}>{sl.name || sl.type}</option>)}
    </select>
  );

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ ...sectionHeading, marginBottom: 0 }}>Client Growth Trend</div>
        {scopeSelect}
        <select value={months} onChange={e => setMonths(Number(e.target.value))}
          style={{ padding: "3px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 11, background: "#fff", ...M }}>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
          <option value={36}>Last 36 months</option>
          <option value={48}>Last 48 months</option>
          <option value={60}>Last 60 months</option>
        </select>
      </div>

      {!series ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: 11, ...M }}>
          No entries logged for this scope yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Stat
              label="Current census"
              value={series.latest.value}
              sub={formatMonth(series.latest.month)}
            />
            <Stat
              label="vs. last month"
              value={fmtDelta(series.momDelta)}
              sub={series.momPct === null ? "no prior month logged" : `${fmtPct(series.momPct)} month over month`}
              color={toneColor(series.momDelta)}
            />
            <Stat
              label="vs. same month last year"
              value={fmtDelta(series.yoyDelta)}
              sub={series.lastYearValue === null
                ? "no data for last year"
                : `${formatMonth(series.lastYearMonth)}: ${series.lastYearValue} clients · ${fmtPct(series.yoyPct)}`}
              color={toneColor(series.yoyDelta)}
            />
            <Stat
              label="Trailing 12-mo average"
              value={series.avg12}
              sub={`peak ${series.peak} · low ${series.trough}`}
            />
            <Stat
              label="Growth this window"
              value={fmtDelta(series.windowDelta)}
              sub={series.windowDelta === null
                ? "need 2+ months"
                : `since ${formatMonth(series.firstMonth)} · ${fmtPct(series.windowPct)}`}
              color={toneColor(series.windowDelta)}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
              aria-label="Client volume trend over time" style={{ display: "block", minWidth: 480 }}>
              <defs>
                <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0E6B78" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#0E6B78" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {chart.ticks.map((t, i) => {
                const yy = chart.y(t);
                return (
                  <g key={i}>
                    <line x1={PAD_L} x2={W - PAD_R} y1={yy} y2={yy} stroke="#e6edf6" strokeWidth="1" />
                    <text x={PAD_L - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="'DM Mono',monospace">{t}</text>
                  </g>
                );
              })}

              {series.points.map((p, i) => {
                const showLabel = series.points.length <= 12 || i % Math.ceil(series.points.length / 12) === 0;
                if (!showLabel) return null;
                const [yy, mm] = p.month.split("-");
                return (
                  <text key={p.month} x={chart.x(i)} y={H - 8} textAnchor="middle" fontSize="8.5" fill="#94a3b8" fontFamily="'DM Mono',monospace">
                    {MONTH_LABELS[+mm - 1]}{+mm === 1 || i === 0 ? ` ’${yy.slice(2)}` : ""}
                  </text>
                );
              })}

              {chart.area && <path d={chart.area} fill="url(#volFill)" />}
              {series.hasPriorYear && (
                <path d={chart.path("priorYear")} fill="none" stroke="#C9921A" strokeWidth="1.6" strokeDasharray="4 4" />
              )}
              <path d={chart.path("value")} fill="none" stroke="#0E6B78" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

              {series.points.map((p, i) =>
                p.value === null ? null : (
                  <circle key={p.month} cx={chart.x(i)} cy={chart.y(p.value)} r="3" fill="#fff" stroke="#0E6B78" strokeWidth="1.8">
                    <title>{`${formatMonth(p.month)} — ${p.value} clients${p.priorYear !== null ? ` (last year: ${p.priorYear})` : ""}`}</title>
                  </circle>
                )
              )}
            </svg>
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: "#64748b", ...M, flexWrap: "wrap" }}>
            <span><span style={{ display: "inline-block", width: 18, height: 2, background: "#0E6B78", verticalAlign: "middle", marginRight: 5 }} />Total clients</span>
            {series.hasPriorYear && (
              <span><span style={{ display: "inline-block", width: 18, borderTop: "2px dashed #C9921A", verticalAlign: "middle", marginRight: 5 }} />Same month, prior year</span>
            )}
            <span>Hover a point for exact counts.</span>
          </div>
        </>
      )}
    </div>
  );
}

export function VolumeTrackerTab({ shared, serviceLines, onUpsert, onDelete }) {

  const volumeLog = shared.volumeLog ?? [];
  const activeSLs = (serviceLines ?? []).filter(sl => !sl.archived);

  const [formMonth,   setFormMonth]   = useState(currentMonthStr());
  const [formScopeId, setFormScopeId] = useState(null); // null = whole company
  const [formLevels,  setFormLevels]  = useState(EMPTY_LEVELS);
  const [formNotes,   setFormNotes]   = useState("");
  const [editingId,   setEditingId]   = useState(null);
  const [annualScope, setAnnualScope] = useState(null); // null = whole company
  const [trendScope,  setTrendScope]  = useState(null); // null = whole company
  const [trendMonths, setTrendMonths] = useState(24);


  const formTotal = sumLevels(formLevels);
  const hasAnyLevel = SERVICE_LEVELS.some(({ key }) => String(formLevels[key]).trim() !== "");

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

  function setLevel(key, value) {
    setFormLevels(prev => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    if (!formMonth || !hasAnyLevel) return;
    const byLevel = {};
    for (const { key } of SERVICE_LEVELS) {
      const n = Number(formLevels[key]);
      byLevel[key] = Number.isFinite(n) && String(formLevels[key]).trim() !== "" ? n : 0;
    }
    onUpsert({
      id: editingId ?? genVolumeId(),
      month: formMonth,
      serviceLineId: formScopeId,
      byLevel,
      clientCount: sumLevels(byLevel),
      notes: formNotes.trim(),
    });
    setFormLevels(EMPTY_LEVELS);
    setFormNotes("");
    setEditingId(null);
  }

  function handleEdit(entry) {
    const levels = entryLevels(entry);
    setEditingId(entry.id);
    setFormMonth(entry.month);
    setFormScopeId(entry.serviceLineId);
    // Entries logged before the breakdown existed carry only a total — seed it
    // into the first level so the user can split it out while editing.
    setFormLevels(levels
      ? { intense: String(levels.intense), high: String(levels.high), hourly: String(levels.hourly) }
      : { ...EMPTY_LEVELS, intense: String(entry.clientCount ?? "") });
    setFormNotes(entry.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setFormLevels(EMPTY_LEVELS);
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

          {SERVICE_LEVELS.map(({ key, label, color }) => (
            <div key={key}>
              <div style={{ ...labelStyle, color }}>{label}</div>
              <input type="number" min={0} step={1} value={formLevels[key]}
                onChange={e => setLevel(key, e.target.value)} placeholder="0"
                aria-label={label}
                style={{ width: 82, padding: "4px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 13, ...M, textAlign: "right", background: "#fff" }}/>
            </div>
          ))}

          <div>
            <div style={labelStyle}>Total</div>
            <div style={{ width: 62, padding: "4px 8px", border: "1px solid #d0dae8", borderRadius: 5, fontSize: 13, ...M, textAlign: "right", background: "#f4f7fb", fontWeight: 700, color: "#0A3D47" }}>
              {formTotal}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={labelStyle}>Notes (optional)</div>
            <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)}
              placeholder="e.g. Mid-month census"
              style={{ width: "100%", padding: "4px 8px", border: "1px solid #c8d4e4", borderRadius: 5, fontSize: 13, fontFamily: "'Sora',sans-serif", background: "#fff", boxSizing: "border-box" }}/>
          </div>

          <button onClick={handleSubmit} disabled={!hasAnyLevel}
            style={{ padding: "6px 18px", background: "#0E6B78", border: "none", borderRadius: 6, color: "#fff", cursor: hasAnyLevel ? "pointer" : "not-allowed", opacity: hasAnyLevel ? 1 : 0.45, fontSize: 12, fontWeight: 700, ...M, whiteSpace: "nowrap" }}>
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

      {/* ── Growth trend chart ── */}
      {volumeLog.length > 0 && (
        <GrowthTrendPanel
          volumeLog={volumeLog}
          activeSLs={activeSLs}
          scope={trendScope}
          setScope={setTrendScope}
          months={trendMonths}
          setMonths={setTrendMonths}
        />
      )}

      {/* ── Monthly log ── */}

      {sortedLog.length > 0 && (
        <div style={card}>
          <div style={sectionHeading}>Monthly Log</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, ...M }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #d0dae8" }}>
                  {["Month", "Service Line", ...SERVICE_LEVELS.map(l => l.label), "Total", "MoM", "Notes", ""].map((h, hi) => (
                    <th key={`${h}-${hi}`} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedLog.map((entry, i) => {
                  const delta      = getMoMDelta(entry);
                  const deltaColor = delta === null ? "#94a3b8" : delta > 0 ? "#22c55e" : delta < 0 ? "#f87171" : "#94a3b8";
                  const deltaStr   = delta === null ? "—" : delta > 0 ? `+${delta}` : String(delta);
                  const levels     = entryLevels(entry);
                  return (
                    <tr key={entry.id} style={{ borderBottom: "1px solid #edf2f7", background: i % 2 === 0 ? "#fafcff" : "#fff" }}>
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: "#0A3D47" }}>{formatMonth(entry.month)}</td>
                      <td style={{ padding: "7px 10px", color: "#475569" }}>{getScopeName(entry.serviceLineId)}</td>
                      {SERVICE_LEVELS.map(({ key, color }) => (
                        <td key={key} style={{ padding: "7px 10px", textAlign: "right", color: levels ? color : "#cbd5e1", fontWeight: 600 }}>
                          {levels ? levels[key] : "—"}
                        </td>
                      ))}
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
