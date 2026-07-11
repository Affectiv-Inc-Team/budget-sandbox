import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { firstPendingStep } from "../../lib/onboarding.js";
import { SERVICE_LINE_DEFS } from "../../serviceLines/types.js";
import GuidedTour from "./GuidedTour.jsx";
import FirstServiceLinePicker from "./FirstServiceLinePicker.jsx";
import FirstLineResult from "./FirstLineResult.jsx";
import InviteTeamStep from "./InviteTeamStep.jsx";
import OnboardingDone from "./OnboardingDone.jsx";

// Maps a service line TYPE to the `id` FinancialTool's calc function stamps
// on the matching co.slBreakdown entry (see the slBreakdown array literal in
// FinancialTool.jsx) — the two aren't the same string, so this can't be
// derived automatically. Was missing SCHOOL_BASED despite that type already
// being 'active' (see serviceLines/types.js) and already producing a
// slBreakdown entry ('school') — line_result silently showed $0/$0 for a
// School-Based first line as a result. VOC_SERVICES and CHILDRENS_DDA are
// also 'active' but don't produce a slBreakdown entry AT ALL yet (a gap in
// FinancialTool.jsx's calc function, not here) — adding them to this map
// alone wouldn't fix their first-line celebration screen.
const SL_BREAKDOWN_ID = {
  RES_HAB_DAILY: "daily",
  RES_HAB_HOURLY: "hourly",
  TSC: "tsc",
  SCHOOL_BASED: "school",
};

// In-dashboard onboarding steps (tour, first_line, line_result, invite_team,
// done), mounted inside FinancialTool once ToolPage resolves the resumed
// step past access_granted. Owns its own step progression: the tour->next
// and line_result->next transitions are genuinely ambiguous (depend on role/
// provenance/whether a line already exists), so those reuse firstPendingStep
// from the same state machine ToolPage uses; first_line->line_result and
// invite_team->done are structurally fixed and don't need it.
export default function OnboardingOverlay({
  initialStep, role, provenance, multiCompany, visibleSLsCount, co,
  onAddServiceLine, onSave, onStepChange, onComplete, onSkip,
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(initialStep);
  const [addedType, setAddedType] = useState(null);
  const [saveError, setSaveError] = useState(null);

  function ctx(overrides = {}) {
    return {
      role,
      provenance,
      companyCount: 1, // irrelevant past access_granted — awaiting_company never recurs
      selectedCompanySLCount: visibleSLsCount,
      multiCompany,
      firstLineJustCreated: false,
      ...overrides,
    };
  }

  function goTo(next) {
    setStep(next);
    onStepChange?.(next);
  }

  function handleTourFinish() {
    goTo(firstPendingStep(ctx(), "tour"));
  }

  function handlePickLine(type) {
    onAddServiceLine(type);
    setAddedType(type);
    goTo("line_result"); // structurally fixed: picking a line always pays off immediately
  }

  async function handleLineResultContinue() {
    const ok = await onSave?.();
    if (ok === false) {
      // Stay on this screen: setting the error and advancing in the same
      // handler would replace this screen before the error ever painted,
      // silently losing the "save failed" signal. Let the user see it and
      // retry (or leave the tab open and it isn't lost, per handleSave's own
      // FinancialTool-level state) instead of pretending it saved.
      setSaveError("Saving failed — check your connection and try again.");
      return;
    }
    setSaveError(null);
    goTo(firstPendingStep(ctx({ firstLineJustCreated: true }), "line_result"));
  }

  function handleGoToTeam() {
    goTo("done"); // treat opening Team the same as completing this step
    navigate("/team");
  }

  function handleInviteContinue() {
    goTo("done");
  }

  function handleDoneFinish() {
    onComplete?.();
  }

  // The tour is a true spotlight — it draws its own dimmed backdrop with a
  // cutout over the real dashboard and must NOT be wrapped in an opaque
  // full-screen layer. Every other step reuses the login-* full-page look,
  // which assumes it owns the whole viewport; wrapped here in a fixed layer
  // so it actually covers the dashboard mounted underneath it instead of
  // just adding a block in FinancialTool's normal document flow.
  if (step === "tour") {
    // "Skip tour" (matches the prototype's own goToRelative(1)) means skip
    // PAST the tour to whatever's next — the same transition as reaching the
    // last stop and clicking Finish. It is NOT the global "abandon all of
    // onboarding" escape hatch (that's the top-level onSkip prop, offered on
    // the pre-dashboard screens instead) — wiring it there would silently
    // drop a user straight to the dashboard, skipping first_line/invite_team/
    // done without them asking for that.
    return <GuidedTour role={role} multiCompany={multiCompany} onFinish={handleTourFinish} onSkip={handleTourFinish} />;
  }

  const KNOWN_STEPS = new Set(["first_line", "line_result", "invite_team", "done"]);
  if (!KNOWN_STEPS.has(step)) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9997, overflow: "auto" }}>
      {step === "first_line" && <FirstServiceLinePicker onContinue={handlePickLine} />}

      {step === "line_result" && (() => {
        const def = addedType ? SERVICE_LINE_DEFS[addedType] : null;
        const breakdownId = addedType ? SL_BREAKDOWN_ID[addedType] : null;
        const breakdown = co?.slBreakdown?.find((b) => b.id === breakdownId);
        // A just-added line starts with zero coordinators/homes/participants,
        // so rev/labor are genuinely 0 until a roster is configured — this is
        // the real, current P&L snapshot, not a placeholder.
        return (
          <FirstLineResult
            role={role}
            lineLabel={def?.label ?? "Your service line"}
            lineRevenue={breakdown?.rev ?? 0}
            lineLabor={breakdown?.labor ?? 0}
            netMargin={co?.netMargin ?? 0}
            saveError={saveError}
            onContinue={handleLineResultContinue}
          />
        );
      })()}

      {step === "invite_team" && <InviteTeamStep onGoToTeam={handleGoToTeam} onContinue={handleInviteContinue} />}

      {step === "done" && <OnboardingDone role={role} provenance={provenance} onFinish={handleDoneFinish} />}
    </div>
  );
}

export { SL_BREAKDOWN_ID };
