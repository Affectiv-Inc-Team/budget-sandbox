import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../supabase.js";
import { LOGO } from "../assets/logo.js";
import posthog from "../lib/posthog.js";

// Only allow same-origin relative paths for post-login navigation, so the
// `?next=` parameter can't be turned into an open redirect to another origin.
function safeNext(raw) {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const setupType = searchParams.get("setup");
  const initialMode = setupType === "invite" || setupType === "recovery" ? "code" : "signin";
  const [mode, setMode] = useState(initialMode); // "signin" | "reset" | "sent" | "code"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeType, setCodeType] = useState(setupType === "invite" ? "invite" : "recovery");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    // Clear any prior session in this browser before authenticating a new user.
    // Prevents cases where an already-signed-in account (e.g. an inviter) keeps
    // its session tokens in localStorage and the app renders as the wrong user
    // after a new sign-in — which was skipping onboarding for invitees.
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* no-op */ }

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

    const normalizedEmail = email.trim().toLowerCase();
    const { data: linkData, error: linkError } = await supabase.functions.invoke("request-setup-link", {
      body: {
        email: normalizedEmail,
        redirectTo: `${window.location.origin}/reset-password`,
      },
    });
    setLoading(false);
    if (linkError) {
      setError("We couldn't send that link. Please try again or contact your admin.");
      posthog.captureException(linkError, { endpoint: 'request-setup-link' });
    } else if (linkData?.ok === false && linkData?.reason === "not_provisioned") {
      setError("That email hasn't been added to a company yet. Ask your Intrinsic admin to add the exact email, then try again.");
      posthog.capture('password_reset_unprovisioned');
    } else {
      posthog.capture('password_reset_requested');
      setEmail(normalizedEmail);
      setCodeType(linkData?.emailAction === "invite" ? "invite" : "recovery");
      setMode("sent");
    }
  }

  async function handleCode(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.replace(/\s/g, "");
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: codeType,
    });
    setLoading(false);
    if (verifyError) {
      setError("That code is invalid or has expired. Request a new code and try again.");
      posthog.capture('password_reset_code_failed', { code_type: codeType });
      return;
    }
    posthog.capture('password_reset_code_verified', { code_type: codeType });
    window.location.assign("/reset-password");
  }

  const isReset = mode === "reset";
  const isSent = mode === "sent";
  const isCode = mode === "code";

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <a href="/" aria-label="Intrinsic home"><img src={LOGO} alt="Intrinsic" className="login-logo" style={{ cursor: "pointer" }} /></a>
          <h1 className="login-wordmark">Intrinsic</h1>
          <div className="login-subtitle">
            {isSent ? "Check your email" : isCode ? "Enter your one-time code" : isReset ? "Set up or reset your password" : "Financial Model Builder"}
          </div>
          <div className="login-divider" />
        </div>


        {isSent ? (
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 40, lineHeight: 1, marginBottom: 12,
            }} aria-hidden>✉️</div>
            <p style={{ color: "#0f172a", fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>
              We sent a one-time code to
            </p>
            <p style={{
              color: "#0E6B78", fontSize: 14, fontWeight: 700,
              wordBreak: "break-all", margin: "0 0 16px",
            }}>
              {email}
            </p>
            <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5, margin: "0 0 20px" }}>
              Enter the one-time code from the message to set your password.
              The code expires in about an hour. If it doesn't arrive within a
              couple of minutes, check your junk or quarantine folder.
            </p>
            <button
              type="button"
              className="login-btn"
              onClick={() => {
                setMode("code");
                setPassword("");
                setError(null);
                setInfo(null);
              }}
            >
              Enter my code
            </button>
            <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
              Wrong email?{" "}
              <button
                type="button"
                onClick={() => { setMode("reset"); setError(null); setInfo(null); }}
                style={{ background: "none", border: "none", color: "#0E6B78", fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                Try a different address
              </button>
            </div>
          </div>
        ) : (
          <>
            <form className="login-form" onSubmit={isCode ? handleCode : isReset ? handleReset : handleSignIn}>
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

              {isCode && (
                <div className="login-field">
                  <label className="login-label" htmlFor="code">One-time code</label>
                  <input
                    id="code"
                    className="login-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    required
                  />
                </div>
              )}

              {!isReset && !isCode && (
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
                  ? (isCode ? "Verifying…" : isReset ? "Sending…" : "Signing in…")
                  : (isCode ? "Verify code" : isReset ? "Email me a code" : "Sign In")}
              </button>
            </form>

            <div style={{
              marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0",
              fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.5,
            }}>
              {isReset || isCode ? (
                <>
                  Remembered it?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("signin"); setError(null); setInfo(null); setCode(""); }}
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
          </>
        )}

        <p className="login-footer">Idaho HCBS Operations · Intrinsic Inc</p>
      </div>
    </div>
  );
}
