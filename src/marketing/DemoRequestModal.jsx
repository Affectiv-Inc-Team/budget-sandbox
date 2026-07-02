import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase.js";
import posthog from "../lib/posthog.js";

/**
 * Smooth, modern modal contact form for demo requests.
 * Fades + lifts in, traps focus, closes on Esc / backdrop / X.
 * Persists to public.demo_requests (RLS allows anon insert with basic validation).
 */
export default function DemoRequestModal({ open, onClose, page = "home" }) {
  const [mounted, setMounted]   = useState(false);
  const [visible, setVisible]   = useState(false);   // drives .is-open transition
  const [status, setStatus]     = useState("idle");  // idle | sending | sent | error
  const [errMsg, setErrMsg]     = useState("");
  const [form, setForm]         = useState({ name: "", email: "", company: "", role: "", message: "" });
  const firstFieldRef           = useRef(null);

  // Mount → next frame → add .is-open (enables CSS transition)
  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  // Body scroll lock + Esc + autofocus
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = e => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [mounted, onClose]);

  // Reset form after close animation completes
  useEffect(() => {
    if (!open && status === "sent") {
      const t = setTimeout(() => {
        setStatus("idle");
        setForm({ name: "", email: "", company: "", role: "", message: "" });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [open, status]);

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErrMsg("");
    const name  = form.name.trim();
    const email = form.email.trim();
    if (!name || !email) { setErrMsg("Please share your name and email."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErrMsg("That email address looks off."); return; }

    setStatus("sending");
    const { error } = await supabase.from("demo_requests").insert({
      name, email,
      company: form.company.trim() || null,
      role:    form.role.trim()    || null,
      message: form.message.trim() || null,
      source_page: page,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
    if (error) {
      setStatus("error");
      setErrMsg(error.message || "Something went wrong. Please try again.");
      return;
    }
    posthog.capture("demo_request_submitted", { page });
    setStatus("sent");
  }

  if (!mounted) return null;

  return (
    <div
      className={"drm-backdrop" + (visible ? " is-open" : "")}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drm-title"
    >
      <div className={"drm-panel" + (visible ? " is-open" : "")}>
        <button className="drm-close" aria-label="Close" onClick={onClose}>×</button>

        {status === "sent" ? (
          <div className="drm-success">
            <div className="drm-success-mark" aria-hidden>✓</div>
            <h2 id="drm-title" className="drm-title">Thanks — we'll be in touch.</h2>
            <p className="drm-sub">A member of the Intrinsic team will reach out within one business day to schedule your walkthrough.</p>
            <button className="mk-btn mk-btn-primary mk-btn-lg drm-cta" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <div className="drm-head">
              <div className="drm-kicker">Request a Demo</div>
              <h2 id="drm-title" className="drm-title">See Intrinsic in action.</h2>
              <p className="drm-sub">Tell us a bit about your agency and we'll set up a personalized walkthrough of the financial modeling tool.</p>
            </div>

            <form className="drm-form" onSubmit={submit} noValidate>
              <div className="drm-row">
                <label className="drm-field">
                  <span className="drm-label">Name</span>
                  <input ref={firstFieldRef} className="drm-input" value={form.name}
                    onChange={upd("name")} required maxLength={120} autoComplete="name" />
                </label>
                <label className="drm-field">
                  <span className="drm-label">Work email</span>
                  <input className="drm-input" type="email" value={form.email}
                    onChange={upd("email")} required maxLength={254} autoComplete="email" />
                </label>
              </div>
              <div className="drm-row">
                <label className="drm-field">
                  <span className="drm-label">Agency / company</span>
                  <input className="drm-input" value={form.company} onChange={upd("company")} maxLength={200} autoComplete="organization" />
                </label>
                <label className="drm-field">
                  <span className="drm-label">Your role</span>
                  <input className="drm-input" value={form.role} onChange={upd("role")} maxLength={120} placeholder="Owner, CFO, Program Director…" />
                </label>
              </div>
              <label className="drm-field">
                <span className="drm-label">What would you like to see? <span className="drm-optional">(optional)</span></span>
                <textarea className="drm-input drm-textarea" rows={4} value={form.message}
                  onChange={upd("message")} maxLength={2000}
                  placeholder="Service lines you model, questions about rates, integrations you'd like…" />
              </label>

              {errMsg && <div className="drm-error" role="alert">{errMsg}</div>}

              <div className="drm-actions">
                <button type="button" className="mk-btn mk-btn-ghost" onClick={onClose}>Cancel</button>
                <button type="submit" className="mk-btn mk-btn-primary mk-btn-lg" disabled={status === "sending"}>
                  {status === "sending" ? "Sending…" : "Request Demo"}
                </button>
              </div>
              <div className="drm-fineprint">We'll only use this to schedule your demo. No marketing spam.</div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
