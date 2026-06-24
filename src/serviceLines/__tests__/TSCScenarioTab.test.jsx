import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TSCSandboxTab,
  TSCRateScheduleTab,
  defaultTSCConfig,
  mkCoordinator,
  mkParticipant,
} from "../tsc.jsx";
import { ROLES } from "../../lib/access.js";

// Regression coverage for the same undeclared-variable crash class PR #24 fixed.
// TSCScenarioTab (now internal, surfaced via TSCSandboxTab) referenced
// base/scenario/delta, bev, rate-panel state, and canSeeControl — none declared.
// TSCSandboxTab = staffing assumptions + scenario modeling (no rates panel).
// TSCRateScheduleTab = standalone rate editing tab for all 5 TSC billing codes.
function withCoordinator() {
  return {
    ...defaultTSCConfig(),
    coordinators: [
      {
        ...mkCoordinator("Alice", 22),
        id: "c1",
        // unitsPlanDev 42 exercises the G9007 cap progress + ">= 40 near cap" branch.
        participants: [{ ...mkParticipant("P1", 16), unitsPlanDev: 42 }],
      },
    ],
  };
}

describe("TSCSandboxTab (scenario modeling)", () => {
  it("renders scenario modeling section with dollars without crashing", () => {
    // OWNER: canEditServiceLines + canSeeCompanyDollars — exercises every
    // previously-undeclared path in the scenario section at once.
    render(
      <TSCSandboxTab config={withCoordinator()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    // Scenario comparison table (proves base/scenario/delta were declared).
    expect(screen.getByText("Scenario modeling")).toBeDefined();
    expect(screen.getByText("Annual Revenue")).toBeDefined();
    // Break-even section (proves `bev` was declared).
    expect(screen.getByText("Break-even analysis")).toBeDefined();
  });

  it("renders for an editor without company-dollar visibility (pct-only)", () => {
    // REGIONAL_DIRECTOR: can edit, but canSeeCompanyDollars is false —
    // exercises the dollars-hidden branch while base/scenario/delta still compute.
    render(
      <TSCSandboxTab
        config={withCoordinator()}
        onUpdate={vi.fn()}
        userRole={ROLES.REGIONAL_DIRECTOR}
      />
    );
    expect(screen.getByText("Scenario modeling")).toBeDefined();
    // Dollar rows are suppressed for tiers below Finance.
    expect(screen.queryByText("Annual Revenue")).toBeNull();
  });
});

describe("TSCRateScheduleTab", () => {
  it("renders all TSC billing codes without crashing", () => {
    render(
      <TSCRateScheduleTab
        config={defaultTSCConfig()}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    expect(screen.getByText("Idaho TSC Rate Schedule")).toBeDefined();
    // All three code groups present (group header is the first match).
    expect(screen.getAllByText("Coordination").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Plan Development").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Crisis").length).toBeGreaterThan(0);
    // No overrides initially.
    expect(screen.getByText("All rates at Idaho defaults")).toBeDefined();
  });
});
