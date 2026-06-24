import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TSCCurrentServicesTab,
  defaultTSCConfig,
  mkCoordinator,
  mkParticipant,
} from "../tsc.jsx";
import { ROLES } from "../../lib/access.js";

// Regression coverage for a crash the Phase 4 E2E suite surfaced: both the
// coordinator and participant inner tabs rendered CoordinatorCard/ParticipantFlatRow
// with `rates={rates}` but never declared `rates`, causing a ReferenceError when a
// coordinator existed. Tested via TSCCurrentServicesTab (the public wrapper) since
// the inner tabs are now internal components.
function withCoordinator() {
  return {
    ...defaultTSCConfig(),
    coordinators: [
      { ...mkCoordinator("Alice", 22), id: "c1", participants: [mkParticipant("P1", 16)] },
    ],
  };
}

describe("TSCCurrentServicesTab — Coordinators inner tab", () => {
  it("renders a coordinator card with participants without crashing", () => {
    render(
      <TSCCurrentServicesTab config={withCoordinator()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    // Click the Coordinators toggle to expand the coordinator card.
    fireEvent.click(screen.getByText("👤 Coordinators"));
    // Coordinator name input present (proves the card rendered, no ReferenceError).
    expect(screen.getByDisplayValue("Alice")).toBeDefined();
    // 16 G9002 units × $20.97 → $336/mo via the rates-driven calc.
    expect(screen.getByText("$336/mo")).toBeDefined();
  });
});

describe("TSCCurrentServicesTab — Participants inner tab", () => {
  it("renders the flat participant list without crashing", () => {
    render(
      <TSCCurrentServicesTab config={withCoordinator()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />
    );
    // Click the Participants toggle to expand the flat list.
    fireEvent.click(screen.getByText("👥 Participants"));
    expect(screen.getByDisplayValue("P1")).toBeDefined();
    expect(screen.getByText("$336/mo")).toBeDefined();
  });
});
