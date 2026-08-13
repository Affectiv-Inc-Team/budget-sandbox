import { useState } from "react";
import { adminResetPassword } from "../supabase.js";

const btn = {
  background: "transparent",
  border: "1px solid #334155",
  color: "#cbd5e1",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
  minHeight: 32,
};

const menu = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 4px)",
  zIndex: 40,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: 8,
  minWidth: 250,
  boxShadow: "0 12px 30px rgba(0,0,0,.45)",
  textAlign: "left",
};

const item = { ...btn, display: "block", width: "100%", marginBottom: 6, textAlign: "left" };

/**
 * Admin action: reset a member's password, either by emailing them a reset
 * link/code or by generating a one-time temporary password shown on screen.
 * Authorization is enforced server-side (super admin, or company admin of a
 * company the person belongs to).
 */
export default function ResetPasswordControl({ email, companyId = null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [temp, setTemp] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  async function run(mode) {
    setBusy(mode);
    setErr(null);
    setMsg(null);
    setTemp(null);
    const res = await adminResetPassword({ email, mode, companyId });
    setBusy(null);
    if (!res.ok) return setErr(res.error);
    if (mode === "temp") setTemp(res.tempPassword);
    else setMsg(`Reset email sent to ${email}.`);
  }

  function close() {
    setOpen(false);
    setTemp(null);
    setMsg(null);
    setErr(null);
  }

  return (
    <span style={{ position: "relative", display: "inline-block", marginRight: 6 }}>
      <button
        style={btn}
        title="Reset this person's password"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Reset password
      </button>

      {open && (
        <div style={menu} role="dialog" aria-label={`Reset password for ${email}`}>
          <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 8, wordBreak: "break-all" }}>
            {email}
          </div>

          <button style={item} disabled={busy} onClick={() => run("email")}>
            {busy === "email" ? "Sending…" : "Email them a reset code"}
          </button>
          <button style={item} disabled={busy} onClick={() => run("temp")}>
            {busy === "temp" ? "Generating…" : "Generate a temporary password"}
          </button>

          {temp && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                background: "#052e16",
                border: "1px solid #14532d",
                borderRadius: 6,
              }}
            >
              <div style={{ color: "#86efac", fontSize: 11, marginBottom: 4 }}>
                One-time password — copy it now, it won’t be shown again. They must change it at
                next sign-in.
              </div>
              <code style={{ color: "#f8fafc", fontSize: 14, letterSpacing: 0.5 }}>{temp}</code>
              <div>
                <button
                  style={{ ...btn, marginTop: 6 }}
                  onClick={() => navigator.clipboard?.writeText(temp)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {msg && <div style={{ color: "#4ade80", fontSize: 12, marginTop: 6 }}>{msg}</div>}
          {err && <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 6 }}>{err}</div>}

          <button style={{ ...item, marginTop: 8, marginBottom: 0 }} onClick={close}>
            Close
          </button>
        </div>
      )}
    </span>
  );
}
