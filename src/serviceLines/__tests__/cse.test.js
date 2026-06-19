import { describe, it, expect } from "vitest";
import {
  VOC_RATE_TABLE,
  BILLING_CODES,
  effectiveRates,
  calcCSEParticipant,
  calcCSESpecialist,
  calcCSEService,
  mkCSEParticipant,
  defaultCSEConfig,
} from "../cse.jsx";

// Rates mirrored from the table to keep assertions self-documenting
const H2023_15MIN = 11.44;  // Medicaid Supported Employment, per 15-min
const EES_HOUR    = 54.00;  // VR Extended Employment Services, per hour
const CBWE_HOUR   = 54.00;  // VR Community-Based Work Evaluation, per hour
const VOC_EVAL_DAY = 69.55; // VR Vocational Evaluation, per day

// ──────────────────────────────────────────────────────────────────────
// Rate table
// ──────────────────────────────────────────────────────────────────────
describe("VOC_RATE_TABLE", () => {
  it("contains exactly the four configured billing codes", () => {
    expect(BILLING_CODES).toEqual([
      "SUPPORTED_EMPLOYMENT", "EES", "CBWE", "VOC_EVAL",
    ]);
  });

  it("assigns Medicaid to supported employment and VR to the rest", () => {
    const payerByKey = Object.fromEntries(VOC_RATE_TABLE.map(r => [r.key, r.payer]));
    expect(payerByKey.SUPPORTED_EMPLOYMENT).toBe("Medicaid");
    expect(payerByKey.EES).toBe("VR");
    expect(payerByKey.CBWE).toBe("VR");
    expect(payerByKey.VOC_EVAL).toBe("VR");
  });

  it("carries the confirmed Idaho rates and units", () => {
    const byKey = Object.fromEntries(VOC_RATE_TABLE.map(r => [r.key, r]));
    expect(byKey.SUPPORTED_EMPLOYMENT).toMatchObject({ defaultRate: H2023_15MIN, unit: "15min" });
    expect(byKey.EES).toMatchObject({ defaultRate: EES_HOUR, unit: "hour" });
    expect(byKey.CBWE).toMatchObject({ defaultRate: CBWE_HOUR, unit: "hour" });
    expect(byKey.VOC_EVAL).toMatchObject({ defaultRate: VOC_EVAL_DAY, unit: "day" });
  });
});

// ──────────────────────────────────────────────────────────────────────
// effectiveRates — per-service override merge
// ──────────────────────────────────────────────────────────────────────
describe("effectiveRates", () => {
  it("returns Idaho defaults when no overrides are supplied", () => {
    const r = effectiveRates();
    expect(r.SUPPORTED_EMPLOYMENT).toBe(H2023_15MIN);
    expect(r.VOC_EVAL).toBe(VOC_EVAL_DAY);
  });

  it("overrides only the named code, leaving others at default", () => {
    const r = effectiveRates({ EES: 60 });
    expect(r.EES).toBe(60);
    expect(r.SUPPORTED_EMPLOYMENT).toBe(H2023_15MIN);
  });
});

// ──────────────────────────────────────────────────────────────────────
// calcCSEParticipant — unit-aware revenue
// ──────────────────────────────────────────────────────────────────────
describe("calcCSEParticipant", () => {
  it("bills 15-minute codes as hours × 4 units × rate", () => {
    const m = calcCSEParticipant({ billingCode: "SUPPORTED_EMPLOYMENT", hoursPerWeek: 20 });
    const monthlyHours = 20 * 4.33;
    expect(m.monthlyRev).toBeCloseTo(monthlyHours * 4 * H2023_15MIN, 2);
    expect(m.unit).toBe("15min");
  });

  it("bills per-hour codes as hours × rate (no unit multiplier)", () => {
    const m = calcCSEParticipant({ billingCode: "EES", hoursPerWeek: 20 });
    const monthlyHours = 20 * 4.33;
    expect(m.monthlyRev).toBeCloseTo(monthlyHours * EES_HOUR, 2);
    expect(m.unit).toBe("hour");
  });

  it("bills per-day codes as days × rate, independent of hours", () => {
    const m = calcCSEParticipant({ billingCode: "VOC_EVAL", hoursPerWeek: 20, daysPerWeek: 3 });
    expect(m.monthlyRev).toBeCloseTo(3 * 4.33 * VOC_EVAL_DAY, 2);
    expect(m.unit).toBe("day");
  });

  it("honors a rate override passed via the rates map", () => {
    const rates = effectiveRates({ EES: 60 });
    const m = calcCSEParticipant({ billingCode: "EES", hoursPerWeek: 10 }, rates);
    expect(m.monthlyRev).toBeCloseTo(10 * 4.33 * 60, 2);
  });

  it("normalizes unknown / legacy codes to supported employment (rate + unit)", () => {
    // e.g. a saved participant on the retired DDA therapy code 97537
    const m = calcCSEParticipant({ billingCode: "COMM_DEV_THERAPY", hoursPerWeek: 20 });
    const monthlyHours = 20 * 4.33;
    expect(m.unit).toBe("15min");
    expect(m.monthlyRev).toBeCloseTo(monthlyHours * 4 * H2023_15MIN, 2);
  });
});

// ──────────────────────────────────────────────────────────────────────
// calcCSEService — override threading
// ──────────────────────────────────────────────────────────────────────
describe("calcCSEService", () => {
  const config = (overrides) => ({
    ...defaultCSEConfig(),
    rateOverrides: overrides ?? {},
    specialists: [{
      id: "s1", name: "A", hourlyWage: 20, profile: "urban", officeName: "",
      participants: [{ ...mkCSEParticipant("P1"), billingCode: "EES", hoursPerWeek: 20 }],
    }],
  });

  it("applies config.rateOverrides to participant revenue", () => {
    const base = calcCSEService(config());
    const bumped = calcCSEService(config({ EES: 100 }));
    expect(bumped.totalAnnualRev).toBeGreaterThan(base.totalAnnualRev);
    const monthlyHours = 20 * 4.33;
    expect(bumped.totalAnnualRev).toBeCloseTo(monthlyHours * 100 * 12, 2);
  });

  it("works when rateOverrides is absent (legacy config)", () => {
    const cfg = config();
    delete cfg.rateOverrides;
    expect(() => calcCSEService(cfg)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────
// defaultCSEConfig / mkCSEParticipant shape
// ──────────────────────────────────────────────────────────────────────
describe("config factories", () => {
  it("seeds an empty rateOverrides map", () => {
    expect(defaultCSEConfig().rateOverrides).toEqual({});
  });

  it("creates participants with a default billing code and no phase field", () => {
    const p = mkCSEParticipant();
    expect(p.billingCode).toBe("SUPPORTED_EMPLOYMENT");
    expect(p.daysPerWeek).toBe(5);
    expect(p).not.toHaveProperty("phase");
  });
});
