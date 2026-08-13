import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, sendInvite, getMyCompanyScopes, resendSetupLink } from "../supabase.js";
import InviteEmailHistory from "../components/InviteEmailHistory.jsx";
import {
  ROLE_TIERS,
  ROLE_LABELS,
  invitableRoles,
  canInviteRole,
} from "../lib/access.js";

const wrap    = { minHeight: "100vh", background: "#0b1220", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 24 };
const card    = { background: "#111a2e", border: "1px solid #1f2a44", borderRadius: 10, padding: 20, marginBottom: 20 };
const h1      = { fontSize: 22, fontWeight: 700, margin: 0 };
const h2      = { fontSize: 15, fontWeight: 700, margin: "0 0 12px", letterSpacing: 0.5, textTransform: "uppercase", color: "#94a3b8" };
const input   = { background: "#0b1220", border: "1px solid #334155", color: "#f1f5f9", padding: "8px 10px", borderRadius: 6, fontSize: 13, marginRight: 8 };
const btn     = { background: "#0E6B78", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhost= { ...btn, background: "transparent", border: "1px solid #334155", color: "#e2e8f0" };
const table   = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th      = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #1f2a44", color: "#94a3b8", fontWeight: 600 };
const td      = { padding: "8px 10px", borderBottom: "1px solid #1f2a44" };

// Tier chip color bands: 1–3 full-visibility (teal), 4–6 operational (gold),
// 7–8 read-only (slate) — same banding the prototype used.
const CHIP_BANDS = {
  full:        { background: "rgba(14,107,120,0.25)",  color: "#7dd3e0" },
  operational: { background: "rgba(212,165,32,0.22)",  color: "#e8c44a" },
  readonly:    { background: "rgba(148,163,184,0.18)", color: "#94a3b8" },
};
function chipStyle(role) {
  const t = ROLE_TIERS[role] ?? 99;
  const band = t <= 3 ? "full" : t <= 6 ? "operational" : "readonly";
  return {
    ...CHIP_BANDS[band],
    fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
    padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap",
  };
}

function roleOption(role) {
  return { value: role, label: `${ROLE_LABELS[role]} (T${ROLE_TIERS[role]})` };
}

// "Who you can invite" summary — Owner special-case, House Lead locked.
export function permissionText(userRole) {
  const inv = invitableRoles(userRole);
  if (ROLE_TIERS[userRole] === 1) {
    return "As Owner, you can invite any tier — including another Owner. Owner is the only tier that can invite its own tier.";
  }
  if (!inv.length) {
    return `${ROLE_LABELS[userRole] ?? "Your role"} can't invite anyone — there's no tier below it.`;
  }
  const names = inv.map((r) => ROLE_LABELS[r]).join(", ");
  return `As ${ROLE_LABELS[userRole]}, you can invite: ${names}. You can't invite ${ROLE_LABELS[userRole]} or any tier above it.`;
}

// Roster status from the get_company_member_status row. Invited vs Active must
// key on last_sign_in_at — inviteUserByEmail creates the auth account at
// invite time, so has_account alone can't distinguish them.
export function memberStatus(row) {
  // Not currently reachable via this screen — revoke_invite deletes the
  // licensee_companies row synchronously, so a revoked member's row never
  // makes it into get_company_member_status's result. Kept as a guard in
  // case that invariant ever changes (e.g. revoke stops deleting eagerly).
  if (row.invite_status === "revoked") return { label: "Revoked", color: "#fca5a5" };
  if (row.last_sign_in_at) return { label: "● Active", color: "#4ade80" };
  if (row.invite_status === "failed") return { label: "⚠ Invite failed", color: "#fca5a5" };
  if (row.invite_status === "pending" || row.invite_status === "sent") {
    return { label: "◌ Invited", color: "#fbbf24" };
  }
  return { label: "○ Not signed up", color: "#fbbf24" };
}

export function scopeLabel(scopeId, company) {
  if (!scopeId) return "Whole Company";
  const line = (company?.config?.serviceLines ?? []).find((sl) => sl.id === scopeId);
  return line ? (line.name || line.type) : "(removed)";
}

export default function TeamPanel({ userRole }) {
  const navigate = useNavigate();
  const [me, setMe]               = useState(null);
  const [myScopes, setMyScopes]   = useState({});   // companyId -> { accessRole, serviceLineScope }
  const [companies, setCompanies] = useState([]);   // [{id, name, config}]
  const [selectedCo, setSelectedCo] = useState("");
  const [emailLogKey, setEmailLogKey] = useState(0);
  const [members, setMembers]     = useState([]);   // get_company_member_status rows
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState(null);
  const [notice, setNotice]       = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState("");
  const [inviteScope, setInviteScope] = useState("");
  const [sending, setSending]         = useState(false);
  const [resending, setResending]     = useState(() => new Set());

  const myInvitableRoles = useMemo(() => invitableRoles(userRole), [userRole]);
  const canInviteAtAll   = myInvitableRoles.length > 0;

  // Load identity + the companies this user belongs to (all, not just admin —
  // the roster is visible to every tier; invite rights come from the org tier).
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }
      const { data: profile } = await supabase.from("profiles")
        .select("id, email, is_super_admin").eq("id", user.id).single();
      setMe(profile);

      let rows = [];
      if (profile?.is_super_admin) {
        const { data } = await supabase.from("companies")
          .select("id, name, config").eq("archived", false).order("name");
        rows = data ?? [];
      } else {
        const scopes = await getMyCompanyScopes();
        setMyScopes(scopes);
        const ids = Object.keys(scopes);
        if (ids.length) {
          const { data } = await supabase.from("companies")
            .select("id, name, archived, config").in("id", ids).order("name");
          rows = (data ?? []).filter((c) => !c.archived);
        }
      }
      setCompanies(rows);
      if (rows.length) setSelectedCo((prev) => prev || rows[0].id);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMembers = useCallback(async (companyId) => {
    if (!companyId) { setMembers([]); return; }
    setErr(null);
    const { data, error } = await supabase.rpc("get_company_member_status", {
      p_company_id: companyId,
    });
    if (error) { setErr(error.message); return; }
    setMembers(data ?? []);
  }, []);

  useEffect(() => { loadMembers(selectedCo); }, [selectedCo, loadMembers]);

  // Clear the invite form and any banners from the previous company — a
  // stale scope id or error/notice from company A shouldn't carry over to a
  // submit against company B.
  useEffect(() => {
    setInviteEmail(""); setInviteRole(""); setInviteScope("");
    setErr(null); setNotice(null);
  }, [selectedCo]);

  const company = useMemo(
    () => companies.find((c) => c.id === selectedCo) ?? null,
    [companies, selectedCo],
  );
  const activeLines = useMemo(
    () => (company?.config?.serviceLines ?? []).filter((sl) => !sl.archived),
    [company],
  );
  const iAmAdmin = me?.is_super_admin || myScopes[selectedCo]?.accessRole === "admin";
  const adminCount = useMemo(
    () => members.filter((m) => m.access_role === "admin").length,
    [members],
  );

  const inviteTier = ROLE_TIERS[inviteRole];
  const needsScope = !!inviteRole && inviteTier >= 4;
  const emailOk = inviteEmail.trim().length > 3 && inviteEmail.includes("@");
  const canSend = emailOk && !!inviteRole && (!needsScope || !!inviteScope) && !sending;

  async function submitInvite(e) {
    e.preventDefault();
    if (!canSend || !selectedCo) return;
    setErr(null); setNotice(null); setSending(true);
    const result = await sendInvite({
      companyId: selectedCo,
      email: inviteEmail,
      orgRole: inviteRole,
      serviceLineScope: needsScope ? inviteScope : null,
    });
    setSending(false);
    if (!result.ok) { setErr(result.error); return; }
    setNotice(`Invite sent to ${inviteEmail.trim().toLowerCase()}${result.emailAction === "recovery" ? " (existing account — they received a sign-in link)" : ""}.`);
    setInviteEmail(""); setInviteRole(""); setInviteScope("");
    setEmailLogKey((k) => k + 1);
    loadMembers(selectedCo);
  }

  async function resendMemberEmail(email) {
    const addr = String(email || "").trim().toLowerCase();
    if (!addr || resending.has(addr)) return;
    setErr(null); setNotice(null);
    setResending((prev) => new Set(prev).add(addr));
    const result = await resendSetupLink(addr, selectedCo);
    setResending((prev) => {
      const next = new Set(prev);
      next.delete(addr);
      return next;
    });
    setEmailLogKey((k) => k + 1);
    if (result.ok) setNotice(`Setup email re-sent to ${addr}.`);
    else setErr(result.error);
  }

  async function changeOrgRole(email, nextRole) {
    setErr(null);
    const { error } = await supabase.rpc("set_member_org_role", {
      p_company_id: selectedCo,
      p_target_email: email,
      p_role: nextRole || null,
    });
    if (error) return setErr(error.message);
    loadMembers(selectedCo);
  }

  async function removeMember(email, accessRole) {
    if (accessRole === "admin" && adminCount <= 1) {
      alert("This is the last admin — promote someone else first.");
      return;
    }
    if (!confirm(`Remove ${email} from this company?`)) return;
    setErr(null);
    const { data: lic, error: licErr } = await supabase.from("licensees")
      .select("id").eq("name", email).limit(1);
    if (licErr || !lic?.length) return setErr(licErr?.message ?? "member not found");
    const { error } = await supabase.from("licensee_companies")
      .delete().eq("licensee_id", lic[0].id).eq("company_id", selectedCo);
    if (error) return setErr(error.message);
    loadMembers(selectedCo);
  }

  if (loading) return <div style={wrap}>Loading…</div>;

  if (!companies.length) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={h1}>Team</h1>
          <button style={btnGhost} onClick={() => navigate('/app')}>← Back to tool</button>
        </div>
        <div style={card}>
          You aren't a member of any company yet. Contact your Intrinsic administrator.
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={h1}>Team &amp; Invitations</h1>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
            Invite teammates by email — their tier decides what they see, not just what they can click.
          </div>
        </div>
        <button style={btnGhost} onClick={() => navigate('/app')}>← Back to tool</button>
      </div>

      {err && <div style={{ ...card, background: "#3b1220", borderColor: "#7f1d1d", color: "#fca5a5" }}>{err}</div>}
      {notice && <div style={{ ...card, background: "#0f2a1e", borderColor: "#14532d", color: "#86efac" }}>{notice}</div>}

      {/* Who you can invite */}
      <div style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ ...chipStyle(userRole), marginTop: 1 }}>
          {ROLE_LABELS[userRole] ? `TIER ${ROLE_TIERS[userRole]} · ${ROLE_LABELS[userRole]}` : "NO ROLE"}
        </span>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{permissionText(userRole)}</div>
      </div>

      {companies.length > 1 && (
        <div style={card}>
          <h2 style={h2}>Company</h2>
          <select style={{ ...input, minWidth: 260 }} value={selectedCo} onChange={(e) => setSelectedCo(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Invite form — or the locked state for tiers with nobody below them */}
      <div style={card}>
        <h2 style={h2}>Invite a teammate</h2>
        {canInviteAtAll ? (
          <>
            <form onSubmit={submitInvite} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                style={{ ...input, width: 280 }}
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                type="email"
                aria-label="Invite email"
              />
              <select
                style={{ ...input, minWidth: 200 }}
                value={inviteRole}
                onChange={(e) => { setInviteRole(e.target.value); setInviteScope(""); }}
                aria-label="Invite tier"
              >
                <option value="" disabled>Choose a tier…</option>
                {myInvitableRoles.map((r) => {
                  const o = roleOption(r);
                  return <option key={o.value} value={o.value}>{o.label}</option>;
                })}
              </select>
              {inviteRole && (needsScope ? (
                <select
                  style={{ ...input, minWidth: 200 }}
                  value={inviteScope}
                  onChange={(e) => setInviteScope(e.target.value)}
                  aria-label="Service line scope"
                >
                  <option value="" disabled>Choose a service line…</option>
                  {activeLines.map((sl) => (
                    <option key={sl.id} value={sl.id}>{sl.name || sl.type}</option>
                  ))}
                </select>
              ) : (
                <input style={{ ...input, width: 160, color: "#94a3b8" }} value="Whole Company" disabled aria-label="Scope" />
              ))}
              <button style={{ ...btn, opacity: canSend ? 1 : 0.4, cursor: canSend ? "pointer" : "not-allowed" }} type="submit" disabled={!canSend}>
                {sending ? "Sending…" : "Send invite"}
              </button>
            </form>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
              {needsScope
                ? `Tier ${inviteTier} (${ROLE_LABELS[inviteRole]}) is tied to one service line, not the whole company.`
                : inviteRole
                  ? `Tier ${inviteTier} (${ROLE_LABELS[inviteRole]}) sees the whole company — nothing to scope.`
                  : "Pick a tier, then a scope — tiers 1–3 always see the whole company; tier 4 and below are tied to one service line."}
              {needsScope && !activeLines.length && (
                <div style={{ color: "#fbbf24", marginTop: 4 }}>
                  This company has no active service lines yet — add one in the tool before sending tier-4+ invites.
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "18px 6px" }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
            <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>
              {ROLE_LABELS[userRole] ?? "Your role"} sits at the bottom of the tier system — there's no tier
              below it to invite. If a teammate needs access, ask an Owner to send that invite.
            </div>
          </div>
        )}
      </div>

      {/* Roster */}
      <div style={card}>
        <h2 style={h2}>Team ({members.length})</h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Email</th>
              <th style={th}>Tier</th>
              <th style={th}>Scope</th>
              <th style={th}>Access</th>
              <th style={th}>Status</th>
              <th style={th}>Last sign-in</th>
              <th style={th}>You can invite this tier</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isMe = m.email === me?.email;
              const effectiveRole = m.org_role ?? m.pending_org_role ?? "";
              const rolePending = !m.org_role && m.pending_org_role;
              const status = memberStatus(m);
              const roleKnown = !!ROLE_LABELS[effectiveRole];
              // Mirrors the server's tier rule (set_member_org_role / delete
              // RLS): Owner manages anyone; everyone else only rows whose
              // CURRENT tier is strictly below their own. A row with no tier
              // set yet is always manageable (server treats "unset" as
              // below everyone).
              const canManageRow = iAmAdmin && (
                ROLE_TIERS[userRole] === 1 || !roleKnown || ROLE_TIERS[effectiveRole] > ROLE_TIERS[userRole]
              );
              return (
                <tr key={m.email}>
                  <td style={td}>
                    {m.email}
                    {isMe && <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: 6 }}>(you)</span>}
                  </td>
                  <td style={td}>
                    {canManageRow ? (
                      <select
                        style={{ ...input, marginRight: 0, minWidth: 190 }}
                        value={effectiveRole}
                        onChange={(e) => changeOrgRole(m.email, e.target.value)}
                        aria-label={`Tier for ${m.email}`}
                      >
                        <option value="">— not set —</option>
                        {/* current value stays selectable even when outside the caller's range */}
                        {effectiveRole && !myInvitableRoles.includes(effectiveRole) && (
                          <option value={effectiveRole}>{roleOption(effectiveRole).label}</option>
                        )}
                        {myInvitableRoles.map((r) => {
                          const o = roleOption(r);
                          return <option key={o.value} value={o.value}>{o.label}</option>;
                        })}
                      </select>
                    ) : roleKnown ? (
                      <span style={chipStyle(effectiveRole)}>
                        TIER {ROLE_TIERS[effectiveRole]} · {ROLE_LABELS[effectiveRole]}
                      </span>
                    ) : (
                      <span style={{ color: "#64748b" }}>— not set —</span>
                    )}
                    {rolePending && (
                      <div style={{ color: "#fbbf24", fontSize: 11, marginTop: 4 }}>Pending — applies at first sign-in</div>
                    )}
                  </td>
                  <td style={td}>{scopeLabel(m.service_line_scope, company)}</td>
                  <td style={{ ...td, color: "#94a3b8" }}>{m.access_role}</td>
                  <td style={td}><span style={{ color: status.color, fontSize: 12 }}>{status.label}</span></td>
                  <td style={{ ...td, color: "#94a3b8", fontSize: 12 }}>
                    {m.last_sign_in_at
                      ? new Date(m.last_sign_in_at).toLocaleString()
                      : m.has_account ? "Never" : "—"}
                  </td>
                  <td style={td}>
                    {roleKnown ? (
                      canInviteRole(userRole, effectiveRole)
                        ? <span style={{ color: "#4ade80" }}>✓ Yes</span>
                        : <span style={{ color: "#64748b" }}>— No</span>
                    ) : <span style={{ color: "#64748b" }}>—</span>}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {canManageRow && (
                      <>
                        <button
                          style={{ ...btnGhost, marginRight: 6 }}
                          disabled={resending.has(m.email?.toLowerCase())}
                          title="Re-send their account setup / sign-in email"
                          onClick={() => resendMemberEmail(m.email)}
                        >
                          {resending.has(m.email?.toLowerCase()) ? "Sending…" : "Resend email"}
                        </button>
                        <button
                          style={{ ...btnGhost, borderColor: "#7f1d1d", color: "#fca5a5" }}
                          onClick={() => removeMember(m.email, m.access_role)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!members.length && (
              <tr><td style={{ ...td, color: "#64748b" }} colSpan={8}>No members yet.</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
          <b>Tier</b> controls what they see inside the model — dollars, wages, referral tracker, and
          sidebar controls are all gated by tier (T1 Owner → T8 House Lead). It also sets their
          <b> access</b> level at invite time: T1–3 admin (manage the team), T4–6 editor (save the model),
          T7–8 read-only. <b>Scope</b> ties tier 4+ teammates to one service line.
        </div>
      </div>

      {selectedCo && iAmAdmin && (
        <InviteEmailHistory companyId={selectedCo} refreshKey={emailLogKey} />
      )}
    </div>
  );
}
