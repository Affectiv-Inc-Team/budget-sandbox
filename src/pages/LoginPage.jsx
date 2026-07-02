import { useState } from "react";
import { supabase } from "../supabase.js";
import { LOGO } from "../assets/logo.js";
import posthog from "../lib/posthog.js";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

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

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <a href="/" aria-label="Intrinsic home"><img src={LOGO} alt="Intrinsic" className="login-logo" style={{ cursor: "pointer" }} /></a>
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">Financial Model Builder</div>
          <div className="login-divider" />
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
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

          <div className="login-field">
            <label className="login-label" htmlFor="password">Password</label>
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

          {error && (
            <div className="login-error">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="login-footer">Idaho HCBS Operations · Intrinsic Inc</p>
      </div>
    </div>
  );
}
