import { describe, it, expect } from "vitest";
import {
  calcChildrensDDAService,
  normalizeChildrensDDA,
  defaultChildrensDDAConfig,
  mkDDAProvider,
  mkDDASupervisor,
  mkDDAParticipant,
  DDA_PHASES,
  DDA_PHASE_LABELS,
} from "../childrens_dda.jsx";

// ──────────────────────────────────────────────────────────────────────
// Phase constants (Task 4 — renamed labels, stable keys)
// ──────────────────────────────────────────────────────────────────────
describe("DDA service phases", () => {
  it("exposes three phases with the renamed labels", () => {
    expect(DDA_PHASES).toEqual(["initial", "stabilization", "long_term"]);
    expect(DDA_PHASE_LABELS.initial).toBe("Initial");           // "intensive" dropped
    expect(DDA_PHASE_LABELS.stabilization).toBe("Stabilization"); // unchanged
    expect(DDA_PHASE_LABELS.long_term).toBe("Long-Term Supports"); // was "Long-Term Retention"
  });

  it("new participants default to the 'initial' phase", () => {
    expect(mkDDAParticipant().phase).toBe("initial");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Factories (Task 3 — supervisor + provider FK)
// ──────────────────────────────────────────────────────────────────────
describe("DDA factories", () => {
  it("providers carry a null supervisorId by default", () => {
    expect(mkDDAProvider().supervisorId).toBeNull();
  });

  it("mkDDASupervisor builds a named supervisor with a salary", () => {
    const s = mkDDASupervisor("Dr. Lee", 72000);
    expect(s.name).toBe("Dr. Lee");
    expect(s.salary).toBe(72000);
    expect(s.id).toMatch(/^ddasup_/);
  });

  it("default config seeds an empty supervisors array", () => {
    expect(defaultChildrensDDAConfig().supervisors).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// normalizeChildrensDDA (legacy migration)
// ──────────────────────────────────────────────────────────────────────
describe("normalizeChildrensDDA", () => {
  it("synthesizes named supervisors from legacy supervision settings", () => {
    const legacy = {
      providers: [{ id: "pv1", name: "P1", tier: "SPECIALIST", hourlyWage: 22, participants: [] }],
      supervision: { count: 2, salary: 70000, providersPerSupervisor: 8 },
    };
    const out = normalizeChildrensDDA(legacy);
    expect(out.supervisors).toHaveLength(2);
    expect(out.supervisors.every(s => s.salary === 70000)).toBe(true);
  });

  it("backfills a null supervisorId on legacy providers", () => {
    const legacy = {
      providers: [{ id: "pv1", name: "P1", tier: "SPECIALIST", hourlyWage: 22, participants: [] }],
      supervision: { count: 1, salary: 65000 },
    };
    const out = normalizeChildrensDDA(legacy);
    expect(out.providers[0].supervisorId).toBeNull();
  });

  it("is idempotent — returns the same reference once migrated", () => {
    const migrated = normalizeChildrensDDA({
      providers: [mkDDAProvider("P1")],
      supervisors: [mkDDASupervisor("S1")],
      supervision: { count: 1, salary: 65000 },
    });
    expect(normalizeChildrensDDA(migrated)).toBe(migrated);
  });
});

// ──────────────────────────────────────────────────────────────────────
// calcChildrensDDAService — supervision cost from supervisors[]
// ──────────────────────────────────────────────────────────────────────
describe("calcChildrensDDAService supervision cost", () => {
  it("sums supervisor salaries when a supervisors[] list is present", () => {
    const config = {
      payrollBurdenPct: 0,
      providers: [],
      supervisors: [mkDDASupervisor("A", 60000), mkDDASupervisor("B", 80000)],
      supervision: { count: 1, salary: 65000 },
    };
    const s = calcChildrensDDAService(config);
    expect(s.supervisorCount).toBe(2);
    expect(s.supervisionCost).toBeCloseTo(140000, 2); // 60k + 80k, 0% burden
  });

  it("falls back to legacy supervision.{count,salary} when no supervisors[]", () => {
    const config = {
      payrollBurdenPct: 0,
      providers: [],
      supervision: { count: 2, salary: 65000 },
    };
    const s = calcChildrensDDAService(config);
    expect(s.supervisorCount).toBe(2);
    expect(s.supervisionCost).toBeCloseTo(130000, 2); // 2 × 65k, 0% burden
  });

  it("applies the payroll burden to supervision salary", () => {
    const config = {
      payrollBurdenPct: 22,
      providers: [],
      supervisors: [mkDDASupervisor("A", 100000)],
    };
    const s = calcChildrensDDAService(config);
    expect(s.supervisionCost).toBeCloseTo(122000, 2); // 100k × 1.22
  });
});
