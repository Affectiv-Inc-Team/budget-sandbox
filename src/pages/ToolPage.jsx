import { useState, useEffect, useMemo } from "react";
import { supabase, loadConfig, saveConfig, getMyCompanyScopes, getProvenance, completeOnboarding } from "../supabase.js";
import { firstPendingStep, loadLocalProgress, saveLocalProgress, clearLocalProgress } from "../lib/onboarding.js";

import FinancialTool from "./FinancialTool.jsx";
import OnboardingIntro from "./onboarding/OnboardingIntro.jsx";
import AwaitingCompany from "./onboarding/AwaitingCompany.jsx";

// Pre-dashboard onboarding steps this component renders directly: welcome,
// awaiting_company, access_granted. Everything past access_granted (tour,
// first_line, line_result, invite_team, done) is handed to FinancialTool's
// OnboardingOverlay via the `onboarding` prop instead — it needs the live
// config/handlers (add a service line, save) that only FinancialTool has.
const PRE_DASHBOARD_STEPS = new Set(["welcome", "awaiting_company", "access_granted"]);

export default function ToolPage({ userRole, userEmail, onSignOut, profile, onProfileRefresh }) {
  const [initialConfig, setInitialConfig] = useState(undefined);
  // companyId -> { accessRole, serviceLineScope } for the signed-in member.
  // Loaded alongside the config so FinancialTool never renders an unscoped
  // service-line strip before the scope is known.
  const [memberScopes, setMemberScopes] = useState({});
  const [provenance, setProvenance] = useState(undefined); // undefined = loading
  const [onboardingStep, setOnboardingStep] = useState(undefined); // undefined = loading
  // "Skip setup" completes onboarding server-side, but that round-trip and the
  // profile refresh it triggers aren't instant — track it locally so this
  // render doesn't flash back into onboarding while the flag catches up.
  const [sessionSkipped, setSessionSkipped] = useState(false);

  const uid = profile?.id;
  const onboardingDone = !!profile?.onboarding_completed_at || sessionSkipped;

  async function loadCompanyState() {
    const [cfg, scopes] = await Promise.all([loadConfig(), getMyCompanyScopes()]);
    setInitialConfig(cfg ?? null);
    setMemberScopes(scopes);
  }

  useEffect(() => { loadCompanyState(); }, []);

  // Dev-only escape hatch: `window.__restartOnboarding()` in the browser
  // console clears the server flag + local resume pointer and reloads, so
  // the whole onboarding sequence runs again from Welcome. Not exposed in
  // production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__restartOnboarding = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { console.warn("[onboarding] no session"); return; }
      const { error } = await supabase
        .from("profiles")
        .update({ onboarding_completed_at: null })
        .eq("id", session.user.id);
      if (error) { console.error("[onboarding] reset failed", error); return; }
      clearLocalProgress(session.user.id);
      console.info("[onboarding] reset — reloading");
      window.location.reload();
    };
    return () => { delete window.__restartOnboarding; };
  }, []);


  const configLoaded = initialConfig !== undefined;
  useEffect(() => {
    if (onboardingDone || !configLoaded) return;
    getProvenance(userRole).then(setProvenance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingDone, configLoaded]);

  const ctx = useMemo(() => {
    if (initialConfig === undefined || provenance === undefined) return null;
    const companies = initialConfig?.companies ?? [];
    const company = companies.find((c) => c.id === initialConfig.selectedCompanyId) ?? companies[0] ?? null;
    return {
      role: userRole,
      provenance: provenance?.kind ?? "owner",
      companyCount: companies.length,
      selectedCompanySLCount: company?.serviceLines?.length ?? 0,
      multiCompany: companies.length > 1,
      firstLineJustCreated: false,
    };
  }, [initialConfig, provenance, userRole]);

  // Resume once config + provenance are both known.
  useEffect(() => {
    if (onboardingDone || !ctx) return;
    setOnboardingStep(firstPendingStep(ctx, loadLocalProgress(uid)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingDone, ctx, uid]);

  function advance() {
    if (!ctx) return;
    const next = firstPendingStep(ctx, onboardingStep);
    // firstPendingStep's second arg is the LAST COMPLETED step (see its own
    // signature/tests in lib/onboarding.js) — persist onboardingStep (what
    // was just finished), not `next` (what's about to be entered). Saving
    // `next` stamped a step as already-completed before it actually was,
    // so a refresh mid-flow (e.g. an Owner still waiting on a company) could
    // skip straight past it.
    saveLocalProgress(uid, onboardingStep);
    setOnboardingStep(next);
  }

  // Shared by every "I'm done with onboarding" trigger: the pre-dashboard
  // screens' "Skip setup" link, and OnboardingOverlay's Done screen finishing
  // normally — both mean the same thing server-side, just reached differently.
  //
  // Only clear local resume state once the server write actually succeeds —
  // completeOnboarding() swallows its own errors and resolves false rather
  // than throwing, so clearing first (as this used to) wiped the resume
  // pointer on a failed write too: next session, with the server flag still
  // unset and no resume pointer, onboarding restarted fully from Welcome
  // instead of resuming where it left off.
  async function handleOnboardingComplete() {
    const ok = await completeOnboarding();
    if (ok) {
      setSessionSkipped(true);
      clearLocalProgress(uid);
    }
    onProfileRefresh?.();
  }

  // profile undefined = App.jsx's getProfile() hasn't resolved yet. Waiting
  // on it (rather than treating undefined as "no onboarding flag") avoids
  // flashing onboarding UI at an already-onboarded user on every load.
  if (initialConfig === undefined || profile === undefined) return null;

  // Diagnostic: surfaces the exact reason onboarding was or wasn't shown.
  // One log per render, no extra PII.
  // eslint-disable-next-line no-console
  console.info('[onboarding decision]', {
    email: profile?.email,
    onboardingDone,
    onboarding_completed_at: profile?.onboarding_completed_at ?? null,
    sessionSkipped,
    onboardingStep,
    provenance: provenance?.kind,
    companyCount: initialConfig?.companies?.length ?? 0,
    role: userRole,
  });


  // Onboarding already finished, but there's currently no company (e.g. an
  // invite was revoked after initial setup) — a plain guard, not a step in
  // the onboarding sequence.
  if (onboardingDone && !initialConfig) {
    return <AwaitingCompany onCheckAgain={loadCompanyState} />;
  }

  if (!onboardingDone) {
    if (!ctx || onboardingStep === undefined) return null; // still resolving provenance/resume

    if (onboardingStep === "awaiting_company") {
      return <AwaitingCompany onCheckAgain={loadCompanyState} onSkip={handleOnboardingComplete} />;
    }

    if (PRE_DASHBOARD_STEPS.has(onboardingStep)) {
      return (
        <OnboardingIntro
          step={onboardingStep}
          role={userRole}
          provenance={ctx.provenance}
          invitedByEmail={provenance?.invitedByEmail}
          onContinue={advance}
          onSkip={handleOnboardingComplete}
        />
      );
    }
    // Resolved past access_granted: tour/first_line/line_result/invite_team/
    // done. OnboardingOverlay (inside FinancialTool) owns progression through
    // these from here — onStepChange just persists for resume-after-reload;
    // onboardingStep itself won't change again (ctx/provenance don't refetch
    // after mount), so this prop stays stable for the overlay's whole run.
  }

  return (
    <FinancialTool
      initialConfig={initialConfig}
      onSave={saveConfig}
      userRole={userRole}
      userEmail={userEmail}
      onSignOut={onSignOut}
      memberScopes={memberScopes}
      onboarding={
        !onboardingDone && ctx && onboardingStep && !PRE_DASHBOARD_STEPS.has(onboardingStep)
          ? {
              active: true,
              initialStep: onboardingStep,
              provenance: ctx.provenance,
              onStepChange: (step) => saveLocalProgress(uid, step),
              onComplete: handleOnboardingComplete,
              onSkip: handleOnboardingComplete,
            }
          : undefined
      }
    />
  );
}
