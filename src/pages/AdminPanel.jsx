import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase.js";

const wrap    = { minHeight: "100vh", background: "#0b1220", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: 24 };
const card    = { background: "#111a2e", border: "1px solid #1f2a44", borderRadius: 10, padding: 20, marginBottom: 20 };
const h1      = { fontSize: 22, fontWeight: 700, margin: 0 };
const h2      = { fontSize: 15, fontWeight: 700, margin: "0 0 12px", letterSpacing: 0.5, textTransform: "uppercase", color: "#94a3b8", display: "flex", alignItems: "center", gap: 8 };
const input   = { background: "#0b1220", border: "1px solid #334155", color: "#f1f5f9", padding: "8px 10px", borderRadius: 6, fontSize: 13, marginRight: 8 };
const btn     = { background: "#0E6B78", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhost= { ...btn, background: "transparent", border: "1px solid #334155", color: "#e2e8f0" };
const table   = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th      = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #1f2a44", color: "#94a3b8", fontWeight: 600 };
const td      = { padding: "8px 10px", borderBottom: "1px solid #1f2a44", verticalAlign: "middle" };
const label   = { fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 };

const ACCESS_ROLES = ["admin", "editor", "read_only"];
const ACCESS_ROLE_HELP = {
  admin: "Full control of this company — edit the model AND manage teammates.",
  editor: "Can edit the financial model, cannot invite/remove teammates.",
  read_only: "Can view the model, cannot make changes.",
};

const ORG_ROLES = [
  { value: "",                  label: "— not set —",              tier: null },
  { value: "OWNER",             label: "Owner",                    tier: 1 },
  { value: "CEO",               label: "CEO",                      tier: 2 },
  { value: "FINANCE",           label: "Finance",                  tier: 3 },
  { value: "REGIONAL_DIRECTOR", label: "Regional Director",        tier: 4 },
  { value: "PROGRAM_MANAGER",   label: "Program Manager",          tier: 5 },
  { value: "HR_MANAGER",        label: "HR Manager",               tier: 6 },
  { value: "SCHEDULER",         label: "Scheduler",                tier: 7 },
  { value: "HOUSE_LEAD",        label: "House Lead",               tier: 8 },
];

function newCompanyId() {
  return "co_" + Math.random().toString(36).slice(2, 10);
}

// ── Info bubble with hover tooltip ────────────────────────────────────────────
function Info({ text, width = 280 }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", cursor: "help" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 15, height: 15, borderRadius: "50%",
        background: "#1f2a44", color: "#94a3b8",
        fontSize: 10, fontWeight: 700, fontFamily: "serif",
        border: "1px solid #334155",
      }}>i</span>
      {open && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)", zIndex: 100,
          background: "#0b1220", border: "1px solid #334155", borderRadius: 6,
          padding: "8px 10px", width, fontSize: 12, color: "#e2e8f0",
          fontWeight: 400, textTransform: "none", letterSpacing: 0,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)", lineHeight: 1.5,
          textAlign: "left", pointerEvents: "none",
        }}>{text}</span>
      )}
    </span>
  );
}

