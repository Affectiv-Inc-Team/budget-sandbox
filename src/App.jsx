import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase, getProfile } from "./supabase.js";
import { ROLES, ROLE_LABELS, canSeeReferrals } from "./lib/access.js";
import LoginPage from "./pages/LoginPage.jsx";
import ToolPage from "./pages/ToolPage.jsx";
import posthog from "./lib/posthog.js";
import ReferralTracker from "./pages/ReferralTracker.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import FeaturesPage from "./pages/FeaturesPage.jsx";

const IS_DEV = import.meta.env.DEV;

function deriveRole(profile) {
  if (!profile) return ROLES.CEO;             // fallback until Track B
  if (profile.is_super_admin) return ROLES.OWNER;
  return profile.role ?? ROLES.CEO;           // role col added in Track B
}

// Authenticated app shell — preserved verbatim from the prior App() return:
// the tool/referrals switch, the fixed "Referral Tracker →" button, and the
// IS_DEV role selector. Only the surrounding routing has changed.
function AuthedApp({ effectiveRole, derivedRole, module, setModule, devRole, setDevRole, onSignOut }) {
  const showReferrals = canSeeReferrals(effectiveRole) && module === "referrals";

  return (
    <>
      {showReferrals ? (
        <ReferralTracker
          userRole={effectiveRole}
          onSignOut={onSignOut}
          onSwitchModule={() => setModule("tool")}
        />
      ) : (
        <ToolPage userRole={effectiveRole} onSignOut={onSignOut} />
      )}

      {canSeeReferrals(effectiveRole) && module === "tool" && (
        <button
          type="button"
          onClick={() => setModule("referrals")}
          style={{
            position: "fixed", bottom: 16, left: 16, zIndex: 9999,
            padding: "9px 14px", borderRadius: 8, border: "none",
            background: "#0E6B78", color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: "pointer", letterSpacing: 0.5, fontFamily: "'DM Mono',monospace",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}
        >
          Referral Tracker →
        </button>
      )}

      {IS_DEV && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
          background: '#1e293b', borderRadius: 8, padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <span style={{
            color: '#94a3b8', fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 1,
            fontFamily: 'monospace',
          }}>
            Dev Role
          </span>
          <select
            value={devRole ?? ''}
            onChange={e => setDevRole(e.target.value || null)}
            style={{
              background: '#334155', color: '#f1f5f9',
              border: '1px solid #475569', borderRadius: 4,
              padding: '3px 6px', fontSize: 11, cursor: 'pointer',
            }}
          >
            <option value="">← derived ({ROLE_LABELS[derivedRole]})</option>
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);
  const [devRole, setDevRole] = useState(null);       // null = use derived role
  const [module, setModule] = useState("tool");        // 'tool' | 'referrals'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) getProfile().then(setProfile);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        getProfile().then(setProfile);
        if (event === 'SIGNED_IN') {
          posthog.identify(session.user.id, { email: session.user.email });
        }
      } else {
        setProfile(null);
        posthog.reset();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const derivedRole   = deriveRole(profile);
  const effectiveRole = IS_DEV && devRole ? devRole : derivedRole;
  const isAuthenticated = !!session;

  // On sign-out, onAuthStateChange fires, session becomes null, and the
  // /app route below redirects back to /login.
  const handleSignOut = () => {
    posthog.capture('user_signed_out');
    supabase.auth.signOut();
  };

  // Protected /app route: wait while auth is loading, otherwise show the tool
  // or bounce to /login. Public pages render immediately and never block on this.
  const appElement =
    session === undefined ? null
      : session ? (
          <AuthedApp
            effectiveRole={effectiveRole}
            derivedRole={derivedRole}
            module={module}
            setModule={setModule}
            devRole={devRole}
            setDevRole={setDevRole}
            onSignOut={handleSignOut}
          />
        )
      : <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route path="/" element={<LandingPage isAuthenticated={isAuthenticated} />} />
      <Route path="/features" element={<FeaturesPage isAuthenticated={isAuthenticated} />} />
      <Route path="/login" element={session ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app" element={appElement} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
