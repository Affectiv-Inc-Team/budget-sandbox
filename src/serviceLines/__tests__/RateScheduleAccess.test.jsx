import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CSERateScheduleTab, defaultCSEConfig } from "../cse.jsx";
import { ChildrensDDARateScheduleTab, defaultChildrensDDAConfig } from "../childrens_dda.jsx";
import { ROLES } from "../../lib/access.js";

// Access cross-referencing: rate-schedule edits are restricted to tiers 1–4
// (canEditServiceLines). Lower tiers see the rates but cannot change them.
// These render-level assertions guard against a future tab forgetting the gate.

describe("Rate schedule read-only enforcement", () => {
  const cases = [
    { name: "CSE", Tab: CSERateScheduleTab, cfg: defaultCSEConfig },
    { name: "Children's DDA", Tab: ChildrensDDARateScheduleTab, cfg: defaultChildrensDDAConfig },
  ];

  for (const { name, Tab, cfg } of cases) {
    it(`${name}: OWNER (tier 1) can edit — rate inputs are not read-only`, () => {
      render(<Tab config={cfg()} onUpdate={vi.fn()} userRole={ROLES.OWNER} />);
      const inputs = screen.getAllByRole("spinbutton");
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.every(i => !i.readOnly)).toBe(true);
    });

    it(`${name}: HOUSE_LEAD (tier 8) is read-only — every rate input is read-only`, () => {
      render(<Tab config={cfg()} onUpdate={vi.fn()} userRole={ROLES.HOUSE_LEAD} />);
      const inputs = screen.getAllByRole("spinbutton");
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.every(i => i.readOnly)).toBe(true);
    });

    it(`${name}: PROGRAM_MANAGER (tier 5) is read-only`, () => {
      render(<Tab config={cfg()} onUpdate={vi.fn()} userRole={ROLES.PROGRAM_MANAGER} />);
      const inputs = screen.getAllByRole("spinbutton");
      expect(inputs.every(i => i.readOnly)).toBe(true);
    });
  }
});