// ── Step pill for the workflow banner ─────────────────────────────────────────
function Step({ n, title, desc }) {
  return (
    <div style={{
      flex: 1, minWidth: 200, background: "#0b1220",
      border: "1px solid #1f2a44", borderRadius: 8, padding: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: "50%",
          background: "#0E6B78", color: "#fff", fontSize: 12, fontWeight: 700,
        }}>{n}</span>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

export default function AdminPanel({ onExit }) {
  const [companies, setCompanies]   = useState([]);
  const [licensees, setLicensees]   = useState([]);
  const [assigns, setAssigns]       = useState([]);
  const [profiles, setProfiles]     = useState([]);
  const [orgRolesByCo, setOrgRolesByCo] = useState({}); // { companyId: { emailLower: statusRow } }
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState(null);
  const [notice, setNotice]         = useState(null);

  // Quick-add (combined) form
  const [qaEmail, setQaEmail]   = useState("");
  const [qaCo, setQaCo]         = useState([]); // array of company ids (multi-assign)
  const [qaAccess, setQaAccess] = useState("editor");
  const [qaOrg, setQaOrg]       = useState("");

  // Company create
  const [coName, setCoName] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [c, l, lc, p] = await Promise.all([
      supabase.from("companies").select("id, name, archived, created_at").order("created_at"),
      supabase.from("licensees").select("id, name, created_at").order("created_at"),
      supabase.from("licensee_companies").select("licensee_id, company_id, role, assigned_at"),
      supabase.from("profiles").select("id, email, is_super_admin, role"),
    ]);
    const e = c.error || l.error || lc.error || p.error;
    if (e) setErr(e.message);
    setCompanies(c.data ?? []);
    setLicensees(l.data ?? []);
    setAssigns(lc.data ?? []);
    setProfiles(p.data ?? []);

    // Fetch org-role status per company
    const cos = c.data ?? [];
    const results = await Promise.all(cos.map(co =>
      supabase.rpc("get_company_member_status", { p_company_id: co.id })
        .then(r => [co.id, r.data ?? []])
    ));
    const byCo = {};
    for (const [coId, rows] of results) {
      const m = {};
      rows.forEach(r => { if (r.email) m[r.email.toLowerCase()] = r; });
      byCo[coId] = m;
    }
    setOrgRolesByCo(byCo);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const licByEmail = useMemo(
    () => Object.fromEntries(licensees.map(l => [l.name.toLowerCase(), l])),
    [licensees]
  );

  // ── Quick-add: one form does create licensee + assign + set org role ───────
  async function quickAdd(e) {
    e.preventDefault();
    setErr(null); setNotice(null);
    const email = qaEmail.trim().toLowerCase();
    if (!email || !qaCo) return;

    // 1. Ensure licensee exists
    let lic = licByEmail[email];
    if (!lic) {
      const { data, error } = await supabase.from("licensees")
        .insert({ name: email }).select("id, name").single();
      if (error) return setErr(`Register licensee: ${error.message}`);
      lic = data;
    }

    // 2. Assign to company with access role
    const { error: aErr } = await supabase.from("licensee_companies")
      .upsert({ licensee_id: lic.id, company_id: qaCo, role: qaAccess },
              { onConflict: "licensee_id,company_id" });
    if (aErr) return setErr(`Assign: ${aErr.message}`);

    // 3. Set org role (optional)
    if (qaOrg) {
      const { error: oErr } = await supabase.rpc("set_member_org_role", {
        p_company_id: qaCo, p_target_email: email, p_role: qaOrg,
      });
      if (oErr) return setErr(`Org role: ${oErr.message}`);
    }

    const coName = companies.find(c => c.id === qaCo)?.name ?? qaCo;
    setNotice(`✓ ${email} added to ${coName} as ${qaAccess}${qaOrg ? ` / ${qaOrg}` : ""}. They can now request a setup link at sign-in.`);
    setQaEmail(""); setQaOrg("");
    reload();
  }

  async function createCompany(e) {
    e.preventDefault();
    if (!coName.trim()) return;
    const { error } = await supabase.from("companies").insert({
      id: newCompanyId(),
      name: coName.trim(),
      archived: false,
      config: { shared: {}, serviceLines: [] },
    });
    if (error) return setErr(error.message);
    setCoName("");
    reload();
  }

  async function unassign(licensee_id, company_id) {
    if (!confirm("Remove this user's access to this company?")) return;
    const { error } = await supabase.from("licensee_companies")
      .delete().eq("licensee_id", licensee_id).eq("company_id", company_id);
    if (error) return setErr(error.message);
    reload();
  }

  async function changeAccess(licensee_id, company_id, nextRole) {
    const { error } = await supabase.from("licensee_companies")
      .update({ role: nextRole }).eq("licensee_id", licensee_id).eq("company_id", company_id);
    if (error) return setErr(error.message);
    reload();
  }

  async function changeOrgRole(companyId, email, nextRole) {
    const { error } = await supabase.rpc("set_member_org_role", {
      p_company_id: companyId, p_target_email: email, p_role: nextRole || null,
    });
    if (error) return setErr(error.message);
    reload();
  }

  async function archiveCompany(id, archived) {
    const { error } = await supabase.from("companies").update({ archived: !archived }).eq("id", id);
    if (error) return setErr(error.message);
    reload();
  }

  async function renameCompany(id, currentName) {
    const next = prompt("Rename company", currentName);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentName) return;
    const { error } = await supabase.from("companies").update({ name: trimmed }).eq("id", id);
    if (error) return setErr(error.message);
    reload();
  }

  async function deleteCompany(id, name) {
    if (!confirm(`Delete company "${name}"? This removes all access assignments to it. The financial model config will be lost.`)) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) return setErr(error.message);
    reload();
  }

  async function deleteLicensee(id, name) {
    if (!confirm(`Delete licensee "${name}" and all their company assignments? Their auth account (if any) is NOT deleted, but they lose all access.`)) return;
    const { error } = await supabase.from("licensees").delete().eq("id", id);
    if (error) return setErr(error.message);
    reload();
  }

  // Group assignments by company for the "who has access" view
  const assignsByCo = useMemo(() => {
    const m = {};
    for (const a of assigns) {
      (m[a.company_id] ||= []).push(a);
    }
    return m;
  }, [assigns]);

  const profileByEmail = useMemo(
    () => Object.fromEntries(profiles.map(p => [p.email.toLowerCase(), p])),
    [profiles]
  );

  // Licensees that have no company assignment yet (orphans)
  const orphans = useMemo(() => {
    const assigned = new Set(assigns.map(a => a.licensee_id));
    return licensees.filter(l => !assigned.has(l.id));
  }, [licensees, assigns]);

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={h1}>Super Admin Panel</h1>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
            Intrinsic-level access. Create companies and grant users access across the platform.
          </div>
        </div>
        <button style={btnGhost} onClick={onExit}>← Back to tool</button>
      </div>

      {err && <div style={{ ...card, background: "#3b1220", borderColor: "#7f1d1d", color: "#fca5a5" }}>{err}</div>}
      {notice && <div style={{ ...card, background: "#0f2a1a", borderColor: "#166534", color: "#86efac" }}>{notice}</div>}
      {loading && <div style={card}>Loading…</div>}

      {/* ── Workflow banner ───────────────────────────────────────────────── */}
      <div style={{ ...card, background: "#0f1a30" }}>
        <h2 style={h2}>How onboarding works</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Step n={1} title="Create the company"
            desc="The portfolio company (e.g. RHI-Boise) that will be financially modeled." />
          <Step n={2} title="Add a user to it"
            desc="Enter their exact email. This registers them as a licensee AND grants access in one step." />
          <Step n={3} title="Set access + org role"
            desc="Access controls what they can do; org role controls what numbers they see inside the model." />
          <Step n={4} title="They sign in"
            desc="User requests a setup link at the login page. Their profile auto-joins on first sign-in." />
        </div>
      </div>

      {/* ── Quick add (combined create licensee + assign + org role) ────── */}
      <div style={card}>
        <h2 style={h2}>
          Add a user
          <Info text="One-step user provisioning. Registers the licensee if new, assigns them to the company, and sets their org role — all at once." />
        </h2>
        <form onSubmit={quickAdd} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>
              Email
              <Info text="Must be the exact email the user will sign in with. Access is joined on this email — a typo means they get 'not_provisioned' at sign-in." />
            </div>
            <input style={{ ...input, marginRight: 0, width: "100%" }}
              type="email" placeholder="user@agency.org"
              value={qaEmail} onChange={e => setQaEmail(e.target.value)} required />
          </div>
          <div>
            <div style={label}>
              Company
              <Info text="The portfolio company they'll be able to open in the tool." />
            </div>
            <select style={{ ...input, marginRight: 0, width: "100%" }}
              value={qaCo} onChange={e => setQaCo(e.target.value)} required>
              <option value="">— pick a company —</option>
              {companies.filter(c => !c.archived).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>
              Access
              <Info width={320} text={
                "admin: manages teammates + edits model.\n" +
                "editor: edits the model.\n" +
                "read_only: view only."
              } />
            </div>
            <select style={{ ...input, marginRight: 0, width: "100%" }}
              value={qaAccess} onChange={e => setQaAccess(e.target.value)}>
              {ACCESS_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <div style={label}>
              Org role
              <Info width={320} text="Optional. Controls what data the user sees inside the model (dollars, wages, referral tracker, SSN unmask). Owner sees everything; House Lead sees least. Can be set later in the Team Panel." />
            </div>
            <select style={{ ...input, marginRight: 0, width: "100%" }}
              value={qaOrg} onChange={e => setQaOrg(e.target.value)}>
              {ORG_ROLES.map(r => (
                <option key={r.value} value={r.value}>
                  {r.tier ? `T${r.tier} — ${r.label}` : r.label}
                </option>
              ))}
            </select>
          </div>
          <button style={btn} type="submit">+ Add user</button>
        </form>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
          Access hint: <b>{qaAccess}</b> — {ACCESS_ROLE_HELP[qaAccess]}
        </div>
      </div>

      {/* ── Companies ─────────────────────────────────────────────────────── */}
      <div style={card}>
        <h2 style={h2}>
          Companies ({companies.length})
          <Info text="Each company is a distinct portfolio entity being financially modeled. It gets its own service lines, staffing, and P&L." />
        </h2>
        <form onSubmit={createCompany} style={{ marginBottom: 14 }}>
          <input style={input} placeholder="Company name (e.g. RHI-Boise)" value={coName} onChange={e => setCoName(e.target.value)} />
          <button style={btn} type="submit">+ Create company</button>
        </form>
        <table style={table}>
          <thead><tr>
            <th style={th}>Name</th>
            <th style={th}>Members</th>
            <th style={th}>Status</th>
            <th style={th}>ID</th>
            <th style={th}></th>
          </tr></thead>
          <tbody>
            {companies.map(c => (
              <tr key={c.id}>
                <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                <td style={td}>{(assignsByCo[c.id] ?? []).length}</td>
                <td style={td}>
                  {c.archived
                    ? <span style={{ color: "#94a3b8" }}>Archived</span>
                    : <span style={{ color: "#4ade80" }}>● Active</span>}
                </td>
                <td style={{ ...td, fontFamily: "monospace", color: "#64748b", fontSize: 11 }}>{c.id}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button style={{ ...btnGhost, marginRight: 6 }} onClick={() => renameCompany(c.id, c.name)}>Rename</button>
                  <button style={{ ...btnGhost, marginRight: 6 }} onClick={() => archiveCompany(c.id, c.archived)}>{c.archived ? "Unarchive" : "Archive"}</button>
                  <button style={{ ...btnGhost, borderColor: "#7f1d1d", color: "#fca5a5" }} onClick={() => deleteCompany(c.id, c.name)}>Delete</button>
                </td>
              </tr>
            ))}
            {!companies.length && <tr><td style={{ ...td, color: "#64748b" }} colSpan={5}>No companies yet — create one to begin.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Access by company (the main management view) ──────────────────── */}
      <div style={card}>
        <h2 style={h2}>
          Who has access
          <Info width={340} text="Grouped by company. Each row shows a user's Access role (what they can do) and Org role (what they see). Change either inline. Use 'Remove' to revoke access to that company only — the licensee record stays." />
        </h2>
        {companies.filter(c => !c.archived).length === 0 && (
          <div style={{ color: "#64748b", fontSize: 13 }}>No active companies.</div>
        )}
        {companies.filter(c => !c.archived).map(c => {
          const rows = assignsByCo[c.id] ?? [];
          const orgMap = orgRolesByCo[c.id] ?? {};
          return (
            <div key={c.id} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#f1f5f9" }}>
                {c.name} <span style={{ color: "#64748b", fontSize: 12, fontWeight: 400 }}>· {rows.length} member{rows.length === 1 ? "" : "s"}</span>
              </div>
              {rows.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 12, padding: "6px 10px", background: "#0b1220", borderRadius: 6 }}>
                  No members yet. Use "Add a user" above.
                </div>
              ) : (
                <table style={table}>
                  <thead><tr>
                    <th style={th}>Email</th>
                    <th style={th}>Account</th>
                    <th style={th}>Access</th>
                    <th style={th}>Org role</th>
                    <th style={th}></th>
                  </tr></thead>
                  <tbody>
                    {rows.map(a => {
                      const lic = licensees.find(l => l.id === a.licensee_id);
                      const email = lic?.name ?? a.licensee_id;
                      const prof = profileByEmail[email.toLowerCase()];
                      const status = orgMap[email.toLowerCase()] ?? {};
                      const orgRole = status.org_role ?? status.pending_org_role ?? "";
                      const isPending = !prof || (!status.org_role && status.pending_org_role);
                      return (
                        <tr key={a.licensee_id + a.company_id}>
                          <td style={td}>
                            {email}
                            {prof?.is_super_admin && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: "#fbbf24", border: "1px solid #7c5a10", padding: "1px 5px", borderRadius: 3 }}>SUPER</span>
                            )}
                          </td>
                          <td style={td}>
                            {prof ? (
                              <span style={{ color: "#4ade80", fontSize: 12 }}>● Active</span>
                            ) : (
                              <span style={{ color: "#fbbf24", fontSize: 12 }}>○ Not signed up</span>
                            )}
                          </td>
                          <td style={td}>
                            <select style={{ ...input, marginRight: 0 }}
                              value={a.role} onChange={e => changeAccess(a.licensee_id, a.company_id, e.target.value)}>
                              {ACCESS_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </td>
                          <td style={td}>
                            <select style={{ ...input, marginRight: 0, minWidth: 190 }}
                              value={orgRole}
                              onChange={e => changeOrgRole(c.id, email, e.target.value)}>
                              {ORG_ROLES.map(r => (
                                <option key={r.value} value={r.value}>
                                  {r.tier ? `T${r.tier} — ${r.label}` : r.label}
                                </option>
                              ))}
                            </select>
                            {isPending && orgRole && (
                              <div style={{ color: "#fbbf24", fontSize: 11, marginTop: 4 }}>Pending — applies at first sign-in</div>
                            )}
                          </td>
                          <td style={td}>
                            <button style={{ ...btnGhost, borderColor: "#7f1d1d", color: "#fca5a5" }}
                              onClick={() => unassign(a.licensee_id, a.company_id)}>Remove</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Orphaned licensees (registered but not assigned anywhere) ─────── */}
      {orphans.length > 0 && (
        <div style={card}>
          <h2 style={h2}>
            Unassigned licensees ({orphans.length})
            <Info text="Users registered but not granted access to any company. They can't sign in successfully until assigned. Delete them if they were added by mistake." />
          </h2>
          <table style={table}>
            <thead><tr><th style={th}>Email</th><th style={th}>Account exists?</th><th style={th}></th></tr></thead>
            <tbody>
              {orphans.map(l => {
                const p = profileByEmail[l.name.toLowerCase()];
                return (
                  <tr key={l.id}>
                    <td style={td}>{l.name}</td>
                    <td style={td}>{p ? <span style={{ color: "#4ade80" }}>✓ signed up</span> : <span style={{ color: "#fbbf24" }}>○ not yet</span>}</td>
                    <td style={td}>
                      <button style={{ ...btnGhost, borderColor: "#7f1d1d", color: "#fca5a5" }}
                        onClick={() => deleteLicensee(l.id, l.name)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Glossary ──────────────────────────────────────────────────────── */}
      <div style={{ ...card, background: "#0f1a30" }}>
        <h2 style={h2}>Terms cheat sheet</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 12, lineHeight: 1.6 }}>
          <div>
            <b style={{ color: "#f1f5f9" }}>Company</b> — a portfolio entity being modeled (e.g. RHI-Boise). Not the Intrinsic subscriber.<br/>
            <b style={{ color: "#f1f5f9" }}>Licensee</b> — a user record, keyed by email. Must match their sign-in email exactly.<br/>
            <b style={{ color: "#f1f5f9" }}>Assignment</b> — the link between a licensee and a company, with an access role.
          </div>
          <div>
            <b style={{ color: "#f1f5f9" }}>Access role</b> — what they can DO in the app (admin / editor / read_only). Set per company.<br/>
            <b style={{ color: "#f1f5f9" }}>Org role</b> — what they can SEE inside the model. Tier 1 (Owner) → Tier 8 (House Lead). Gates dollars, wages, referral tracker, SSN unmask.<br/>
            <b style={{ color: "#f1f5f9" }}>Super admin</b> — Intrinsic-level. Sees this panel and every company. Managed at the database level.
          </div>
        </div>
      </div>
    </div>
  );
}
