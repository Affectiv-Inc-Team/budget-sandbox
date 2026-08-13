import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase, getProfile } from "./supabase.js";
import { ROLES, ROLE_LABELS, canSeeReferrals } from "./lib/access.js";
import { clearLocalProgress } from "./lib/onboarding.js";

import LoginPage from "./pages/LoginPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import ToolPage from "./pages/ToolPage.jsx";
import posthog from "./lib/posthog.js";
import ReferralTracker from "./pages/ReferralTracker.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import FeaturesPage from "./pages/FeaturesPage.jsx";
import AdminPanel from "./pages/AdminPanel.jsx";
import TeamPanel from "./pages/TeamPanel.jsx";
import OAuthConsentPage from "./pages/OAuthConsentPage.jsx";
import { useNavigate } from "react-router-dom";

const IS_DEV = import.meta.env.DEV;

function deriveRole(profile) {
  if (!profile) return ROLES.CEO;             // fallback until Track B
  if (profile.is_super_admin) return ROLES.OWNER;
  return profile.role ?? ROLES.CEO;           // role col added in Track B
}

// Authenticated app shell — preserved verbatim from the prior App() return:
// the tool/referrals switch, the fixed "Referral Tracker →" button, and the
// IS_DEV role selector. Only the surrounding routing has changed.
function AuthedApp({ effectiveRole, derivedRole, userEmail, module, setModule, devRole, setDevRole, onSignOut, isSuperAdmin, profile, onProfileRefresh }) {
  const navigate = useNavigate();
  const showReferrals = canSeeReferrals(effectiveRole) && module === "referrals";

  return (
    <>
      {showReferrals ? (
        <ReferralTracker
          userRole={effectiveRole}
          onSignOut={onSignOut}
          onSwitchModule={() => { posthog.capture('module_switched', { to: 'tool' }); setModule("tool"); }}
        />
      ) : (
        <ToolPage userRole={effectiveRole} userEmail={userEmail} onSignOut={onSignOut} profile={profile} onProfileRefresh={onProfileRefresh} />
      )}

      {canSeeReferrals(effectiveRole) && module === "tool" && (
        <button
          type="button"
          onClick={() => { posthog.capture('module_switched', { to: 'referrals' }); setModule("referrals"); }}
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

      {isSuperAdmin && (
        <button
          type="button"
          onClick={() => navigate('/admin')}
          style={{
            position: "fixed", bottom: 16, left: canSeeReferrals(effectiveRole) && module === "tool" ? 180 : 16,
            zIndex: 9999, padding: "9px 14px", borderRadius: 8, border: "none",
            background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: "pointer", letterSpacing: 0.5, fontFamily: "'DM Mono',monospace",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}
        >
          Admin Panel →
        </button>
      )}

      <button
        type="button"
        onClick={() => navigate('/team')}
        style={{
          position: "fixed", bottom: 16,
          left: (canSeeReferrals(effectiveRole) && module === "tool" ? 180 : 16) + (isSuperAdmin ? 140 : 0),
          zIndex: 9999, padding: "9px 14px", borderRadius: 8, border: "none",
          background: "#0E6B78", color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", letterSpacing: 0.5, fontFamily: "'DM Mono',monospace",
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        }}
      >
        Team →
      </button>


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
          <button
            type="button"
            onClick={async () => {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) return;
              const { error } = await supabase
                .from("profiles")
                .update({ onboarding_completed_at: null })
                .eq("id", session.user.id);
              if (error) { console.error("[onboarding] reset failed", error); return; }
              clearLocalProgress(session.user.id);
              window.location.reload();
            }}
            title="Clear onboarding_completed_at and restart the guided tour"
            style={{
              background: '#334155', color: '#f1f5f9',
              border: '1px solid #475569', borderRadius: 4,
              padding: '3px 8px', fontSize: 11, cursor: 'pointer',
            }}
          >
            Restart tour
          </button>

        </div>
      )}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  // undefined = still loading; null = signed out (no profile to have).
  // Onboarding needs to tell "still loading" apart from "loaded, no flag set"
  // so ToolPage doesn't flash onboarding UI for an already-onboarded user
  // while getProfile() is still in flight.
  const [profile, setProfile] = useState(undefined);
  const [devRole, setDevRole] = useState(null);       // null = use derived role
  const [module, setModule] = useState("tool");        // 'tool' | 'referrals'

  const refreshProfile = () => getProfile().then(setProfile);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) refreshProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        refreshProfile();
        // INITIAL_SESSION covers returning visitors (page refresh with a live
        // Supabase session) — supabase-js emits it instead of SIGNED_IN on
        // restore. identify() with an unchanged distinct_id is a no-op.
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          posthog.identify(session.user.id, { email: session.user.email });
        }
      } else {
        setProfile(null);
        posthog.reset();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Manual pageview capture on route change (capture_pageview is off in posthog.js
  // so we control exactly what is sent). Gives replays/analytics navigation breadcrumbs.
  const location = useLocation();
  useEffect(() => {
    posthog.capture('$pageview', { path: location.pathname });
  }, [location.pathname]);

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
  const isSuperAdmin = !!profile?.is_super_admin;

  // An admin-issued temporary password flags the account; every protected route
  // funnels the user to /reset-password until they pick their own password.
  const mustChangePassword = !!session?.user?.user_metadata?.must_change_password;
  const forcedReset = mustChangePassword ? <Navigate to="/reset-password" replace /> : null;

  const appElement =
    session === undefined ? null
      : forcedReset ? forcedReset
      : session ? (
          <AuthedApp
            effectiveRole={effectiveRole}
            derivedRole={derivedRole}
            userEmail={profile?.email ?? session.user?.email}
            module={module}
            setModule={setModule}
            devRole={devRole}
            setDevRole={setDevRole}
            onSignOut={handleSignOut}
            isSuperAdmin={isSuperAdmin}
            profile={profile}
            onProfileRefresh={refreshProfile}
          />
        )
      : <Navigate to="/login" replace />;

  const adminElement =
    session === undefined ? null
      : !session ? <Navigate to="/login" replace />
      : forcedReset ? forcedReset
      : !profile ? null
      : isSuperAdmin ? <AdminPanel onExit={() => window.location.assign('/app')} />
      : <Navigate to="/app" replace />;

  // session starts `undefined` (still loading, e.g. restoring from a hard
  // reload/direct link) before resolving to null|Session. Treating that
  // loading tick as "no session" — as this route used to — sent a fresh
  // /team load to /login and then, once the real session arrived a moment
  // later, /login's own redirect bounced it straight through to /app: a
  // direct link or refresh on /team never actually landed on /team.
  const teamElement =
    session === undefined ? null
      : !session ? <Navigate to="/login" replace />
      : forcedReset ? forcedReset
      : !profile ? null
      : <TeamPanel userRole={effectiveRole} />;

  // When an OAuth consent flow (or any other protected page) sends the user
  // through /login?next=..., honor that on successful sign-in instead of
  // always dumping them at /app.
  const loginNext = (() => {
    const raw = new URLSearchParams(location.search).get("next");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/app";
    return raw;
  })();

  return (
    <Routes>
      <Route path="/" element={<LandingPage isAuthenticated={isAuthenticated} />} />
      <Route path="/features" element={<FeaturesPage isAuthenticated={isAuthenticated} />} />
      <Route path="/login" element={session ? <Navigate to={loginNext} replace /> : <LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/app" element={appElement} />
      <Route path="/admin" element={adminElement} />
      <Route path="/team" element={teamElement} />
      <Route path="/.lovable/oauth/consent" element={<OAuthConsentPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
