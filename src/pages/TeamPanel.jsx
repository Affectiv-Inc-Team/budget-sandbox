import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase.js";

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

const ROLES = ["admin", "editor", "read_only"];

const ORG_ROLES = [
  { value: "",                  label: "— not set —" },
  { value: "OWNER",             label: "Owner (T1)" },
  { value: "CEO",               label: "CEO (T2)" },
  { value: "FINANCE",           label: "Finance (T3)" },
  { value: "REGIONAL_DIRECTOR", label: "Regional Director (T4)" },
  { value: "PROGRAM_MANAGER",   label: "Program Manager (T5)" },
  { value: "HR_MANAGER",        label: "HR Manager (T6)" },
  { value: "SCHEDULER",         label: "Scheduler (T7)" },
  { value: "HOUSE_LEAD",        label: "House Lead (T8)" },
];

export default function TeamPanel() {
  const navigate = useNavigate();
  const [me, setMe]                 = useState(null);          // profile
  const [adminCompanies, setAdminCompanies] = useState([]);    // [{id,name}]
  const [selectedCo, setSelectedCo] = useState("");
  const [members, setMembers]       = useState([]);            // rows joined with licensees
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState("editor");

  // Load current user + companies they administer
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }
      const { data: profile } = await supabase.from("profiles")
        .select("id, email, is_super_admin").eq("id", user.id).single();
      setMe(profile);

      // Find companies where this user is an admin (via licensee row matching email)
      const { data: lic } = await supabase.from("licensees").select("id").eq("name", profile.email);
      const licId = lic?.[0]?.id;
      let companyRows = [];
      if (profile?.is_super_admin) {
        const { data } = await supabase.from("companies").select("id, name").eq("archived", false).order("name");
        companyRows = data ?? [];
      } else if (licId) {
        const { data } = await supabase.from("licensee_companies")
          .select("company_id, role, companies(id, name, archived)")
          .eq("licensee_id", licId).eq("role", "admin");
        companyRows = (data ?? [])
          .map(r => r.companies).filter(c => c && !c.archived);
      }
      setAdminCompanies(companyRows);
      if (companyRows.length && !selectedCo) setSelectedCo(companyRows[0].id);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMembers = useCallback(async (companyId) => {
    if (!companyId) { setMembers([]); return; }
    setErr(null);
    const { data, error } = await supabase.from("licensee_companies")
      .select("licensee_id, company_id, role, assigned_at, licensees(id, name)")
      .eq("company_id", companyId);
    if (error) { setErr(error.message); return; }
    setMembers(data ?? []);
  }, []);

  useEffect(() => { loadMembers(selectedCo); }, [selectedCo, loadMembers]);

  const [orgRoles, setOrgRoles] = useState({}); // email(lower) -> { org_role, pending_org_role, has_account, last_sign_in_at, confirmed_at }
  const loadOrgRoles = useCallback(async (companyId) => {
    if (!companyId) { setOrgRoles({}); return; }
    const { data, error } = await supabase.rpc("get_company_member_status", { p_company_id: companyId });
    if (error) return;
    const m = {};
    (data ?? []).forEach(r => { if (r.email) m[r.email.toLowerCase()] = r; });
    setOrgRoles(m);
  }, []);
  useEffect(() => { loadOrgRoles(selectedCo); }, [selectedCo, loadOrgRoles, members]);

  async function changeOrgRole(email, nextRole) {
    setErr(null);
    const { error } = await supabase.rpc("set_member_org_role", {
      p_company_id: selectedCo,
      p_target_email: email,
      p_role: nextRole || null,
    });
    if (error) return setErr(error.message);
    loadOrgRoles(selectedCo);
  }

  const adminCount = useMemo(
    () => members.filter(m => m.role === "admin").length,
    [members]
  );

  async function addMember(e) {
    e.preventDefault();
    setErr(null);
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !selectedCo) return;

    // Find or create licensee row (name = email)
    let { data: existing } = await supabase.from("licensees").select("id").eq("name", email).maybeSingle();
    let licenseeId = existing?.id;
    if (!licenseeId) {
      const { data: created, error: cErr } = await supabase.from("licensees")
        .insert({ name: email }).select("id").single();
      if (cErr) return setErr(cErr.message);
      licenseeId = created.id;
    }

    const { error } = await supabase.from("licensee_companies").upsert(
      { licensee_id: licenseeId, company_id: selectedCo, role: inviteRole },
      { onConflict: "licensee_id,company_id" }
    );
    if (error) return setErr(error.message);
    setInviteEmail("");
    loadMembers(selectedCo);
  }

  async function changeRole(licensee_id, nextRole, currentRole) {
    if (currentRole === "admin" && nextRole !== "admin" && adminCount <= 1) {
      alert("This is the last admin — promote someone else to admin first.");
      return;
    }
    const { error } = await supabase.from("licensee_companies")
      .update({ role: nextRole })
      .eq("licensee_id", licensee_id).eq("company_id", selectedCo);
    if (error) return setErr(error.message);
    loadMembers(selectedCo);
  }

  async function removeMember(licensee_id, role, name) {
    if (role === "admin" && adminCount <= 1) {
      alert("This is the last admin — promote someone else first.");
      return;
    }
    if (!confirm(`Remove ${name} from this company?`)) return;
    const { error } = await supabase.from("licensee_companies")
      .delete().eq("licensee_id", licensee_id).eq("company_id", selectedCo);
    if (error) return setErr(error.message);
    loadMembers(selectedCo);
  }

  if (loading) return <div style={wrap}>Loading…</div>;

  if (!adminCompanies.length) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={h1}>Team</h1>
          <button style={btnGhost} onClick={() => navigate('/app')}>← Back to tool</button>
        </div>
        <div style={card}>
          You are not a company admin on any company. Contact your Intrinsic super admin to be promoted.
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={h1}>Team Management</h1>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
            Add teammates by email, set their access level, and remove them when needed.
          </div>
        </div>
        <button style={btnGhost} onClick={() => navigate('/app')}>← Back to tool</button>
      </div>

      {err && <div style={{ ...card, background: "#3b1220", borderColor: "#7f1d1d", color: "#fca5a5" }}>{err}</div>}

      <div style={card}>
        <h2 style={h2}>Company</h2>
        <select style={{ ...input, minWidth: 260 }} value={selectedCo} onChange={e => setSelectedCo(e.target.value)}>
          {adminCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={card}>
        <h2 style={h2}>Add a teammate</h2>
        <form onSubmit={addMember} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            style={{ ...input, width: 300 }}
            placeholder="teammate@company.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            type="email"
          />
          <select style={input} value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button style={btn} type="submit">+ Add</button>
        </form>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>
          The teammate must sign up with this exact email to gain access. If they already have an account, access is immediate on next sign-in.
        </div>
      </div>

      <div style={card}>
        <h2 style={h2}>Members ({members.length})</h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Email</th>
              <th style={th}>Access</th>
              <th style={th}>Org Role</th>
              <th style={th}>Added</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const email = m.licensees?.name ?? m.licensee_id;
              const isMe = email === me?.email;
              const orgRole = orgRoles[String(email).toLowerCase()] ?? "";
              return (
                <tr key={m.licensee_id}>
                  <td style={td}>{email}{isMe && <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: 6 }}>(you)</span>}</td>
                  <td style={td}>
                    <select
                      style={{ ...input, marginRight: 0 }}
                      value={m.role}
                      onChange={e => changeRole(m.licensee_id, e.target.value, m.role)}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <select
                      style={{ ...input, marginRight: 0, minWidth: 190 }}
                      value={orgRole}
                      onChange={e => changeOrgRole(email, e.target.value)}
                    >
                      {ORG_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, color: "#64748b", fontSize: 12 }}>
                    {m.assigned_at ? new Date(m.assigned_at).toLocaleDateString() : ""}
                  </td>
                  <td style={td}>
                    <button
                      style={{ ...btnGhost, borderColor: "#7f1d1d", color: "#fca5a5" }}
                      onClick={() => removeMember(m.licensee_id, m.role, email)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {!members.length && (
              <tr><td style={{ ...td, color: "#64748b" }} colSpan={5}>No members yet.</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
          <b>Access</b> controls which company they can touch: <b>admin</b> manages teammates and edits the model, <b>editor</b> edits the model, <b>read_only</b> views only.<br/>
          <b>Org Role</b> controls what they see inside the model — dollars, wages, referral tracker, SSN unmask, and sidebar controls are all gated by tier (T1 Owner → T8 House Lead).
        </div>
      </div>
    </div>
  );
}
