import { useState, useEffect, useMemo } from "react";
import { loadConfig, saveConfig, getMyCompanyScopes, getProvenance, completeOnboarding } from "../supabase.js";
import { firstPendingStep, loadLocalProgress, saveLocalProgress } from "../lib/onboarding.js";
import FinancialTool from "./FinancialTool.jsx";
import OnboardingIntro from "./onboarding/OnboardingIntro.jsx";
import AwaitingCompany from "./onboarding/AwaitingCompany.jsx";

// Pre-dashboard onboarding steps this component owns directly: welcome,
// awaiting_company, access_granted. Everything past access_granted (tour,
// first_line, line_result, invite_team, done) isn't built yet — once the
// step machine resolves past access_granted, ToolPage falls through to the
// plain dashboard. Later PRs intercept those steps as overlays *inside*
// FinancialTool instead of adding more branches here.
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

  async function handleSkip() {
    setSessionSkipped(true);
    await completeOnboarding();
    onProfileRefresh?.();
  }

  // profile undefined = App.jsx's getProfile() hasn't resolved yet. Waiting
  // on it (rather than treating undefined as "no onboarding flag") avoids
  // flashing onboarding UI at an already-onboarded user on every load.
  if (initialConfig === undefined || profile === undefined) return null;

  // Onboarding already finished, but there's currently no company (e.g. an
  // invite was revoked after initial setup) — a plain guard, not a step in
  // the onboarding sequence.
  if (onboardingDone && !initialConfig) {
    return <AwaitingCompany onCheckAgain={loadCompanyState} />;
  }

  if (!onboardingDone) {
    if (!ctx || onboardingStep === undefined) return null; // still resolving provenance/resume

    if (onboardingStep === "awaiting_company") {
      return <AwaitingCompany onCheckAgain={loadCompanyState} onSkip={handleSkip} />;
    }

    if (PRE_DASHBOARD_STEPS.has(onboardingStep)) {
      return (
        <OnboardingIntro
          step={onboardingStep}
          role={userRole}
          provenance={ctx.provenance}
          invitedByEmail={provenance?.invitedByEmail}
          onContinue={advance}
          onSkip={handleSkip}
        />
      );
    }
    // Resolved past access_granted (tour/first_line/…) — not built yet;
    // fall through to the dashboard below.
  }

  return (
    <FinancialTool
      initialConfig={initialConfig}
      onSave={saveConfig}
      userRole={userRole}
      userEmail={userEmail}
      onSignOut={onSignOut}
      memberScopes={memberScopes}
    />
  );
}
