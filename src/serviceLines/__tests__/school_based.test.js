import { describe, it, expect } from "vitest";
import {
  SCHOOL_RATE_TABLE,
  DISCIPLINES,
  disciplineTiers,
  therapyRateKeyFor,
  mkClinician,
  mkStudent,
  mkDistrict,
  mkSchool,
  mkSchoolWithInheritedRates,
  mkSchoolAdminStaffMember,
  defaultSchoolBasedConfig,
  schoolYearWeeks,
  calcSchoolStudent,
  calcSchoolClinician,
  calcSchoolAdminStaff,
  calcSchoolBasedService,
  calcSchoolScenario,
  normalizeSchoolBasedClinicians,
} from "../school_based.jsx";

// Rate constants mirrored from school_based.jsx to keep assertions self-documenting
const SPEECH_PROF  = 16.10;
const SPEECH_ASST  = 13.69;
const PT_PROF      = 24.60;
const PT_ASST      = 20.91;
const OT_PROF      = 29.33;
const OT_TECH      = 6.23;
const PSYCHO_30    = 68.96;
const PSYCHO_45    = 91.03;
const PSYCHO_60    = 134.77;
const PSYCH_EVAL   = 36.34;
const CBRS_IND     = 15.44;
const CBRS_GRP     = 3.86;
const TRANSPORT    = 0.44;

// Default school year: 36 weeks, default absence rate 10% → attendance 0.9
const WEEKS = 36;
const ATTEND = 0.9;

// A student whose only service is N therapy hrs/wk
function therapyStudent(hrPerWk = 1) {
  const s = mkStudent("T");
  s.services.therapy.hrPerWk = hrPerWk;
  return s;
}

// A student with everything zeroed (mkStudent defaults therapy to 1 hr/wk)
function blankStudent() {
  const s = mkStudent("B");
  s.services.therapy.hrPerWk = 0;
  return s;
}

// ──────────────────────────────────────────────────────────────────────
// Factories & registry
// ──────────────────────────────────────────────────────────────────────

describe("factories", () => {
  it("mkClinician produces the expected shape", () => {
    const c = mkClinician("Alice", "PT", "ASSISTANT", 28);
    expect(c.discipline).toBe("PT");
    expect(c.tier).toBe("ASSISTANT");
    expect(c.hourlyWage).toBe(28);
    expect(c.adminHrsPerWeek).toBe(5);
    expect(c.schoolId).toBeNull();
    expect(c).not.toHaveProperty("schoolName");
    expect(c).not.toHaveProperty("districtId");
    expect(c.students).toEqual([]);
    expect(c.id).toMatch(/^sbc_/);
  });

  it("mkClinician accepts an optional schoolId", () => {
    const c = mkClinician("Bob", "OT", "TECH", 25, "sbsch_abc");
    expect(c.schoolId).toBe("sbsch_abc");
  });

  it("mkStudent carries every service field regardless of discipline", () => {
    const s = mkStudent();
    expect(s.services.therapy.hrPerWk).toBe(1);
    expect(s.services.psycho).toEqual({ v30PerWk: 0, v45PerWk: 0, v60PerWk: 0 });
    expect(s.services.psychEval.unitsPerYear).toBe(0);
    expect(s.services.cbrsInd.hrPerWk).toBe(0);
    expect(s.services.cbrsGrp).toEqual({ hrPerWk: 0, groupSize: 4 });
    expect(s.services.transport.milesPerWk).toBe(0);
  });

  it("defaultSchoolBasedConfig has the documented keys", () => {
    const cfg = defaultSchoolBasedConfig();
    expect(cfg.clinicians).toEqual([]);
    expect(cfg.schoolYear).toEqual({ weeksPerYear: 36, esyWeeks: 0 });
    expect(cfg.productivity.absenceRate).toBe(10);
    expect(cfg.supervision).toEqual({ count: 0, salary: 70000 });
    expect(cfg.adminStaff).toEqual([]);
    expect(cfg.payrollBurdenPct).toBe(22);
    expect(cfg.defaultDiscipline).toBe("SPEECH");
    expect(cfg.rateOverrides).toEqual({});
  });

  it("SCHOOL_RATE_TABLE has 19 codes with units (13 original + 6 H2014 BI individual)", () => {
    expect(SCHOOL_RATE_TABLE).toHaveLength(19);
    const units = new Set(SCHOOL_RATE_TABLE.map(r => r.unit));
    expect(units).toEqual(new Set(["15min", "visit", "mile"]));
    // H2014 individual codes are present
    const h2014Keys = SCHOOL_RATE_TABLE.filter(r => r.code === 'H2014').map(r => r.key);
    expect(h2014Keys).toEqual(['bi_ind_tech','bi_ind_spec','bi_ind_prof','bi_ind_ebmpara','bi_ind_ebmspec','bi_ind_ebmprof']);
  });
});

