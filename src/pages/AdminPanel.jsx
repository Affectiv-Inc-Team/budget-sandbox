import { useState, useEffect, useCallback } from "react";
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

function newCompanyId() {
  return "co_" + Math.random().toString(36).slice(2, 10);
}

export default function AdminPanel({ onExit }) {
  const [companies, setCompanies]   = useState([]);
  const [licensees, setLicensees]   = useState([]);
  const [assigns, setAssigns]       = useState([]);
  const [profiles, setProfiles]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState(null);

  const [coName, setCoName]         = useState("");
  const [licName, setLicName]       = useState("");
  const [assignLic, setAssignLic]   = useState("");
  const [assignCo, setAssignCo]     = useState("");
  const [assignRole, setAssignRole] = useState("editor");

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
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

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

  async function createLicensee(e) {
    e.preventDefault();
    if (!licName.trim()) return;
    const { error } = await supabase.from("licensees").insert({ name: licName.trim() });
    if (error) return setErr(error.message);
    setLicName("");
    reload();
  }

  async function assign(e) {
    e.preventDefault();
    if (!assignLic || !assignCo) return;
    const { error } = await supabase.from("licensee_companies")
      .upsert({ licensee_id: assignLic, company_id: assignCo, role: assignRole },
              { onConflict: "licensee_id,company_id" });
    if (error) return setErr(error.message);
    reload();
  }

  async function unassign(licensee_id, company_id) {
    const { error } = await supabase.from("licensee_companies")
      .delete().eq("licensee_id", licensee_id).eq("company_id", company_id);
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
    if (!confirm(`Delete company "${name}"? This removes all licensee assignments to it. The financial model config will be lost.`)) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) return setErr(error.message);
    reload();
  }

  async function deleteLicensee(id) {
    if (!confirm("Delete this licensee and all its assignments?")) return;
    const { error } = await supabase.from("licensees").delete().eq("id", id);
    if (error) return setErr(error.message);
    reload();
  }

  const profileByEmail = Object.fromEntries(profiles.map(p => [p.email, p]));

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={h1}>Super Admin Panel</h1>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
            Provision companies, register licensees (by user email), and assign access.
          </div>
        </div>
        <button style={btnGhost} onClick={onExit}>← Back to tool</button>
      </div>

      {err && <div style={{ ...card, background: "#3b1220", borderColor: "#7f1d1d", color: "#fca5a5" }}>{err}</div>}
      {loading && <div style={card}>Loading…</div>}

      <div style={card}>
        <h2 style={h2}>Companies ({companies.length})</h2>
        <form onSubmit={createCompany} style={{ marginBottom: 14 }}>
          <input style={input} placeholder="Company name" value={coName} onChange={e => setCoName(e.target.value)} />
          <button style={btn} type="submit">+ Create company</button>
        </form>
        <table style={table}>
          <thead><tr><th style={th}>ID</th><th style={th}>Name</th><th style={th}>Status</th><th style={th}></th></tr></thead>
          <tbody>
            {companies.map(c => (
              <tr key={c.id}>
                <td style={{ ...td, fontFamily: "monospace", color: "#64748b" }}>{c.id}</td>
                <td style={td}>{c.name}</td>
                <td style={td}>{c.archived ? "Archived" : "Active"}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button style={{ ...btnGhost, marginRight: 6 }} onClick={() => renameCompany(c.id, c.name)}>Rename</button>
                  <button style={{ ...btnGhost, marginRight: 6 }} onClick={() => archiveCompany(c.id, c.archived)}>{c.archived ? "Unarchive" : "Archive"}</button>
                  <button style={{ ...btnGhost, borderColor: "#7f1d1d", color: "#fca5a5" }} onClick={() => deleteCompany(c.id, c.name)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <h2 style={h2}>Licensees ({licensees.length})</h2>
        <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>
          The <b>name</b> must be the exact email of an existing user account — access is joined via <code>profiles.email = licensees.name</code>.
        </div>
        <form onSubmit={createLicensee} style={{ marginBottom: 14 }}>
          <input style={{ ...input, width: 320 }} placeholder="user@agency.org" value={licName} onChange={e => setLicName(e.target.value)} />
          <button style={btn} type="submit">+ Register licensee</button>
        </form>
        <table style={table}>
          <thead><tr><th style={th}>Email / Name</th><th style={th}>User exists?</th><th style={th}>Licensee ID</th><th style={th}></th></tr></thead>
          <tbody>
            {licensees.map(l => {
              const p = profileByEmail[l.name];
              return (
                <tr key={l.id}>
                  <td style={td}>{l.name}</td>
                  <td style={td}>{p ? <span style={{ color: "#4ade80" }}>✓ {p.is_super_admin ? "super admin" : (p.role ?? "user")}</span> : <span style={{ color: "#f87171" }}>✗ no matching profile</span>}</td>
                  <td style={{ ...td, fontFamily: "monospace", color: "#64748b", fontSize: 11 }}>{l.id}</td>
                  <td style={td}><button style={btnGhost} onClick={() => deleteLicensee(l.id)}>Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <h2 style={h2}>Assignments ({assigns.length})</h2>
        <form onSubmit={assign} style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select style={input} value={assignLic} onChange={e => setAssignLic(e.target.value)}>
            <option value="">— licensee —</option>
            {licensees.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select style={input} value={assignCo} onChange={e => setAssignCo(e.target.value)}>
            <option value="">— company —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={input} value={assignRole} onChange={e => setAssignRole(e.target.value)}>
            <option value="admin">admin</option>
            <option value="editor">editor</option>
            <option value="read_only">read_only</option>
          </select>
          <button style={btn} type="submit">Assign</button>
        </form>
        <table style={table}>
          <thead><tr><th style={th}>Licensee</th><th style={th}>Company</th><th style={th}>Role</th><th style={th}></th></tr></thead>
          <tbody>
            {assigns.map(a => {
              const lic = licensees.find(l => l.id === a.licensee_id);
              const co  = companies.find(c => c.id === a.company_id);
              return (
                <tr key={a.licensee_id + a.company_id}>
                  <td style={td}>{lic?.name ?? a.licensee_id}</td>
                  <td style={td}>{co?.name ?? a.company_id}</td>
                  <td style={td}>{a.role}</td>
                  <td style={td}><button style={btnGhost} onClick={() => unassign(a.licensee_id, a.company_id)}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
