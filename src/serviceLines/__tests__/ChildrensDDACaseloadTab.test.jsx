import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ChildrensDDACaseloadTab,
  defaultChildrensDDAConfig,
  mkDDAProvider,
  mkDDASupervisor,
} from "../childrens_dda.jsx";
import { ROLES } from "../../lib/access.js";

// A fully-normalized config (supervisors[] present, providers carry supervisorId)
// so the mount-time migration effect does NOT fire onUpdate unless we want it to.
function makeConfig(overrides = {}) {
  return { ...defaultChildrensDDAConfig(), ...overrides };
}

describe("ChildrensDDACaseloadTab", () => {
  it("shows the empty state when there are no providers", () => {
    render(
      <ChildrensDDACaseloadTab config={makeConfig()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    expect(screen.getByText(/no providers yet/i)).toBeDefined();
  });

  it("groups an assigned provider under its supervisor section", () => {
    const sup = { ...mkDDASupervisor("Dr. Lee", 70000), id: "sup1" };
    const pv  = { ...mkDDAProvider("Alice", "SPECIALIST", 22), id: "pv1", supervisorId: "sup1" };
    render(
      <ChildrensDDACaseloadTab
        config={makeConfig({ supervisors: [sup], providers: [pv] })}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    // "Dr. Lee" appears as the supervisor name input AND the assigned provider's
    // supervisor <select> selected option — so >=1 match confirms the grouping.
    expect(screen.getAllByDisplayValue("Dr. Lee").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Alice")).toBeDefined();
  });

  it("puts a provider with no supervisor in the unassigned bucket", () => {
    const pv = { ...mkDDAProvider("Bob", "SPECIALIST", 22), id: "pv1", supervisorId: null };
    render(
      <ChildrensDDACaseloadTab
        config={makeConfig({ supervisors: [], providers: [pv] })}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    expect(screen.getByText(/providers not assigned to a supervisor/i)).toBeDefined();
  });

  it("assigning a supervisor calls onUpdate with the provider's new supervisorId", () => {
    const sup = { ...mkDDASupervisor("Dr. Lee", 70000), id: "sup1" };
    const pv  = { ...mkDDAProvider("Bob", "SPECIALIST", 22), id: "pv1", supervisorId: null };
    const onUpdate = vi.fn();
    render(
      <ChildrensDDACaseloadTab
        config={makeConfig({ supervisors: [sup], providers: [pv] })}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    // The provider's supervisor <select> shows the unassigned placeholder.
    const select = screen.getByDisplayValue("— Unassigned —");
    fireEvent.change(select, { target: { value: "sup1" } });
    expect(onUpdate).toHaveBeenCalled();
    const updated = onUpdate.mock.calls.at(-1)[0];
    expect(updated.providers[0].supervisorId).toBe("sup1");
  });

  it("'+ Add supervisor' appends a supervisor", () => {
    const onUpdate = vi.fn();
    render(
      <ChildrensDDACaseloadTab
        config={makeConfig({ supervisors: [], providers: [] })}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    fireEvent.click(screen.getByText(/\+ add supervisor/i));
    const updated = onUpdate.mock.calls.at(-1)[0];
    expect(updated.supervisors).toHaveLength(1);
  });

  it("migrates a legacy config (no supervisors) on mount via onUpdate", () => {
    const legacy = {
      providers: [{ id: "pv1", name: "P1", tier: "SPECIALIST", hourlyWage: 22, participants: [] }],
      supervision: { count: 1, salary: 65000, providersPerSupervisor: 8 },
    };
    const onUpdate = vi.fn();
    render(
      <ChildrensDDACaseloadTab config={legacy} onUpdate={onUpdate} userRole={ROLES.OWNER} />
    );
    expect(onUpdate).toHaveBeenCalled();
    const migrated = onUpdate.mock.calls[0][0];
    expect(Array.isArray(migrated.supervisors)).toBe(true);
    expect(migrated.providers[0].supervisorId).toBeNull();
  });

  it("hides '+ Add supervisor' for roles without edit permission", () => {
    render(
      <ChildrensDDACaseloadTab
        config={makeConfig({ supervisors: [], providers: [] })}
        onUpdate={vi.fn()}
        userRole={ROLES.HOUSE_LEAD}
      />
    );
    expect(screen.queryByText(/\+ add supervisor/i)).toBeNull();
  });
});
