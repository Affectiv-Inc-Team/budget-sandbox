import { useState } from "react";
import { supabase } from "../supabase.js";
import { LOGO } from "../assets/logo.js";
import posthog from "../lib/posthog.js";

export default function LoginPage() {
  const [mode, setMode] = useState("signin"); // "signin" | "reset" | "sent"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      posthog.capture('user_sign_in_failed', { error_message: authError.message });
    } else {
      const user = data?.user;
      if (user) {
        posthog.identify(user.id, { email: user.email });
        posthog.capture('user_signed_in', { login_method: 'email' });
      }
    }
    // On success, App.jsx's onAuthStateChange fires and re-renders to ToolPage
  }

  async function handleReset(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setInfo("Check your email for a secure link to set your password. It works for both first-time setup and password resets.");
      posthog.capture('password_reset_requested');
    }
  }

  const isReset = mode === "reset";

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <a href="/" aria-label="Intrinsic home"><img src={LOGO} alt="Intrinsic" className="login-logo" style={{ cursor: "pointer" }} /></a>
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">
            {isReset ? "Set up or reset your password" : "Financial Model Builder"}
          </div>
          <div className="login-divider" />
        </div>

        <form className="login-form" onSubmit={isReset ? handleReset : handleSignIn}>
          <div className="login-field">
            <label className="login-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="login-input"
              type="email"
              placeholder="you@agency.org"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {!isReset && (
            <div className="login-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label className="login-label" htmlFor="password">Password</label>
                <button
                  type="button"
                  onClick={() => { setMode("reset"); setError(null); setInfo(null); }}
                  style={{
                    background: "none", border: "none", color: "#0E6B78",
                    fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
                  }}
                >
                  Forgot?
                </button>
              </div>
              <input
                id="password"
                className="login-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          )}

          {error && (
            <div className="login-error">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="login-error" style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }}>
              <span>✓</span>
              <span>{info}</span>
            </div>
          )}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading
              ? (isReset ? "Sending…" : "Signing in…")
              : (isReset ? "Email me a link" : "Sign In")}
          </button>
        </form>

        <div style={{
          marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0",
          fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.5,
        }}>
          {isReset ? (
            <>
              Remembered it?{" "}
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                style={{ background: "none", border: "none", color: "#0E6B78", fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <strong style={{ color: "#0f172a" }}>First time here?</strong> Your admin added your email to a
              company. Click{" "}
              <button
                type="button"
                onClick={() => { setMode("reset"); setError(null); setInfo(null); }}
                style={{ background: "none", border: "none", color: "#0E6B78", fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                Email me a setup link
              </button>{" "}
              to create your password.
            </>
          )}
        </div>

        <p className="login-footer">Idaho HCBS Operations · Intrinsic Inc</p>
      </div>
    </div>
  );
}
