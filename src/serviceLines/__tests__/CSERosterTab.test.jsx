import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CSERosterTab,
  defaultCSEConfig,
  mkCSESpecialist,
  mkCSEParticipant,
} from "../cse.jsx";
import { ROLES } from "../../lib/access.js";

// ──────────────────────────────────────────────────────────────────────
// [Vocational Services] Remove bottom four phase tabs entirely
//
// Vocational Services (CSE) uses a billing-code model, not a phase model.
// These tests verify that no phase selector, phase label, or phase option
// appears anywhere in the CSERosterTab — the tab that previously would
// have surfaced phase UI if phases had been added to this module.
// ──────────────────────────────────────────────────────────────────────

function configWithParticipant() {
  const specialist  = mkCSESpecialist("Alice", 20);
  const participant = mkCSEParticipant("Bob");
  return {
    ...defaultCSEConfig(),
    specialists: [{ ...specialist, participants: [participant] }],
  };
}

describe("[Vocational Services] Phase tabs removed", () => {
  it("renders the empty state without any phase-related UI", () => {
    render(
      <CSERosterTab config={defaultCSEConfig()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    expect(screen.getByText(/no specialists yet/i)).toBeDefined();
    // No phase title attribute (present in Children's DDA participant rows)
    expect(screen.queryByTitle(/service phase/i)).toBeNull();
  });

  it("CSERosterTab with a participant has no phase selector", () => {
    render(
      <CSERosterTab config={configWithParticipant()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    // Children's DDA uses title="Service phase" on the phase <select>
    expect(screen.queryByTitle(/service phase/i)).toBeNull();
  });

  it("participant row labels include 'Billing code' but no 'Phase' column", () => {
    render(
      <CSERosterTab config={configWithParticipant()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    expect(screen.getAllByText("Billing code").length).toBeGreaterThan(0);
    // Exact text "Phase" must not appear as a column header
    expect(screen.queryByText(/^Phase$/i)).toBeNull();
  });

  it("no phase option values appear in any select (initial / stabilization / long_term)", () => {
    render(
      <CSERosterTab config={configWithParticipant()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    // These are the DDA_PHASE_LABELS values that must not appear as select options
    expect(screen.queryByRole("option", { name: /^Initial$/i })).toBeNull();
    expect(screen.queryByRole("option", { name: /stabilization/i })).toBeNull();
    expect(screen.queryByRole("option", { name: /long.term/i })).toBeNull();
  });

  it("the billing-code selector is present with the four VR/Medicaid codes", () => {
    render(
      <CSERosterTab config={configWithParticipant()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    // Each billing code appears as a select option (billing code, not a phase)
    expect(screen.getByRole("option", { name: /H2023/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /EES/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /CBWE/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /VOC EVAL/i })).toBeDefined();
  });

  it("read-only roles still see no phase UI", () => {
    render(
      <CSERosterTab config={configWithParticipant()} onUpdate={vi.fn()} userRole={ROLES.HOUSE_LEAD} />
    );
    expect(screen.queryByTitle(/service phase/i)).toBeNull();
    expect(screen.queryByText(/^Phase$/i)).toBeNull();
  });
});
