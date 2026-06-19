import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SchoolBasedRosterTab,
  SchoolBasedParticipantsTab,
  defaultSchoolBasedConfig,
  mkClinician,
  mkStudent,
} from "../school_based.jsx";
import { ROLES } from "../../lib/access.js";

// Minimal school-based config factory — owner role gives full edit access
function makeConfig(overrides = {}) {
  return { ...defaultSchoolBasedConfig(), ...overrides };
}

describe("Roster ⇄ Participants synchronization", () => {
  it("a student added on the Roster inherits its clinician's school", () => {
    const cl = { ...mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30, "sch1"), id: "c1" };
    const onUpdate = vi.fn();
    render(
      <SchoolBasedRosterTab
        config={makeConfig({ clinicians: [cl], schools: [{ id: "sch1", name: "Lincoln", districtId: null }] })}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    fireEvent.click(screen.getByText(/\+ add student/i));
    const updated = onUpdate.mock.calls[0][0];
    // The new student carries the clinician's schoolId so it surfaces under the
    // right school in the Participants tab rather than the "no school" bucket.
    expect(updated.clinicians[0].students).toHaveLength(1);
    expect(updated.clinicians[0].students[0].schoolId).toBe("sch1");
  });

  it("'+ Add participant' on a school attaches a student to that school's clinician", () => {
    const cl = { ...mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30, "sch1"), id: "c1" };
    const onUpdate = vi.fn();
    render(
      <SchoolBasedParticipantsTab
        config={makeConfig({ clinicians: [cl], schools: [{ id: "sch1", name: "Lincoln", districtId: null }] })}
        onUpdate={onUpdate}
        userRole={ROLES.OWNER}
      />
    );
    fireEvent.click(screen.getByText(/\+ add participant/i));
    expect(onUpdate).toHaveBeenCalledOnce();
    const updated = onUpdate.mock.calls[0][0];
    // Added on the Participants side, but stored under the clinician (cl.students),
    // so it shows on the Roster side too — both tabs read the same array.
    expect(updated.clinicians[0].students).toHaveLength(1);
    expect(updated.clinicians[0].students[0].schoolId).toBe("sch1");
  });

  it("a school without a clinician shows a hint instead of the add button", () => {
    render(
      <SchoolBasedParticipantsTab
        config={makeConfig({ clinicians: [], schools: [{ id: "sch1", name: "Lincoln", districtId: null }] })}
        onUpdate={vi.fn()}
        userRole={ROLES.OWNER}
      />
    );
    expect(screen.queryByText(/\+ add participant/i)).toBeNull();
    expect(screen.getByText(/assign a clinician to this school/i)).toBeDefined();
  });

  it("the add-participant button is hidden for read-only roles", () => {
    const cl = { ...mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30, "sch1"), id: "c1" };
    render(
      <SchoolBasedParticipantsTab
        config={makeConfig({ clinicians: [cl], schools: [{ id: "sch1", name: "Lincoln", districtId: null }] })}
        onUpdate={vi.fn()}
        userRole={ROLES.HOUSE_LEAD}
      />
    );
    expect(screen.queryByText(/\+ add participant/i)).toBeNull();
  });
});
