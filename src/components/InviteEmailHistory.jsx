import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchInviteEmailHistory } from "../supabase.js";

const card  = { background: "#111a2e", border: "1px solid #1f2a44", borderRadius: 10, padding: 20, marginBottom: 20 };
const h2    = { fontSize: 15, fontWeight: 700, margin: "0 0 12px", letterSpacing: 0.5, textTransform: "uppercase", color: "#94a3b8", display: "flex", alignItems: "center", gap: 8 };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th    = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #1f2a44", color: "#94a3b8", fontWeight: 600 };
const td    = { padding: "8px 10px", borderBottom: "1px solid #1f2a44", verticalAlign: "middle" };
const input = { background: "#0b1220", border: "1px solid #334155", color: "#f1f5f9", padding: "6px 10px", borderRadius: 6, fontSize: 13 };
const btnGhost = { background: "transparent", border: "1px solid #334155", color: "#e2e8f0", padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" };

const STATUS_COLOR = { sent: "#4ade80", failed: "#fca5a5", skipped: "#fbbf24" };

const KIND_LABEL = { invite: "Initial invite", resend: "Resend" };

/**
 * Invite email history — every send and resend attempt, with timestamp,
 * outcome, and who triggered it. Rows are limited by RLS to companies the
 * viewer administers (super admins see all).
 *
 * Props:
 *   companyId  — restrict to one company (Team panel). Omit for all (Admin panel).
 *   companyNames — { [companyId]: name } for display.
 *   refreshKey — bump to reload after a send/resend.
 */
export default function InviteEmailHistory({ companyId = null, companyNames = {}, refreshKey = 0 }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState("");
  const [status, setStatus]   = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { rows: data, error: err } = await fetchInviteEmailHistory({ companyId });
    setRows(data);
    setError(err);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter(r => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        (r.email || "").toLowerCase().includes(q) ||
        (r.triggered_by_email || "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, status]);

  return (
    <div style={card}>
      <h2 style={h2}>
        Invite email history ({visible.length})
      </h2>
      <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>
        Every invitation and resend attempt, newest first — when it went out, whether it sent,
        and who triggered it.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          style={{ ...input, minWidth: 220 }}
          placeholder="Filter by recipient or sender…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          aria-label="Filter invite email history"
        />
        <select style={input} value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by outcome">
          <option value="all">All outcomes</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        <button style={btnGhost} onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <div style={{ overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Date / time</th>
              <th style={th}>Recipient</th>
              {!companyId && <th style={th}>Company</th>}
              <th style={th}>Type</th>
              <th style={th}>Outcome</th>
              <th style={th}>Triggered by</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: "nowrap", color: "#cbd5e1" }}>
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td style={td}>{r.email}</td>
                {!companyId && (
                  <td style={{ ...td, color: "#94a3b8" }}>
                    {r.company_id ? (companyNames[r.company_id] ?? r.company_id) : "—"}
                  </td>
                )}
                <td style={{ ...td, color: "#94a3b8" }}>
                  {KIND_LABEL[r.kind] ?? r.kind}
                  {r.email_action ? ` · ${r.email_action}` : ""}
                </td>
                <td style={{ ...td, color: STATUS_COLOR[r.status] ?? "#94a3b8" }}>
                  {r.status}
                  {r.error_message && (
                    <div style={{ color: "#64748b", fontSize: 11 }}>{r.error_message}</div>
                  )}
                </td>
                <td style={{ ...td, color: "#cbd5e1" }}>{r.triggered_by_email || "—"}</td>
              </tr>
            ))}
            {!visible.length && !loading && (
              <tr>
                <td style={{ ...td, color: "#64748b" }} colSpan={companyId ? 5 : 6}>
                  No invite emails logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
