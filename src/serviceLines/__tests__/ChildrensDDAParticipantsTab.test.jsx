import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ChildrensDDAParticipantsTab,
  defaultChildrensDDAConfig,
  mkDDAProvider,
  mkDDAParticipant,
} from "../childrens_dda.jsx";
import { ROLES } from "../../lib/access.js";

function makeConfig(overrides = {}) {
  return { ...defaultChildrensDDAConfig(), ...overrides };
}

// A provider with one participant, both with stable ids for querying.
function providerWithParticipant(pName = "Alice", partName = "Kid A", phase = "initial") {
  const p  = { ...mkDDAParticipant(partName), id: "p1", phase };
  return { ...mkDDAProvider(pName, "SPECIALIST", 22), id: "pv1", supervisorId: null, participants: [p] };
}

describe("ChildrensDDAParticipantsTab", () => {
  it("shows the empty state when no participants exist", () => {
    render(
      <ChildrensDDAParticipantsTab config={makeConfig()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    expect(screen.getByText(/no participants yet/i)).toBeDefined();
  });

  it("lists participants flat with their owning provider", () => {
    render(
      <ChildrensDDAParticipantsTab
        config={makeConfig({ providers: [providerWithParticipant("Alice", "Kid A")] })}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    expect(screen.getByDisplayValue("Kid A")).toBeDefined();
    // provider context label appears
    expect(screen.getByText(/Provider:/i)).toBeDefined();
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("renders the participant count and a phase-breakdown stat", () => {
    render(
      <ChildrensDDAParticipantsTab
        config={makeConfig({ providers: [providerWithParticipant("Alice", "Kid A", "stabilization")] })}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    const total = screen.getByText("Participants");
    expect(total.nextElementSibling.textContent).toBe("1");
    // "Stabilization" phase stat is present
    expect(screen.getAllByText("Stabilization").length).toBeGreaterThan(0);
  });

  it("changing a participant's phase calls onUpdate with the new phase", () => {
    const onUpdate = vi.fn();
    render(
      <ChildrensDDAParticipantsTab
        config={makeConfig({ providers: [providerWithParticipant("Alice", "Kid A", "initial")] })}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    const phaseSelect = screen.getByDisplayValue("Initial");
    fireEvent.change(phaseSelect, { target: { value: "long_term" } });
    expect(onUpdate).toHaveBeenCalled();
    const updated = onUpdate.mock.calls.at(-1)[0];
    expect(updated.providers[0].participants[0].phase).toBe("long_term");
  });

  it("editing a participant name routes the update to the right provider", () => {
    const onUpdate = vi.fn();
    render(
      <ChildrensDDAParticipantsTab
        config={makeConfig({ providers: [providerWithParticipant("Alice", "Kid A")] })}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    fireEvent.change(screen.getByDisplayValue("Kid A"), { target: { value: "Kid B" } });
    const updated = onUpdate.mock.calls.at(-1)[0];
    expect(updated.providers[0].participants[0].name).toBe("Kid B");
  });
});
