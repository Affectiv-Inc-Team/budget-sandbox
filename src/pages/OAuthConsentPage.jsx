import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase.js";
import { LOGO } from "../assets/logo.js";

// Supabase's beta auth.oauth namespace isn't typed in JS; wrap it so calls
// stay obvious even though we're not using TS.
function authOAuth() {
  return supabase.auth.oauth;
}

export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authorizationId = params.get("authorization_id") ?? "";
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setState({ status: "error", message: "Missing authorization_id in URL." });
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve the FULL consent URL so login/signup return here.
        const next = window.location.pathname + window.location.search;
        navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }

      try {
        const { data, error } = await authOAuth().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setState({ status: "error", message: error.message });
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setState({
          status: "ready",
          details: data,
          email: sess.session.user?.email ?? "",
        });
      } catch (e) {
        if (!active) return;
        setState({ status: "error", message: e?.message ?? "Failed to load authorization." });
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, navigate]);

  async function decide(approve) {
    setBusy(true);
    try {
      const { data, error } = approve
        ? await authOAuth().approveAuthorization(authorizationId)
        : await authOAuth().denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        setState((s) => ({ ...s, status: "error", message: error.message }));
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        setState((s) => ({
          ...s,
          status: "error",
          message: "No redirect returned by the authorization server.",
        }));
        return;
      }
      window.location.href = target;
    } catch (e) {
      setBusy(false);
      setState((s) => ({ ...s, status: "error", message: e?.message ?? "Request failed." }));
    }
  }

  return (
    <div className="login-root">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="login-brand">
          <img src={LOGO} alt="Intrinsic" className="login-logo" />
          <div className="login-wordmark">Intrinsic</div>
          <div className="login-subtitle">Connect an application</div>
          <div className="login-divider" />
        </div>

        {state.status === "loading" && (
          <p style={{ color: "#64748b", fontSize: 14, textAlign: "center" }}>Loading…</p>
        )}

        {state.status === "error" && (
          <>
            <div className="login-error">
              <span>⚠</span>
              <span>{state.message}</span>
            </div>
            <button type="button" className="login-btn" onClick={() => navigate("/app")}>
              Back to Intrinsic
            </button>
          </>
        )}

        {state.status === "ready" && (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>
              Connect {state.details?.client?.name ?? "an application"} to your account
            </h1>
            <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.5, margin: "0 0 12px" }}>
              This will let {state.details?.client?.name ?? "the client"} call Intrinsic's tools
              as you. Company access and role-based permissions still apply.
            </p>
            <div
              style={{
                fontSize: 12,
                color: "#64748b",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "10px 12px",
                margin: "0 0 16px",
              }}
            >
              <div>
                Signed in as <strong style={{ color: "#0f172a" }}>{state.email}</strong>
              </div>
              {state.details?.client?.redirect_uris?.[0] && (
                <div style={{ marginTop: 4, wordBreak: "break-all" }}>
                  Redirects to <code>{state.details.client.redirect_uris[0]}</code>
                </div>
              )}
            </div>

            <button
              type="button"
              className="login-btn"
              disabled={busy}
              onClick={() => decide(true)}
            >
              {busy ? "Working…" : "Approve"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide(false)}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "10px 14px",
                background: "transparent",
                color: "#64748b",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Cancel connection
            </button>
          </>
        )}

        <p className="login-footer">Idaho HCBS Operations · Intrinsic Inc</p>
      </div>
    </div>
  );
}
