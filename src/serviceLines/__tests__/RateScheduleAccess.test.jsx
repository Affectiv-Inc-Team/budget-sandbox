import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CSERateScheduleTab, defaultCSEConfig } from "../cse.jsx";
import { ChildrensDDARateScheduleTab, defaultChildrensDDAConfig } from "../childrens_dda.jsx";
import { TSCRateScheduleTab, defaultTSCConfig } from "../tsc.jsx";
import { SchoolBasedRateScheduleTab, defaultSchoolBasedConfig } from "../school_based.jsx";
import { ROLES } from "../../lib/access.js";

// [Technical] Maintain proper access level cross-referencing across all updated modules
// [Technical] Universal rate adjustment: ensure all service rates are adjustable across ALL modules
//
// canEditServiceLines gates rate-schedule edits at tier 4 (REGIONAL_DIRECTOR) and above.
// Lower tiers see the rates but cannot edit them. Every rate-schedule tab must honour
// this gate — these render-level assertions prevent any tab from silently dropping it.

describe("Rate schedule read-only enforcement", () => {
  const cases = [
    { name: "CSE",            Tab: CSERateScheduleTab,           cfg: defaultCSEConfig },
    { name: "Children's DDA", Tab: ChildrensDDARateScheduleTab,  cfg: defaultChildrensDDAConfig },
    { name: "TSC",            Tab: TSCRateScheduleTab,            cfg: defaultTSCConfig },
    { name: "School-Based",   Tab: SchoolBasedRateScheduleTab,    cfg: defaultSchoolBasedConfig },
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