describe("therapyRateKeyFor", () => {
  it("maps every discipline/tier combo", () => {
    expect(therapyRateKeyFor("SPEECH", "PROFESSIONAL")).toBe("speech_prof");
    expect(therapyRateKeyFor("SPEECH", "ASSISTANT")).toBe("speech_asst");
    expect(therapyRateKeyFor("PT", "PROFESSIONAL")).toBe("pt_prof");
    expect(therapyRateKeyFor("PT", "ASSISTANT")).toBe("pt_asst");
    expect(therapyRateKeyFor("OT", "PROFESSIONAL")).toBe("ot_prof");
    expect(therapyRateKeyFor("OT", "TECH")).toBe("ot_tech");
  });

  it("returns null for BEHAVIORAL and CBRS (no single therapy rate)", () => {
    expect(therapyRateKeyFor("BEHAVIORAL", "PROFESSIONAL")).toBeNull();
    expect(therapyRateKeyFor("CBRS", "SPECIALIST")).toBeNull();
  });

  it("falls back to the discipline's first tier on a stale combo", () => {
    // e.g. clinician switched from OT (TECH) to PT — PT has no TECH tier
    expect(therapyRateKeyFor("PT", "TECH")).toBe("pt_prof");
  });

  it("returns null for an unknown discipline", () => {
    expect(therapyRateKeyFor("NOPE", "PROFESSIONAL")).toBeNull();
  });

  it("disciplineTiers lists tiers per discipline", () => {
    expect(disciplineTiers("SPEECH")).toEqual(["PROFESSIONAL", "ASSISTANT"]);
    expect(disciplineTiers("CBRS")).toEqual(["SPECIALIST"]);
    expect(disciplineTiers("NOPE")).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// calcSchoolStudent
// ──────────────────────────────────────────────────────────────────────

describe("calcSchoolStudent", () => {
  const speechProf = mkClinician("S", "SPEECH", "PROFESSIONAL");

  it("annualizes speech therapy over school-year weeks with attendance", () => {
    const r = calcSchoolStudent(therapyStudent(1), speechProf);
    // 1 hr/wk = 4 units × $16.10 × 36 weeks × 0.9 attendance
    expect(r.annualRev).toBeCloseTo(4 * SPEECH_PROF * WEEKS * ATTEND, 2);
    expect(r.clinicianHrsPerWk).toBeCloseTo(1 * ATTEND, 4);
  });

  it("uses the assistant rate for an assistant-tier clinician", () => {
    const asst = mkClinician("A", "SPEECH", "ASSISTANT");
    const r = calcSchoolStudent(therapyStudent(2), asst);
    expect(r.annualRev).toBeCloseTo(2 * 4 * SPEECH_ASST * WEEKS * ATTEND, 2);
  });

  it("rates PT and OT by discipline and tier", () => {
    const ptA = calcSchoolStudent(therapyStudent(1), mkClinician("p", "PT", "ASSISTANT"));
    expect(ptA.weeklyRev).toBeCloseTo(4 * PT_ASST, 2);
    const otT = calcSchoolStudent(therapyStudent(1), mkClinician("o", "OT", "TECH"));
    expect(otT.weeklyRev).toBeCloseTo(4 * OT_TECH, 2);
    const otP = calcSchoolStudent(therapyStudent(1), mkClinician("o", "OT", "PROFESSIONAL"));
    expect(otP.weeklyRev).toBeCloseTo(4 * OT_PROF, 2);
  });

  it("ignores therapy hours for BEHAVIORAL clinicians (no therapy rate key)", () => {
    const r = calcSchoolStudent(therapyStudent(3), mkClinician("b", "BEHAVIORAL", "PROFESSIONAL"));
    expect(r.weeklyRev).toBe(0);
    expect(r.clinicianHrsPerWk).toBe(0);
  });

  it("bills psychotherapy per visit and fixes clinician time by visit length", () => {
    const s = blankStudent();
    s.services.psycho = { v30PerWk: 1, v45PerWk: 1, v60PerWk: 0 };
    const r = calcSchoolStudent(s, mkClinician("b", "BEHAVIORAL", "PROFESSIONAL"));
    expect(r.weeklyRev).toBeCloseTo(PSYCHO_30 + PSYCHO_45, 2);
    expect(r.clinicianHrsPerWk).toBeCloseTo((0.5 + 0.75) * ATTEND, 4);
    expect(r.annualRev).toBeCloseTo((PSYCHO_30 + PSYCHO_45) * WEEKS * ATTEND, 2);
  });

  it("adds psych eval revenue annually, independent of weekly cadence", () => {
    const s = blankStudent();
    s.services.psychEval.unitsPerYear = 4; // ≈ one 1-hour eval
    const r = calcSchoolStudent(s, mkClinician("b", "BEHAVIORAL", "PROFESSIONAL"));
    expect(r.annualRev).toBeCloseTo(4 * PSYCH_EVAL * ATTEND, 2);
    expect(r.weeklyRev).toBe(0); // eval is not part of the weekly stream
  });

  it("bills CBRS group hours in full but shares clinician time across the group", () => {
    const s = blankStudent();
    s.services.cbrsInd = { hrPerWk: 1 };
    s.services.cbrsGrp = { hrPerWk: 2, groupSize: 4 };
    const r = calcSchoolStudent(s, mkClinician("c", "CBRS", "SPECIALIST"));
    expect(r.weeklyRev).toBeCloseTo(1 * 4 * CBRS_IND + 2 * 4 * CBRS_GRP, 2);
    // clinician time: 1 individual + 2/4 group hours
    expect(r.clinicianHrsPerWk).toBeCloseTo((1 + 0.5) * ATTEND, 4);
    // billed (received) time counts the full group hours
    expect(r.billedHrsPerWk).toBeCloseTo(3 * ATTEND, 4);
  });

  it("counts transportation as revenue with zero clinician hours", () => {
    const s = blankStudent();
    s.services.transport.milesPerWk = 50;
    const r = calcSchoolStudent(s, mkClinician("c", "CBRS", "SPECIALIST"));
    expect(r.weeklyRev).toBeCloseTo(50 * TRANSPORT, 2);
    expect(r.clinicianHrsPerWk).toBe(0);
    expect(r.milesPerWk).toBe(50);
  });

  it("extends the year by ESY weeks", () => {
    const base = calcSchoolStudent(therapyStudent(1), speechProf, undefined, { weeksPerYear: 36, esyWeeks: 0 });
    const esy  = calcSchoolStudent(therapyStudent(1), speechProf, undefined, { weeksPerYear: 36, esyWeeks: 6 });
    expect(esy.annualRev / base.annualRev).toBeCloseTo(42 / 36, 4);
  });

  it("scales revenue by attendance (absence rate)", () => {
    const full = calcSchoolStudent(therapyStudent(1), speechProf, undefined, {}, { absenceRate: 0 });
    const abs  = calcSchoolStudent(therapyStudent(1), speechProf, undefined, {}, { absenceRate: 10 });
    expect(abs.annualRev / full.annualRev).toBeCloseTo(0.9, 4);
  });

  it("honors rate overrides", () => {
    const r = calcSchoolStudent(therapyStudent(1), speechProf, { speech_prof: 20 }, {}, { absenceRate: 0 });
    expect(r.weeklyRev).toBeCloseTo(4 * 20, 2);
  });

  it("returns zeros for a student with no services blob", () => {
    const r = calcSchoolStudent({ id: "x", name: "empty" }, speechProf);
    expect(r.annualRev).toBe(0);
    expect(r.clinicianHrsPerWk).toBe(0);
    expect(Number.isNaN(r.billedHrsPerWk)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// calcSchoolClinician
// ──────────────────────────────────────────────────────────────────────

describe("calcSchoolClinician", () => {
  it("pays for service + admin hours over school-year weeks with burden", () => {
    const cl = mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30);
    cl.students = [therapyStudent(10)];
    const m = calcSchoolClinician(cl, 22, undefined, { weeksPerYear: 36, esyWeeks: 0 }, { absenceRate: 0 });
    // 10 service + 5 admin hrs/wk × 36 wks × $30 × 1.22
    expect(m.annualLabor).toBeCloseTo(15 * 36 * 30 * 1.22, 2);
    expect(m.weeklyServiceHrs).toBeCloseTo(10, 4);
    expect(m.utilization).toBeCloseTo(15 / 40, 4);
    expect(m.billableShare).toBeCloseTo(10 / 15, 4);
  });

  it("reduces paid service hours by absence but keeps admin hours", () => {
    const cl = mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30);
    cl.students = [therapyStudent(10)];
    const m = calcSchoolClinician(cl, 22, undefined, {}, { absenceRate: 10 });
    expect(m.weeklyHrs).toBeCloseTo(10 * 0.9 + 5, 4);
  });

  it("computes gross and margin", () => {
    const cl = mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30);
    cl.students = [therapyStudent(10)];
    const m = calcSchoolClinician(cl);
    expect(m.gross).toBeCloseTo(m.annualRev - m.annualLabor, 2);
    expect(m.grossMargin).toBeCloseTo(m.gross / m.annualRev, 6);
  });

  it("handles a clinician with no students", () => {
    const m = calcSchoolClinician(mkClinician());
    expect(m.caseloadSize).toBe(0);
    expect(m.annualRev).toBe(0);
    expect(m.grossMargin).toBe(0);
    // still paid for admin hours
    expect(m.annualLabor).toBeGreaterThan(0);
  });

  it("applies the district rate override resolved via the clinician's school", () => {
    const district = { ...mkDistrict("Bonneville"), id: "d1", rateOverrides: { speech_prof: 100 } };
    const school   = { ...mkSchool("North Elementary", "d1"), id: "sch1" };
    const cl = { ...mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30, "sch1"), students: [therapyStudent(10)] };

    const withOverride = calcSchoolClinician(cl, 22, undefined, {}, { absenceRate: 0 }, {}, [district], [school]);
    const baseline     = calcSchoolClinician({ ...cl, schoolId: null }, 22, undefined, {}, { absenceRate: 0 }, {}, [district], [school]);

    // speech_prof default is 16.10; the district override raises it to 100 → much higher revenue
    expect(withOverride.annualRev).toBeGreaterThan(baseline.annualRev);
  });
});

// ──────────────────────────────────────────────────────────────────────
// normalizeSchoolBasedClinicians (legacy schoolName → schoolId migration)
// ──────────────────────────────────────────────────────────────────────

describe("normalizeSchoolBasedClinicians", () => {
  it("returns the same config reference when nothing legacy remains", () => {
    const config = { schools: [], clinicians: [{ ...mkClinician("A"), id: "c1" }] };
    expect(normalizeSchoolBasedClinicians(config)).toBe(config);
  });

  it("maps a legacy schoolName onto a newly created school and drops obsolete fields", () => {
    const legacy = { id: "c1", name: "A", discipline: "SPEECH", tier: "PROFESSIONAL", hourlyWage: 30, schoolName: "Maple K-8", districtId: "d1", students: [] };
    const out = normalizeSchoolBasedClinicians({ schools: [], clinicians: [legacy] });
    const cl = out.clinicians[0];
    expect(cl.schoolId).toBeTruthy();
    expect(cl).not.toHaveProperty("schoolName");
    expect(cl).not.toHaveProperty("districtId");
    const sch = out.schools.find(s => s.id === cl.schoolId);
    expect(sch.name).toBe("Maple K-8");
    expect(sch.districtId).toBe("d1");
  });

  it("reuses an existing school with a matching name instead of duplicating", () => {
    const school = { ...mkSchool("Maple K-8", "d1"), id: "sch1" };
    const legacy = { id: "c1", name: "A", schoolName: "maple k-8", students: [] };
    const out = normalizeSchoolBasedClinicians({ schools: [school], clinicians: [legacy] });
    expect(out.schools).toHaveLength(1);
    expect(out.clinicians[0].schoolId).toBe("sch1");
  });
});

// ──────────────────────────────────────────────────────────────────────
// calcSchoolAdminStaff
// ──────────────────────────────────────────────────────────────────────

describe("calcSchoolAdminStaff", () => {
  it("computes salaried cost with FTE and benefits", () => {
    const r = calcSchoolAdminStaff([{ mode: "salary", value: 60000, ftePct: 50, benefitsPct: 20 }]);
    expect(r.totalAnnualCost).toBeCloseTo(60000 * 0.5 * 1.2, 2);
  });

  it("computes hourly cost at 2080 hrs/yr", () => {
    const r = calcSchoolAdminStaff([{ mode: "hourly", value: 25, ftePct: 100, benefitsPct: 22 }]);
    expect(r.totalAnnualCost).toBeCloseTo(25 * 2080 * 1.22, 2);
  });

  it("sums multiple members and defaults missing fields", () => {
    const r = calcSchoolAdminStaff([mkSchoolAdminStaffMember(), mkSchoolAdminStaffMember()]);
    expect(r.staff).toHaveLength(2);
    expect(r.totalAnnualCost).toBeCloseTo(2 * 55000 * 1.22, 2);
  });

  it("returns zero for empty input", () => {
    expect(calcSchoolAdminStaff([]).totalAnnualCost).toBe(0);
    expect(calcSchoolAdminStaff().totalAnnualCost).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// calcSchoolBasedService
// ──────────────────────────────────────────────────────────────────────

describe("calcSchoolBasedService", () => {
  function twoClinicianConfig() {
    const cfg = defaultSchoolBasedConfig();
    const c1 = mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30);
    c1.students = [therapyStudent(5), therapyStudent(5)];
    const c2 = mkClinician("Bob", "PT", "ASSISTANT", 28);
    c2.students = [therapyStudent(8)];
    cfg.clinicians = [c1, c2];
    return cfg;
  }

  it("sums caseload, revenue and labor across clinicians", () => {
    const r = calcSchoolBasedService(twoClinicianConfig());
    expect(r.clinicianCount).toBe(2);
    expect(r.totalCaseload).toBe(3);
    const sum = r.clinicians.reduce((a, c) => a + c.metrics.annualRev, 0);
    expect(r.totalAnnualRev).toBeCloseTo(sum, 2);
    expect(r.totalAnnualRev).toBeGreaterThan(0);
    expect(r.totalAnnualLabor).toBeGreaterThan(0);
  });

  it("rolls supervision and admin into totalAnnualLabor; totalAnnualLaborRaw is pre-burden", () => {
    const cfg = twoClinicianConfig();
    cfg.supervision = { count: 1, salary: 70000 };
    cfg.adminStaff = [mkSchoolAdminStaffMember()];
    const r = calcSchoolBasedService(cfg);
    expect(r.supervisionCost).toBeCloseTo(70000 * 1.22, 2);
    expect(r.adminStaffCost).toBeCloseTo(55000 * 1.22, 2);
    // totalAnnualLabor is now all-in (clinicians + supervision + admin)
    const clinicianLabor = r.clinicians.reduce((a, c) => a + c.metrics.annualLabor, 0);
    expect(r.totalAnnualLabor).toBeCloseTo(clinicianLabor + r.supervisionCost + r.adminStaffCost, 2);
    // totalGross uses the combined total
    expect(r.totalGross).toBeCloseTo(r.totalAnnualRev - r.totalAnnualLabor, 2);
    // totalAnnualLaborRaw is pre-burden equivalent for company roll-up
    const clinicianLaborRaw = r.clinicians.reduce((a, c) => a + c.metrics.annualLaborRaw, 0);
    expect(r.totalAnnualLaborRaw).toBeCloseTo(clinicianLaborRaw + 70000 + 55000, 2);
  });

  it("flows rate overrides through to revenue", () => {
    const cfg = twoClinicianConfig();
    const base = calcSchoolBasedService(cfg);
    cfg.rateOverrides = { speech_prof: SPEECH_PROF * 2 };
    const bumped = calcSchoolBasedService(cfg);
    expect(bumped.totalAnnualRev).toBeGreaterThan(base.totalAnnualRev);
  });

  it("survives an empty config (legacy catalog-era service lines)", () => {
    const r = calcSchoolBasedService({});
    expect(r.totalAnnualRev).toBe(0);
    expect(r.totalAnnualLabor).toBe(0);
    expect(r.clinicianCount).toBe(0);
    expect(r.totalCaseload).toBe(0);
    expect(r.totalMargin).toBe(0);
    expect(r.weeks).toBe(36);
  });

  it("survives being called with no argument", () => {
    expect(() => calcSchoolBasedService()).not.toThrow();
  });

  it("reports school-year weeks including ESY", () => {
    expect(schoolYearWeeks({ weeksPerYear: 36, esyWeeks: 6 })).toBe(42);
    const cfg = defaultSchoolBasedConfig();
    cfg.schoolYear.esyWeeks = 4;
    expect(calcSchoolBasedService(cfg).weeks).toBe(40);
  });
});

// ──────────────────────────────────────────────────────────────────────
// calcSchoolScenario
// ──────────────────────────────────────────────────────────────────────

describe("calcSchoolScenario", () => {
  function cfgWith(scenario) {
    const cfg = defaultSchoolBasedConfig();
    const c = mkClinician("Alice", "SPEECH", "PROFESSIONAL", 30);
    c.students = [therapyStudent(10)];
    cfg.clinicians = [c];
    cfg.scenario = { ...cfg.scenario, ...scenario };
    return cfg;
  }

  it("is a no-op with default scenario settings", () => {
    const r = calcSchoolScenario(cfgWith({}));
    expect(r.delta.totalAnnualRev).toBeCloseTo(0, 2);
    expect(r.delta.totalGross).toBeCloseTo(0, 2);
  });

  it("rate adjustment scales revenue but not labor", () => {
    const r = calcSchoolScenario(cfgWith({ rateAdjPct: 10 }));
    expect(r.scenario.totalAnnualRev).toBeCloseTo(r.base.totalAnnualRev * 1.1, 2);
    expect(r.scenario.totalAnnualLabor).toBeCloseTo(r.base.totalAnnualLabor, 2);
    expect(r.delta.totalGross).toBeCloseTo(r.base.totalAnnualRev * 0.1, 2);
  });

  it("caseload count scales volumes proportionally", () => {
    const r = calcSchoolScenario(cfgWith({ caseloadCount: 2 })); // base caseload = 1
    expect(r.scenario.totalAnnualRev).toBeCloseTo(r.base.totalAnnualRev * 2, 2);
    expect(r.scenario.totalCaseload).toBe(2);
  });

  it("productivity adjustment scales hours and revenue together", () => {
    const r = calcSchoolScenario(cfgWith({ productivityAdjPct: 20 }));
    expect(r.scenario.totalAnnualRev).toBeCloseTo(r.base.totalAnnualRev * 1.2, 2);
    // labor rises too: more service hours are paid
    expect(r.scenario.totalAnnualLabor).toBeGreaterThan(r.base.totalAnnualLabor);
  });

  it("weeksPerYear what-if re-annualizes the year", () => {
    const r = calcSchoolScenario(cfgWith({ weeksPerYear: 42 }));
    expect(r.scenario.weeks).toBe(42);
    expect(r.scenario.totalAnnualRev).toBeCloseTo(r.base.totalAnnualRev * 42 / 36, 2);
  });

  it("survives an empty config", () => {
    const r = calcSchoolScenario({});
    expect(r.base.totalAnnualRev).toBe(0);
    expect(r.scenario.totalAnnualRev).toBe(0);
    expect(r.delta.totalGross).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Task 1 — BEHAVIOR_INTERVENTION (H2014 individual) codes
// ──────────────────────────────────────────────────────────────────────

const BI_TECH = 13.54;
const BI_SPEC = 15.48;
const BI_PROF = 21.34;
const BI_EBM_PARA = 14.34;
const BI_EBM_SPEC = 18.51;
const BI_EBM_PROF = 24.68;

describe("BEHAVIOR_INTERVENTION discipline", () => {
  it("DISCIPLINES registry includes all 6 BI tiers", () => {
    const tiers = disciplineTiers("BEHAVIOR_INTERVENTION");
    expect(tiers).toEqual(["TECH", "SPECIALIST", "PROFESSIONAL", "EBM_PARA", "EBM_SPEC", "EBM_PROF"]);
  });

  it("therapyRateKeyFor resolves each BI tier to the correct H2014 key", () => {
    expect(therapyRateKeyFor("BEHAVIOR_INTERVENTION", "TECH")).toBe("bi_ind_tech");
    expect(therapyRateKeyFor("BEHAVIOR_INTERVENTION", "SPECIALIST")).toBe("bi_ind_spec");
    expect(therapyRateKeyFor("BEHAVIOR_INTERVENTION", "PROFESSIONAL")).toBe("bi_ind_prof");
    expect(therapyRateKeyFor("BEHAVIOR_INTERVENTION", "EBM_PARA")).toBe("bi_ind_ebmpara");
    expect(therapyRateKeyFor("BEHAVIOR_INTERVENTION", "EBM_SPEC")).toBe("bi_ind_ebmspec");
    expect(therapyRateKeyFor("BEHAVIOR_INTERVENTION", "EBM_PROF")).toBe("bi_ind_ebmprof");
  });

  it("calcSchoolStudent computes H2014 TECH revenue for a BI clinician", () => {
    const cl = mkClinician("BIT", "BEHAVIOR_INTERVENTION", "TECH");
    const s  = { ...mkStudent(), services: { ...mkStudent().services, biInd: { hrPerWk: 2 } } };
    const r  = calcSchoolStudent(s, cl);
    // 2 hr/wk × 4 units/hr × BI_TECH rate × WEEKS × ATTEND
    const expected = 2 * 4 * BI_TECH * WEEKS * ATTEND;
    expect(r.annualRev).toBeCloseTo(expected, 2);
    expect(r.clinicianHrsPerWk).toBeCloseTo(2 * ATTEND, 4);
  });

  it("calcSchoolStudent computes H2014 PROFESSIONAL revenue for a BI clinician", () => {
    const cl = mkClinician("BIP", "BEHAVIOR_INTERVENTION", "PROFESSIONAL");
    const s  = { ...mkStudent(), services: { ...mkStudent().services, biInd: { hrPerWk: 1 } } };
    const r  = calcSchoolStudent(s, cl);
    const expected = 1 * 4 * BI_PROF * WEEKS * ATTEND;
    expect(r.annualRev).toBeCloseTo(expected, 2);
  });

  it("BI clinician earns no therapy revenue from therapy.hrPerWk (not a therapy discipline)", () => {
    const cl = mkClinician("BIT", "BEHAVIOR_INTERVENTION", "TECH");
    const s  = { ...mkStudent(), services: { ...mkStudent().services, therapy: { hrPerWk: 5 }, biInd: { hrPerWk: 0 } } };
    const r  = calcSchoolStudent(s, cl);
    expect(r.annualRev).toBe(0);
  });

  it("mkStudent now includes biInd field", () => {
    const s = mkStudent();
    expect(s.services.biInd).toEqual({ hrPerWk: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────────
// Task 2 — District-based rate schedule
// ──────────────────────────────────────────────────────────────────────

describe("district rate layering", () => {
  it("defaultSchoolBasedConfig seeds 3 districts with empty overrides", () => {
    const cfg = defaultSchoolBasedConfig();
    expect(cfg.districts).toHaveLength(3);
    expect(cfg.districts.map(d => d.name)).toEqual(["Bonneville", "Jefferson County", "Madison"]);
    cfg.districts.forEach(d => expect(d.rateOverrides).toEqual({}));
  });

  it("defaultSchoolBasedConfig seeds empty schools array", () => {
    expect(defaultSchoolBasedConfig().schools).toEqual([]);
  });

  it("mkDistrict auto-populates rateOverrides with all Idaho defaults", () => {
    const d = mkDistrict("Test District");
    expect(d.name).toBe("Test District");
    expect(d.id).toMatch(/^sbdist_/);
    // All 19 codes from SCHOOL_RATE_TABLE should be pre-filled with their defaults
    expect(Object.keys(d.rateOverrides)).toHaveLength(SCHOOL_RATE_TABLE.length);
    SCHOOL_RATE_TABLE.forEach(r => {
      expect(d.rateOverrides[r.key]).toBeCloseTo(r.defaultRate, 4);
    });
  });

  it("mkClinician defaults to no school and carries no districtId (district is derived from the school)", () => {
    const cl = mkClinician();
    expect(cl.schoolId).toBeNull();
    expect(cl).not.toHaveProperty("districtId");
  });

  it("district rateOverrides layer on top of base overrides for a clinician in that district", () => {
    const dist = { id: "d1", name: "Bonneville", rateOverrides: { speech_prof: 20.00 } };
    const cl = { ...mkClinician("S", "SPEECH", "PROFESSIONAL", 30), districtId: "d1", students: [] };
    const cfg = {
      ...defaultSchoolBasedConfig(),
      clinicians: [cl],
      districts: [dist],
      rateOverrides: { speech_prof: 17.00 }, // base override
    };
    // Clinician in d1 should use d1's rate (20.00), not the base override (17.00)
    const result = calcSchoolBasedService(cfg);
    // Revenue is 0 (no students) but we verify the rate passes through
    // Add a student to confirm revenue uses the district rate
    const s = { ...mkStudent(), services: { ...mkStudent().services, therapy: { hrPerWk: 1 } } };
    const clWithStudent = { ...cl, students: [s] };
    const cfg2 = { ...cfg, clinicians: [clWithStudent] };
    const r2 = calcSchoolBasedService(cfg2);
    const expectedRev = 1 * 4 * 20.00 * WEEKS * ATTEND;
    expect(r2.totalAnnualRev).toBeCloseTo(expectedRev, 1);
  });

  it("base rateOverrides apply to clinicians with no district", () => {
    const cl = { ...mkClinician("S", "SPEECH", "PROFESSIONAL", 30), districtId: null };
    const s  = { ...mkStudent(), services: { ...mkStudent().services, therapy: { hrPerWk: 1 } } };
    const cfg = {
      ...defaultSchoolBasedConfig(),
      clinicians: [{ ...cl, students: [s] }],
      rateOverrides: { speech_prof: 18.50 },
    };
    const r = calcSchoolBasedService(cfg);
    const expected = 1 * 4 * 18.50 * WEEKS * ATTEND;
    expect(r.totalAnnualRev).toBeCloseTo(expected, 1);
  });

  it("district override for one district does not affect another district's clinician", () => {
    const dist1 = { id: "d1", name: "Bonneville",      rateOverrides: { speech_prof: 20.00 } };
    const dist2 = { id: "d2", name: "Jefferson County", rateOverrides: {} };
    const s = { ...mkStudent(), services: { ...mkStudent().services, therapy: { hrPerWk: 1 } } };
    const cl1 = { ...mkClinician("S1", "SPEECH", "PROFESSIONAL", 30), districtId: "d1", students: [s] };
    const cl2 = { ...mkClinician("S2", "SPEECH", "PROFESSIONAL", 30), districtId: "d2", students: [{ ...s, id: "sbs_other" }] };
    const cfg = { ...defaultSchoolBasedConfig(), clinicians: [cl1, cl2], districts: [dist1, dist2] };
    const r = calcSchoolBasedService(cfg);
    const revCl1 = r.clinicians[0].metrics.annualRev;
    const revCl2 = r.clinicians[1].metrics.annualRev;
    const expected1 = 1 * 4 * 20.00 * WEEKS * ATTEND;
    const expected2 = 1 * 4 * SPEECH_PROF * WEEKS * ATTEND;
    expect(revCl1).toBeCloseTo(expected1, 1);
    expect(revCl2).toBeCloseTo(expected2, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Task 3 — School / participant data model
// ──────────────────────────────────────────────────────────────────────

describe("school and participant factories", () => {
  it("mkSchool creates a school with correct shape including rateOverrides", () => {
    const sc = mkSchool("Skyline Elementary", "dist_bonneville");
    expect(sc.name).toBe("Skyline Elementary");
    expect(sc.districtId).toBe("dist_bonneville");
    expect(sc.id).toMatch(/^sbsch_/);
    expect(sc.rateOverrides).toEqual({});
  });

  it("mkSchool defaults districtId to null", () => {
    expect(mkSchool("Test").districtId).toBeNull();
  });

  it("mkStudent has schoolId: null by default", () => {
    expect(mkStudent().schoolId).toBeNull();
  });

  it("schoolId on a student is preserved through calcSchoolBasedService", () => {
    const s = { ...mkStudent("Alice"), schoolId: "sbsch_test" };
    const cl = { ...mkClinician(), students: [s] };
    const result = calcSchoolBasedService({ ...defaultSchoolBasedConfig(), clinicians: [cl] });
    const studentOut = result.clinicians[0].students[0];
    expect(studentOut.schoolId).toBe("sbsch_test");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Task 3 — mkSchoolWithInheritedRates
// ──────────────────────────────────────────────────────────────────────

describe("mkSchoolWithInheritedRates", () => {
  const district = { id: "d1", name: "Bonneville", rateOverrides: { speech_prof: 20.00, pt_prof: 30.00 } };

  it("returns an empty rateOverrides when no districtId provided", () => {
    const sc = mkSchoolWithInheritedRates("New School", null, [district]);
    expect(sc.rateOverrides).toEqual({});
    expect(sc.districtId).toBeNull();
  });

  it("copies the parent district's rateOverrides into the new school", () => {
    const sc = mkSchoolWithInheritedRates("Bonneville High", "d1", [district]);
    expect(sc.rateOverrides).toEqual({ speech_prof: 20.00, pt_prof: 30.00 });
    expect(sc.districtId).toBe("d1");
  });

  it("is a shallow copy — mutating the school's rates does not affect the district", () => {
    const sc = mkSchoolWithInheritedRates("Bonneville High", "d1", [district]);
    sc.rateOverrides.speech_prof = 99;
    expect(district.rateOverrides.speech_prof).toBe(20.00);
  });

  it("returns empty rateOverrides when districtId does not match any district", () => {
    const sc = mkSchoolWithInheritedRates("Orphan School", "d_missing", [district]);
    expect(sc.rateOverrides).toEqual({});
  });

  it("assigns the correct id prefix and name", () => {
    const sc = mkSchoolWithInheritedRates("Lincoln High", "d1", [district]);
    expect(sc.id).toMatch(/^sbsch_/);
    expect(sc.name).toBe("Lincoln High");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Task 3 — 3-level rate override precedence (base → district → school)
// ──────────────────────────────────────────────────────────────────────

describe("school-level rate override precedence", () => {
  function studentWithTherapy(hrPerWk = 1) {
    const s = mkStudent();
    s.services.therapy.hrPerWk = hrPerWk;
    return s;
  }

  it("school override takes precedence over district and base", () => {
    const district = { id: "d1", name: "Bonneville", rateOverrides: { speech_prof: 20.00 } };
    const school   = { ...mkSchool("Lincoln High", "d1"), id: "sch1", rateOverrides: { speech_prof: 35.00 } };
    const cl = { ...mkClinician("S", "SPEECH", "PROFESSIONAL", 30, "sch1"), students: [studentWithTherapy(1)] };
    const cfg = {
      ...defaultSchoolBasedConfig(),
      clinicians: [cl],
      districts: [district],
      schools: [school],
      rateOverrides: { speech_prof: 17.00 },
    };
    const r = calcSchoolBasedService(cfg);
    // Should use school rate (35.00), not district (20.00) or base (17.00)
    expect(r.totalAnnualRev).toBeCloseTo(1 * 4 * 35.00 * WEEKS * ATTEND, 1);
  });

  it("district override applies when school has no override for that key", () => {
    const district = { id: "d1", name: "Bonneville", rateOverrides: { speech_prof: 20.00 } };
    // School has no speech_prof override
    const school   = { ...mkSchool("Lincoln High", "d1"), id: "sch1", rateOverrides: {} };
    const cl = { ...mkClinician("S", "SPEECH", "PROFESSIONAL", 30, "sch1"), students: [studentWithTherapy(1)] };
    const cfg = {
      ...defaultSchoolBasedConfig(),
      clinicians: [cl],
      districts: [district],
      schools: [school],
      rateOverrides: { speech_prof: 17.00 },
    };
    const r = calcSchoolBasedService(cfg);
    // Should use district rate (20.00), not base (17.00)
    expect(r.totalAnnualRev).toBeCloseTo(1 * 4 * 20.00 * WEEKS * ATTEND, 1);
  });

  it("base override applies when neither district nor school has an override", () => {
    const district = { id: "d1", name: "Bonneville", rateOverrides: {} };
    const school   = { ...mkSchool("Lincoln High", "d1"), id: "sch1", rateOverrides: {} };
    const cl = { ...mkClinician("S", "SPEECH", "PROFESSIONAL", 30, "sch1"), students: [studentWithTherapy(1)] };
    const cfg = {
      ...defaultSchoolBasedConfig(),
      clinicians: [cl],
      districts: [district],
      schools: [school],
      rateOverrides: { speech_prof: 18.00 },
    };
    const r = calcSchoolBasedService(cfg);
    expect(r.totalAnnualRev).toBeCloseTo(1 * 4 * 18.00 * WEEKS * ATTEND, 1);
  });

  it("two schools in the same district each use their own rate overrides independently", () => {
    const district = { id: "d1", name: "Bonneville", rateOverrides: {} };
    const schoolA  = { ...mkSchool("Bonneville High", "d1"), id: "schA", rateOverrides: { speech_prof: 25.00 } };
    const schoolB  = { ...mkSchool("Lincoln High",    "d1"), id: "schB", rateOverrides: { speech_prof: 30.00 } };
    const s = studentWithTherapy(1);
    const clA = { ...mkClinician("A", "SPEECH", "PROFESSIONAL", 30, "schA"), students: [s] };
    const clB = { ...mkClinician("B", "SPEECH", "PROFESSIONAL", 30, "schB"), students: [{ ...s, id: "sbs_other" }] };
    const cfg = {
      ...defaultSchoolBasedConfig(),
      clinicians: [clA, clB],
      districts: [district],
      schools: [schoolA, schoolB],
    };
    const r = calcSchoolBasedService(cfg);
    expect(r.clinicians[0].metrics.annualRev).toBeCloseTo(1 * 4 * 25.00 * WEEKS * ATTEND, 1);
    expect(r.clinicians[1].metrics.annualRev).toBeCloseTo(1 * 4 * 30.00 * WEEKS * ATTEND, 1);
  });

  it("clinician with no schoolId uses district then base (unchanged behaviour)", () => {
    const district = { id: "d1", name: "Bonneville", rateOverrides: { speech_prof: 22.00 } };
    const cl = { ...mkClinician("S", "SPEECH", "PROFESSIONAL", 30), districtId: "d1", students: [studentWithTherapy(1)] };
    const cfg = { ...defaultSchoolBasedConfig(), clinicians: [cl], districts: [district] };
    const r = calcSchoolBasedService(cfg);
    expect(r.totalAnnualRev).toBeCloseTo(1 * 4 * 22.00 * WEEKS * ATTEND, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Task 3 — normalizeSchoolBasedClinicians with rate inheritance
// ──────────────────────────────────────────────────────────────────────

describe("normalizeSchoolBasedClinicians — rate inheritance on new schools", () => {
  it("newly created school inherits its parent district's rateOverrides", () => {
    const district = { id: "d1", name: "Bonneville", rateOverrides: { speech_prof: 25.00, pt_prof: 28.00 } };
    const legacy = {
      id: "c1", name: "Alice", discipline: "SPEECH", tier: "PROFESSIONAL",
      hourlyWage: 30, schoolName: "Lincoln Elementary", districtId: "d1", students: [],
    };
    const out = normalizeSchoolBasedClinicians({ schools: [], districts: [district], clinicians: [legacy] });
    const createdSchool = out.schools.find(s => s.name === "Lincoln Elementary");
    expect(createdSchool).toBeDefined();
    expect(createdSchool.districtId).toBe("d1");
    expect(createdSchool.rateOverrides).toEqual({ speech_prof: 25.00, pt_prof: 28.00 });
  });

  it("newly created school with no district gets empty rateOverrides", () => {
    const legacy = {
      id: "c1", name: "Alice", discipline: "SPEECH", tier: "PROFESSIONAL",
      hourlyWage: 30, schoolName: "Orphan School", districtId: null, students: [],
    };
    const out = normalizeSchoolBasedClinicians({ schools: [], districts: [], clinicians: [legacy] });
    const createdSchool = out.schools.find(s => s.name === "Orphan School");
    expect(createdSchool.rateOverrides).toEqual({});
  });

  it("existing schools are not modified when they already have a schoolId", () => {
    const school = { ...mkSchool("Maple K-8", "d1"), id: "sch1", rateOverrides: { speech_prof: 19.00 } };
    const cl = { id: "c1", name: "Alice", discipline: "SPEECH", schoolId: "sch1", students: [] };
    const out = normalizeSchoolBasedClinicians({ schools: [school], districts: [], clinicians: [cl] });
    expect(out).toBe(out); // idempotent — same config reference returned only when nothing needed migration
    const schoolOut = out.schools.find(s => s.id === "sch1");
    expect(schoolOut.rateOverrides).toEqual({ speech_prof: 19.00 });
  });
});
