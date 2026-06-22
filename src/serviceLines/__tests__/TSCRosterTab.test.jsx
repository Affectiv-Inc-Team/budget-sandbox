import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TSCRosterTab } from "../tsc.jsx";
import { defaultTSCConfig, mkCoordinator, mkParticipant } from "../tsc.jsx";
import { ROLES } from "../../lib/access.js";

// Minimal TSC config factory — owner role gives full edit access
function makeConfig(overrides = {}) {
  return { ...defaultTSCConfig(), ...overrides };
}

describe("TSCRosterTab", () => {
  it("renders the empty-state message when there are no coordinators", () => {
    render(
      <TSCRosterTab
        config={makeConfig()}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    expect(screen.getByText(/no coordinators yet/i)).toBeDefined();
  });

  it("clicking '+ Add coordinator' calls onUpdate with one coordinator added", () => {
    const onUpdate = vi.fn();
    render(
      <TSCRosterTab
        config={makeConfig()}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    fireEvent.click(screen.getByText(/\+ add coordinator/i));
    expect(onUpdate).toHaveBeenCalledOnce();
    const updatedConfig = onUpdate.mock.calls[0][0];
    expect(updatedConfig.coordinators).toHaveLength(1);
  });

  it("editing the coordinator name input calls onUpdate with the new name", () => {
    const coord = { ...mkCoordinator("Alice", 22), id: "c1" };
    const onUpdate = vi.fn();
    render(
      <TSCRosterTab
        config={makeConfig({ coordinators: [coord] })}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    // The coordinator name input has value "Alice"
    const nameInput = screen.getByDisplayValue("Alice");
    fireEvent.change(nameInput, { target: { value: "Bob" } });
    expect(onUpdate).toHaveBeenCalledOnce();
    const updatedConfig = onUpdate.mock.calls[0][0];
    expect(updatedConfig.coordinators[0].name).toBe("Bob");
  });

  it("clicking '+ Add participant' calls onUpdate with participant added to that coordinator", () => {
    const coord = { ...mkCoordinator("Alice", 22), id: "c1" };
    const onUpdate = vi.fn();
    render(
      <TSCRosterTab
        config={makeConfig({ coordinators: [coord] })}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    fireEvent.click(screen.getByText(/\+ add participant/i));
    expect(onUpdate).toHaveBeenCalledOnce();
    const updatedConfig = onUpdate.mock.calls[0][0];
    expect(updatedConfig.coordinators[0].participants).toHaveLength(1);
  });

  it("caseload count stat reflects the number of participants", () => {
    const coord = {
      ...mkCoordinator("Alice", 22),
      id: "c1",
      participants: [mkParticipant("P1", 16), mkParticipant("P2", 16)],
    };
    render(
      <TSCRosterTab
        config={makeConfig({ coordinators: [coord] })}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    // Find the "Total caseload" label and check the sibling value node
    const label = screen.getByText("Total caseload");
    expect(label.nextElementSibling.textContent).toBe("2");
  });

  it("participant row revenue reflects a config.rateOverrides override (not just the default rate)", () => {
    const coord = {
      ...mkCoordinator("Alice", 22),
      id: "c1",
      participants: [mkParticipant("P1", 16)],  // 16 G9002 units/mo
    };
    // Default coord rate is $20.97 → 16 × $20.97 ≈ $336/mo. Override to $10 → $160/mo.
    render(
      <TSCRosterTab
        config={makeConfig({ coordinators: [coord], rateOverrides: { coord: 10 } })}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    expect(screen.getByText("$160/mo")).toBeDefined();
    expect(screen.queryByText("$336/mo")).toBeNull();
  });

  it("add coordinator button is hidden when userRole has no edit permission", () => {
    render(
      <TSCRosterTab
        config={makeConfig()}
        onUpdate={vi.fn()}
        userRole={ROLES.HOUSE_LEAD}
      />
    );
    expect(screen.queryByText(/\+ add coordinator/i)).toBeNull();
  });
});
