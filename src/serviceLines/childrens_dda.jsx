import { useState, useEffect } from "react";
import { canSeeCompanyDollars, wageDisplayMode, canEditServiceLines } from '../lib/access';
import { makeEffectiveRates } from '../lib/rates';

// ─────────────────────────────────────────────────────────────────────────────
// Idaho CHIS (Children's Habilitation Intervention Services) rate table
// All rates are post-9/1/2025 4% reduction, per 15-minute unit.
// Exported so the rate schedule tab can display and FinancialTool can reference.
// ─────────────────────────────────────────────────────────────────────────────
export const DDA_RATE_TABLE = [
  // Behavior Intervention – Individual (H2014)
  { group: 'Behavior Intervention – Individual', key: 'bi_ind_tech',    code: 'H2014', modifier: 'HA',       description: 'Behavior Intervention – Individual', tier: 'Technician',           defaultRate: 13.54 },
  { group: 'Behavior Intervention – Individual', key: 'bi_ind_spec',    code: 'H2014', modifier: 'HN',       description: 'Behavior Intervention – Individual', tier: 'Specialist',           defaultRate: 15.48 },
  { group: 'Behavior Intervention – Individual', key: 'bi_ind_prof',    code: 'H2014', modifier: 'HO',       description: 'Behavior Intervention – Individual', tier: 'Professional',         defaultRate: 21.34 },
  { group: 'Behavior Intervention – Individual', key: 'bi_ind_ebmpara', code: 'H2014', modifier: 'TF',       description: 'Behavior Intervention – Individual', tier: 'EBM Paraprofessional', defaultRate: 14.34 },
  { group: 'Behavior Intervention – Individual', key: 'bi_ind_ebmspec', code: 'H2014', modifier: 'TF HN',    description: 'Behavior Intervention – Individual', tier: 'EBM Specialist',       defaultRate: 18.51 },
  { group: 'Behavior Intervention – Individual', key: 'bi_ind_ebmprof', code: 'H2014', modifier: 'TF HO',    description: 'Behavior Intervention – Individual', tier: 'EBM Professional',     defaultRate: 24.68 },
  // Behavior Intervention – Group (H2014 + HQ)
  { group: 'Behavior Intervention – Group',      key: 'bi_grp_tech',    code: 'H2014', modifier: 'HA HQ',    description: 'Behavior Intervention – Group',      tier: 'Technician',           defaultRate:  5.41 },
  { group: 'Behavior Intervention – Group',      key: 'bi_grp_spec',    code: 'H2014', modifier: 'HN HQ',    description: 'Behavior Intervention – Group',      tier: 'Specialist',           defaultRate:  6.18 },
  { group: 'Behavior Intervention – Group',      key: 'bi_grp_prof',    code: 'H2014', modifier: 'HO HQ',    description: 'Behavior Intervention – Group',      tier: 'Professional',         defaultRate:  8.53 },
  { group: 'Behavior Intervention – Group',      key: 'bi_grp_ebmpara', code: 'H2014', modifier: 'TF HQ',    description: 'Behavior Intervention – Group',      tier: 'EBM Paraprofessional', defaultRate:  5.73 },
  { group: 'Behavior Intervention – Group',      key: 'bi_grp_ebmspec', code: 'H2014', modifier: 'TF HN HQ', description: 'Behavior Intervention – Group',      tier: 'EBM Specialist',       defaultRate:  7.41 },
  { group: 'Behavior Intervention – Group',      key: 'bi_grp_ebmprof', code: 'H2014', modifier: 'TF HO HQ', description: 'Behavior Intervention – Group',      tier: 'EBM Professional',     defaultRate:  9.88 },
  // Skill Building / Habilitation (H2014 flat — tech rate regardless of credential)
  { group: 'Skill Building',                     key: 'skill_ind',      code: 'H2014', modifier: 'HA',       description: 'Skill Building / Habilitation – Individual', tier: 'All tiers', defaultRate: 13.54 },
  { group: 'Skill Building',                     key: 'skill_grp',      code: 'H2014', modifier: 'HQ',       description: 'Skill Building / Habilitation – Group',      tier: 'All tiers', defaultRate:  5.41 },
  // Eligibility Screening (H2000)
  { group: 'Eligibility Screening',              key: 'elig_spec',      code: 'H2000', modifier: 'HN',       description: 'Eligibility Screening',              tier: 'Specialist',           defaultRate: 15.48 },
  { group: 'Eligibility Screening',              key: 'elig_prof',      code: 'H2000', modifier: 'HO',       description: 'Eligibility Screening',              tier: 'Professional',         defaultRate: 21.34 },
  { group: 'Eligibility Screening',              key: 'elig_ebmspec',   code: 'H2000', modifier: 'TF HN',    description: 'Eligibility Screening',              tier: 'EBM Specialist',       defaultRate: 17.63 },
  { group: 'Eligibility Screening',              key: 'elig_ebmprof',   code: 'H2000', modifier: 'TF HO',    description: 'Eligibility Screening',              tier: 'EBM Professional',     defaultRate: 21.82 },
  // Assessment / Reassessment (H0032)
  { group: 'Assessment / Reassessment',          key: 'assess_spec',    code: 'H0032', modifier: 'HN',       description: 'Assessment / Reassessment',          tier: 'Specialist',           defaultRate: 15.48 },
  { group: 'Assessment / Reassessment',          key: 'assess_prof',    code: 'H0032', modifier: 'HO',       description: 'Assessment / Reassessment',          tier: 'Professional',         defaultRate: 21.34 },
  { group: 'Assessment / Reassessment',          key: 'assess_ebmspec', code: 'H0032', modifier: 'TF HN',    description: 'Assessment / Reassessment',          tier: 'EBM Specialist',       defaultRate: 17.63 },
  { group: 'Assessment / Reassessment',          key: 'assess_ebmprof', code: 'H0032', modifier: 'TF HO',    description: 'Assessment / Reassessment',          tier: 'EBM Professional',     defaultRate: 21.82 },
  // Crisis Intervention (H2011)
  { group: 'Crisis Intervention',                key: 'crisis_tech',    code: 'H2011', modifier: 'HM',       description: 'Crisis Intervention',                tier: 'Technician',           defaultRate: 13.54 },
  { group: 'Crisis Intervention',                key: 'crisis_spec',    code: 'H2011', modifier: 'HN',       description: 'Crisis Intervention',                tier: 'Specialist',           defaultRate: 15.48 },
  { group: 'Crisis Intervention',                key: 'crisis_prof',    code: 'H2011', modifier: 'HO',       description: 'Crisis Intervention',                tier: 'Professional',         defaultRate: 21.34 },
  { group: 'Crisis Intervention',                key: 'crisis_ebmpara', code: 'H2011', modifier: 'TF',       description: 'Crisis Intervention',                tier: 'EBM Paraprofessional', defaultRate: 14.34 },
  { group: 'Crisis Intervention',                key: 'crisis_ebmspec', code: 'H2011', modifier: 'TF HN',    description: 'Crisis Intervention',                tier: 'EBM Specialist',       defaultRate: 17.63 },
  { group: 'Crisis Intervention',                key: 'crisis_ebmprof', code: 'H2011', modifier: 'TF HO',    description: 'Crisis Intervention',                tier: 'EBM Professional',     defaultRate: 21.82 },
  // Family Education (H0024)
  { group: 'Family Education',                   key: 'family_ind',     code: 'H0024', modifier: '',         description: 'Family Education – Individual',      tier: 'All tiers',            defaultRate: 12.39 },
  { group: 'Family Education',                   key: 'family_grp',     code: 'H0024', modifier: 'HQ',       description: 'Family Education – Group',           tier: 'All tiers',            defaultRate:  4.13 },
  // Community Supports / Habilitation (H2015)
  { group: 'Community Supports',                 key: 'comm_ind',       code: 'H2015', modifier: 'HA',       description: 'Community Supports – Individual',    tier: 'All tiers',            defaultRate:  6.97 },
  { group: 'Community Supports',                 key: 'comm_grp',       code: 'H2015', modifier: 'HQ',       description: 'Community Supports – Group',         tier: 'All tiers',            defaultRate:  2.78 },
  // Respite Care (T1005)
  { group: 'Respite Care',                       key: 'respite_ind',    code: 'T1005', modifier: '',         description: 'Respite Care – Individual',          tier: 'All tiers',            defaultRate:  3.51 },
  { group: 'Respite Care',                       key: 'respite_grp',    code: 'T1005', modifier: 'HQ',       description: 'Respite Care – Group',               tier: 'All tiers',            defaultRate:  1.17 },
];

// Tier → BI individual rate key
const TIER_TO_BI_IND = {
  TECH: 'bi_ind_tech', SPECIALIST: 'bi_ind_spec', PROFESSIONAL: 'bi_ind_prof',
  EBM_PARA: 'bi_ind_ebmpara', EBM_SPEC: 'bi_ind_ebmspec', EBM_PROF: 'bi_ind_ebmprof',
};
// Tier → BI group rate key
const TIER_TO_BI_GRP = {
  TECH: 'bi_grp_tech', SPECIALIST: 'bi_grp_spec', PROFESSIONAL: 'bi_grp_prof',
  EBM_PARA: 'bi_grp_ebmpara', EBM_SPEC: 'bi_grp_ebmspec', EBM_PROF: 'bi_grp_ebmprof',
};
// Tier → assessment rate key (TECH falls back to SPECIALIST rate)
const TIER_TO_ASSESS = {
  TECH: 'assess_spec', SPECIALIST: 'assess_spec', PROFESSIONAL: 'assess_prof',
  EBM_PARA: 'assess_spec', EBM_SPEC: 'assess_ebmspec', EBM_PROF: 'assess_ebmprof',
};
// Tier → crisis rate key
const TIER_TO_CRISIS = {
  TECH: 'crisis_tech', SPECIALIST: 'crisis_spec', PROFESSIONAL: 'crisis_prof',
  EBM_PARA: 'crisis_ebmpara', EBM_SPEC: 'crisis_ebmspec', EBM_PROF: 'crisis_ebmprof',
};

const TIERS = ['TECH', 'SPECIALIST', 'PROFESSIONAL', 'EBM_PARA', 'EBM_SPEC', 'EBM_PROF'];
const TIER_LABELS = {
  TECH:         'Technician',
  SPECIALIST:   'Specialist',
  PROFESSIONAL: 'Professional',
  EBM_PARA:     'EBM Paraprofessional',
  EBM_SPEC:     'EBM Specialist',
  EBM_PROF:     'EBM Professional',
};

// Service phase a participant is in. Reference-only (does not drive the calc) —
// mirrors the CSE phase model but with the CHIS naming: "Initial" (no "intensive"),
// "Stabilization", and "Long-Term Supports". Keys are stable so saved data and the
// label rename never diverge.
export const DDA_PHASES = ['initial', 'stabilization', 'long_term'];
export const DDA_PHASE_LABELS = {
  initial:       'Initial',
  stabilization: 'Stabilization',
  long_term:     'Long-Term Supports',
};

// Pre-built default rates object from the table
const _defaultRates = {};
DDA_RATE_TABLE.forEach(r => { _defaultRates[r.key] = r.defaultRate; });

const effectiveRates = makeEffectiveRates(DDA_RATE_TABLE);

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────
let _ddaUid = 0;
const ddaUid = () => ++_ddaUid;

export function mkDDAParticipant(name = 'New Participant') {
  return {
    id: `ddap_${ddaUid()}`,
    name,
    phase: 'initial',
    services: {
      biInd:      { hrPerWk: 10 },
      biGrp:      { hrPerWk: 0,  groupSize: 4 },
      skillInd:   { hrPerWk: 0 },
      skillGrp:   { hrPerWk: 0,  groupSize: 4 },
      familyInd:  { hrPerMonth: 0 },
      familyGrp:  { hrPerMonth: 0, groupSize: 4 },
      commInd:    { hrPerWk: 0 },
      commGrp:    { hrPerWk: 0,  groupSize: 4 },
      respiteInd: { hrPerWk: 0 },
      respiteGrp: { hrPerWk: 0,  groupSize: 4 },
      assessment: { sessionsPerYear: 0 },
      crisis:     { hrPerMonth: 0 },
    },
  };
}

export function mkDDAProvider(name = 'New Provider', tier = 'SPECIALIST', hourlyWage = 22) {
  return {
    id: `ddapv_${ddaUid()}`,
    name,
    tier,
    hourlyWage,
    officeName: '',
    supervisorId: null,   // FK into config.supervisors (null = unassigned)
    participants: [],
  };
}

export function mkDDASupervisor(name = 'New Supervisor', salary = 65000) {
  return {
    id: `ddasup_${ddaUid()}`,
    name,
    salary,
  };
}

export function defaultChildrensDDAConfig() {
  return {
    providers: [],
    supervisors: [],
    supervision: { count: 1, salary: 65000, providersPerSupervisor: 8 },
    seasonality:  { enabled: false, summerMultiplier: 0.7, holidayReductionPct: 10 },
    productivity: { billableHrsPerDay: 5.5, cancellationRate: 12, driveTimePct: 15, documentationTimePct: 20 },
    payrollBurdenPct:  22,
    defaultHourlyWage: 22,
    defaultTier:       'SPECIALIST',
    rateOverrides:     {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy migration: the supervision layer used to be a single settings panel
// (`supervision.{count,salary,providersPerSupervisor}`) with no named entities,
// and providers carried no supervisor link. The Caseload tab needs real
// `supervisors[]` with a `supervisorId` FK on each provider. This synthesizes
// `supervision.count` named supervisors from the legacy settings and backfills a
// null `supervisorId` on every provider (→ "unassigned" until reassigned). The
// legacy `supervision` block is preserved as the ratio/fallback source.
// Idempotent: returns the same config reference once nothing legacy remains, so
// callers can guard a one-shot persist on a referential change.
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeChildrensDDA(config = {}) {
  const providers = config.providers ?? [];
  const hasSupervisors    = Array.isArray(config.supervisors);
  const providersNeedFK   = providers.some(pv => pv.supervisorId === undefined);
  if (hasSupervisors && !providersNeedFK) return config;

  const sup = config.supervision ?? { count: 1, salary: 65000 };
  let supervisors = config.supervisors;
  if (!Array.isArray(supervisors)) {
    const count = Math.max(0, sup.count ?? 1);
    supervisors = Array.from({ length: count }, (_, i) =>
      mkDDASupervisor(`Supervisor ${i + 1}`, sup.salary ?? 65000));
  }

  const migratedProviders = providers.map(pv =>
    pv.supervisorId === undefined ? { ...pv, supervisorId: null } : pv);

  return { ...config, supervisors, providers: migratedProviders };
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculators
// ─────────────────────────────────────────────────────────────────────────────

export function calcDDAParticipant(p, tier = 'SPECIALIST', rates = _defaultRates) {
  const svc = p.services ?? {};

  // Individual service hours per month (backward-compat field names via ??)
  const biIndHrMo      = (svc.biInd?.hrPerWk      ?? svc.biIndividual?.hrPerWk  ?? 0) * 4.33;
  const skillIndHrMo   = (svc.skillInd?.hrPerWk   ?? svc.skillBuilding?.hrPerWk ?? 0) * 4.33;
  const commIndHrMo    = (svc.commInd?.hrPerWk     ?? 0) * 4.33;
  const respiteIndHrMo = (svc.respiteInd?.hrPerWk  ?? 0) * 4.33;
  const familyIndHrMo  = (svc.familyInd?.hrPerMonth ?? svc.familyEd?.hrPerMonth ?? 0);
  const crisisHrMo     = (svc.crisis?.hrPerMonth    ?? 0);
  const assessSessMo   = (svc.assessment?.sessionsPerYear ?? 0) / 12; // each session ≈ 1 hr

  // Group service hours + group sizes (provider time shared across participants)
  const biGrpHrMo      = (svc.biGrp?.hrPerWk      ?? svc.biGroup?.hrPerWk ?? 0) * 4.33;
  const biGrpSize      = Math.max(1, svc.biGrp?.groupSize ?? svc.biGroup?.groupSize ?? 4);
  const skillGrpHrMo   = (svc.skillGrp?.hrPerWk   ?? 0) * 4.33;
  const skillGrpSize   = Math.max(1, svc.skillGrp?.groupSize ?? 4);
  const familyGrpHrMo  = (svc.familyGrp?.hrPerMonth ?? 0);
  const familyGrpSize  = Math.max(1, svc.familyGrp?.groupSize ?? 4);
  const commGrpHrMo    = (svc.commGrp?.hrPerWk     ?? 0) * 4.33;
  const commGrpSize    = Math.max(1, svc.commGrp?.groupSize ?? 4);
  const respiteGrpHrMo = (svc.respiteGrp?.hrPerWk  ?? 0) * 4.33;
  const respiteGrpSize = Math.max(1, svc.respiteGrp?.groupSize ?? 4);

  const R = key => rates[key] ?? _defaultRates[key] ?? 0;

  // Revenue: each participant billed per unit (4 units/hr) at their applicable rate
  const monthlyRev =
    biIndHrMo      * 4 * R(TIER_TO_BI_IND[tier] ?? 'bi_ind_spec') +
    biGrpHrMo      * 4 * R(TIER_TO_BI_GRP[tier] ?? 'bi_grp_spec') +
    skillIndHrMo   * 4 * R('skill_ind') +
    skillGrpHrMo   * 4 * R('skill_grp') +
    familyIndHrMo  * 4 * R('family_ind') +
    familyGrpHrMo  * 4 * R('family_grp') +
    commIndHrMo    * 4 * R('comm_ind') +
    commGrpHrMo    * 4 * R('comm_grp') +
    respiteIndHrMo * 4 * R('respite_ind') +
    respiteGrpHrMo * 4 * R('respite_grp') +
    crisisHrMo     * 4 * R(TIER_TO_CRISIS[tier] ?? 'crisis_spec') +
    assessSessMo   * 4 * R(TIER_TO_ASSESS[tier] ?? 'assess_spec');

  // Billed hours = hours the participant actually receives (for reporting)
  const billedHrsPerMonth =
    biIndHrMo + biGrpHrMo + skillIndHrMo + skillGrpHrMo +
    familyIndHrMo + familyGrpHrMo + commIndHrMo + commGrpHrMo +
    respiteIndHrMo + respiteGrpHrMo + crisisHrMo + assessSessMo;

  // Provider hours = actual provider time required
  // Group services: provider time is shared — divide by group size
  const providerHrsPerMonth =
    biIndHrMo + biGrpHrMo / biGrpSize +
    skillIndHrMo + skillGrpHrMo / skillGrpSize +
    familyIndHrMo + familyGrpHrMo / familyGrpSize +
    commIndHrMo + commGrpHrMo / commGrpSize +
    respiteIndHrMo + respiteGrpHrMo / respiteGrpSize +
    crisisHrMo + assessSessMo;

  return {
    monthlyRev,
    annualRev:           monthlyRev * 12,
    billedHrsPerMonth,
    providerHrsPerMonth,
    monthlyHours:        billedHrsPerMonth,  // backward-compat alias
    annualHours:         billedHrsPerMonth * 12,
  };
}

export function calcDDAProvider(pv, payrollBurdenPct = 22, rates = _defaultRates) {
  const px = (pv.participants ?? []).map(p => calcDDAParticipant(p, pv.tier, rates));

  const monthlyRev      = px.reduce((a, p) => a + p.monthlyRev, 0);
  const monthlyBillable = px.reduce((a, p) => a + p.billedHrsPerMonth, 0);
  const monthlyProvHrs  = px.reduce((a, p) => a + p.providerHrsPerMonth, 0);
  const adminMonthly    = 5 * 4.33;  // 5 admin hrs/week
  const totalMonthlyHrs = monthlyProvHrs + adminMonthly;

  const burden       = 1 + (payrollBurdenPct ?? 22) / 100;
  const monthlyLabor = totalMonthlyHrs * (pv.hourlyWage ?? 22) * burden;
  const annualLabor  = monthlyLabor * 12;
  const annualRev    = monthlyRev * 12;
  const gross        = annualRev - annualLabor;
  const FTE_HRS      = 160;

  return {
    px,
    caseloadSize:    (pv.participants ?? []).length,
    monthlyRev,
    annualRev,
    monthlyBillable,
    monthlyProvHrs,
    adminMonthly,
    totalMonthlyHrs,
    monthlyLabor,
    annualLabor,
    gross,
    grossMargin:    annualRev > 0 ? gross / annualRev : 0,
    utilization:    totalMonthlyHrs / FTE_HRS,
    billableShare:  totalMonthlyHrs > 0 ? monthlyProvHrs / totalMonthlyHrs : 0,
  };
}

export function calcChildrensDDAService(config) {
  const payrollBurdenPct = config.payrollBurdenPct ?? 22;
  const rates            = effectiveRates(config.rateOverrides ?? {});

  const providers = (config.providers ?? []).map(pv => ({
    ...pv,
    metrics: calcDDAProvider(pv, payrollBurdenPct, rates),
  }));

  const totalCaseload  = providers.reduce((a, pv) => a + pv.metrics.caseloadSize, 0);
  const totalAnnualRev = providers.reduce((a, pv) => a + pv.metrics.annualRev, 0);
  const totalAnnualLab = providers.reduce((a, pv) => a + pv.metrics.annualLabor, 0);

  // Supervision cost: prefer the named supervisors[] list (sum of salaries);
  // fall back to the legacy supervision.{count,salary} settings for configs not
  // yet run through normalizeChildrensDDA.
  const sup = config.supervision ?? { count: 1, salary: 65000 };
  const supervisorList = Array.isArray(config.supervisors) ? config.supervisors : null;
  const supervisorCount = supervisorList ? supervisorList.length : (sup.count ?? 1);
  const salaryTotal = supervisorList
    ? supervisorList.reduce((a, s) => a + (s.salary ?? sup.salary ?? 65000), 0)
    : (sup.count ?? 1) * (sup.salary ?? 65000);
  const supervisionCost = salaryTotal * (1 + payrollBurdenPct / 100);

  const totalGross = totalAnnualRev - totalAnnualLab - supervisionCost;

  return {
    providers,
    totalCaseload,
    totalAnnualRev,
    totalAnnualLabor:  totalAnnualLab,
    supervisionCost,
    supervisorCount,
    totalGross,
    totalMargin:   totalAnnualRev > 0 ? totalGross / totalAnnualRev : 0,
    providerCount: providers.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────
const $k  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const $r  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = n => `${(n * 100).toFixed(1)}%`;
const M   = { fontFamily: "'DM Mono',monospace" };

const card = {
  background: "#ffffff", borderRadius: 10, padding: 14,
  border: "1px solid #d0dae8", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const labelStyle = {
  fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5, ...M,
};

const numInput = {
  width: 60, padding: "3px 6px", border: "1px solid #c8d4e4",
  borderRadius: 5, fontSize: 12, ...M, textAlign: "right", background: "#fff",
};

const textInput = {
  padding: "4px 8px", border: "1px solid #c8d4e4",
  borderRadius: 5, fontSize: 13, fontFamily: "'Sora',sans-serif", background: "#fff",
};

function Stat({ label, value, color = "#5a3800" }) {
  return (
    <div style={{ background: "#eef1f6", borderRadius: 7, padding: "6px 12px", border: "1px solid #d0dae8" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, ...M, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SvcInput({ label, value, onChange, step = 0.5, max = 40, sublabel, ro = false }) {
  return (
    <div style={{ minWidth: 70 }}>
      <div style={labelStyle}>{label}</div>
      {sublabel && <div style={{ fontSize: 8, color: "#94a3b8", ...M }}>{sublabel}</div>}
      <input type="number" min={0} max={max} step={step}
        value={value}
        onChange={e => onChange(+e.target.value)}
        readOnly={ro}
        style={{ ...numInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Expandable participant row
// ─────────────────────────────────────────────────────────────────────────────
function DDAParticipantRow({ p, tier, rates, onUpdate, onRemove, userRole, canEdit }) {
  const [expanded, setExpanded] = useState(false);
  const m   = calcDDAParticipant(p, tier, rates);
  const svc = p.services ?? {};
  const ro  = !canEdit;

  const upd = (field, partial) => onUpdate(p.id, "services", { ...svc, [field]: { ...(svc[field] ?? {}), ...partial } });

  return (
    <div style={{ borderRadius: 6, background: "#f7f9fc", border: "1px solid #e2e8f0", overflow: "hidden" }}>
      {/* Compact header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
        <button onClick={() => setExpanded(e => !e)} style={{
          border: "none", background: "transparent", cursor: "pointer",
          fontSize: 12, color: "#5a3800", width: 18, flexShrink: 0,
        }}>{expanded ? "▼" : "▶"}</button>
        <input type="text" value={p.name}
          onChange={e => onUpdate(p.id, "name", e.target.value)}
          readOnly={ro}
          style={{ ...textInput, flex: 1, fontSize: 12, minWidth: 100, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        <select value={p.phase ?? 'initial'}
          onChange={e => onUpdate(p.id, "phase", e.target.value)}
          disabled={ro}
          title="Service phase"
          style={{ ...textInput, fontSize: 11, padding: "3px 6px", flexShrink: 0, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}>
          {DDA_PHASES.map(ph => <option key={ph} value={ph}>{DDA_PHASE_LABELS[ph]}</option>)}
        </select>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {canSeeCompanyDollars(userRole) && <div style={{ fontSize: 13, fontWeight: 700, color: "#5a3800", ...M }}>{$k(m.monthlyRev)}/mo</div>}
          <div style={{ fontSize: 9, color: "#64748b", ...M }}>
            {m.billedHrsPerMonth.toFixed(1)} billed · {m.providerHrsPerMonth.toFixed(1)} prov hr/mo
          </div>
        </div>
        {canEdit && <button onClick={() => onRemove(p.id)} style={{
          border: "none", background: "transparent", cursor: "pointer",
          color: "#cf6e6e", fontSize: 14, padding: 4, flexShrink: 0,
        }}>✕</button>}
        {!canEdit && <span style={{ width: 22, flexShrink: 0 }}/>}
      </div>

      {/* Expanded service editor */}
      {expanded && (
        <div style={{ padding: "0 10px 14px 36px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, paddingTop: 12 }}>

            {/* Behavior Intervention */}
            <div>
              <div style={{ ...labelStyle, color: "#3b5fc0", marginBottom: 6 }}>Behavior Intervention (H2014)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SvcInput label="BI Ind hr/wk" ro={ro}
                  value={svc.biInd?.hrPerWk ?? svc.biIndividual?.hrPerWk ?? 0}
                  onChange={v => upd("biInd", { hrPerWk: v })}/>
                <SvcInput label="BI Grp hr/wk" ro={ro}
                  value={svc.biGrp?.hrPerWk ?? svc.biGroup?.hrPerWk ?? 0}
                  onChange={v => upd("biGrp", { hrPerWk: v })}/>
                <SvcInput label="Group size" sublabel="participants" ro={ro}
                  value={svc.biGrp?.groupSize ?? 4} max={12} step={1}
                  onChange={v => upd("biGrp", { groupSize: Math.max(1, v) })}/>
              </div>
            </div>

            {/* Skill Building */}
            <div>
              <div style={{ ...labelStyle, color: "#3b5fc0", marginBottom: 6 }}>Skill Building (H2014)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SvcInput label="Skill Ind hr/wk" ro={ro}
                  value={svc.skillInd?.hrPerWk ?? svc.skillBuilding?.hrPerWk ?? 0}
                  onChange={v => upd("skillInd", { hrPerWk: v })}/>
                <SvcInput label="Skill Grp hr/wk" ro={ro}
                  value={svc.skillGrp?.hrPerWk ?? 0}
                  onChange={v => upd("skillGrp", { hrPerWk: v })}/>
                <SvcInput label="Group size" sublabel="participants" ro={ro}
                  value={svc.skillGrp?.groupSize ?? 4} max={12} step={1}
                  onChange={v => upd("skillGrp", { groupSize: Math.max(1, v) })}/>
              </div>
            </div>

            {/* Family Education */}
            <div>
              <div style={{ ...labelStyle, color: "#3b5fc0", marginBottom: 6 }}>Family Education (H0024)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SvcInput label="Family Ind hr/mo" max={80} ro={ro}
                  value={svc.familyInd?.hrPerMonth ?? svc.familyEd?.hrPerMonth ?? 0}
                  onChange={v => upd("familyInd", { hrPerMonth: v })}/>
                <SvcInput label="Family Grp hr/mo" max={80} ro={ro}
                  value={svc.familyGrp?.hrPerMonth ?? 0}
                  onChange={v => upd("familyGrp", { hrPerMonth: v })}/>
                <SvcInput label="Group size" sublabel="participants" ro={ro}
                  value={svc.familyGrp?.groupSize ?? 4} max={12} step={1}
                  onChange={v => upd("familyGrp", { groupSize: Math.max(1, v) })}/>
              </div>
            </div>

            {/* Community Supports */}
            <div>
              <div style={{ ...labelStyle, color: "#3b5fc0", marginBottom: 6 }}>Community Supports (H2015)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SvcInput label="Comm Ind hr/wk" ro={ro}
                  value={svc.commInd?.hrPerWk ?? 0}
                  onChange={v => upd("commInd", { hrPerWk: v })}/>
                <SvcInput label="Comm Grp hr/wk" ro={ro}
                  value={svc.commGrp?.hrPerWk ?? 0}
                  onChange={v => upd("commGrp", { hrPerWk: v })}/>
                <SvcInput label="Group size" sublabel="participants" ro={ro}
                  value={svc.commGrp?.groupSize ?? 4} max={12} step={1}
                  onChange={v => upd("commGrp", { groupSize: Math.max(1, v) })}/>
              </div>
            </div>

            {/* Respite Care */}
            <div>
              <div style={{ ...labelStyle, color: "#3b5fc0", marginBottom: 6 }}>Respite Care (T1005)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SvcInput label="Respite Ind hr/wk" ro={ro}
                  value={svc.respiteInd?.hrPerWk ?? 0}
                  onChange={v => upd("respiteInd", { hrPerWk: v })}/>
                <SvcInput label="Respite Grp hr/wk" ro={ro}
                  value={svc.respiteGrp?.hrPerWk ?? 0}
                  onChange={v => upd("respiteGrp", { hrPerWk: v })}/>
                <SvcInput label="Group size" sublabel="participants" ro={ro}
                  value={svc.respiteGrp?.groupSize ?? 4} max={12} step={1}
                  onChange={v => upd("respiteGrp", { groupSize: Math.max(1, v) })}/>
              </div>
            </div>

            {/* Assessment & Crisis */}
            <div>
              <div style={{ ...labelStyle, color: "#3b5fc0", marginBottom: 6 }}>Assessment & Crisis</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SvcInput label="Assess sessions/yr" sublabel="≈1hr each" ro={ro}
                  value={svc.assessment?.sessionsPerYear ?? 0} max={12} step={1}
                  onChange={v => upd("assessment", { sessionsPerYear: v })}/>
                <SvcInput label="Crisis hr/mo" sublabel="H2011" ro={ro}
                  value={svc.crisis?.hrPerMonth ?? 0} max={40}
                  onChange={v => upd("crisis", { hrPerMonth: v })}/>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider card
// ─────────────────────────────────────────────────────────────────────────────
function DDAProviderCard({ pv, payrollBurdenPct, rates, onUpdate, onRemove, onAddParticipant, onUpdateParticipant, onRemoveParticipant, userRole, canEdit }) {
  const [expanded, setExpanded] = useState(true);
  const m = calcDDAProvider(pv, payrollBurdenPct, rates);
  const ro = !canEdit;

  const utilColor   = m.utilization > 1.05 ? "#cf6e6e" : m.utilization > 0.85 ? "#22c55e" : m.utilization > 0.65 ? "#f59e0b" : "#cf6e6e";
  const marginColor = m.grossMargin > 0.35 ? "#22c55e" : m.grossMargin > 0.15 ? "#f59e0b" : "#cf6e6e";

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={() => setExpanded(e => !e)} style={{
          border: "none", background: "transparent", cursor: "pointer",
          fontSize: 14, color: "#5a3800", width: 20,
        }}>{expanded ? "▼" : "▶"}</button>

        <input type="text" value={pv.name}
          onChange={e => onUpdate(pv.id, "name", e.target.value)}
          readOnly={ro}
          style={{ ...textInput, fontWeight: 700, flex: 1, minWidth: 120, fontSize: 14, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>

        <div>
          <div style={labelStyle}>Tier</div>
          <select value={pv.tier}
            onChange={e => onUpdate(pv.id, "tier", e.target.value)}
            disabled={ro}
            style={{ ...textInput, fontSize: 11, padding: "3px 6px", pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}>
            {TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
          </select>
        </div>

        {wageDisplayMode(userRole) !== 'hidden' && (
          <div>
            <div style={labelStyle}>Wage / hr</div>
            <input type="number" min={10} max={80} step={0.5} value={pv.hourlyWage}
              onChange={e => onUpdate(pv.id, "hourlyWage", +e.target.value)}
              readOnly={wageDisplayMode(userRole) !== 'dollars' || ro}
              style={{ ...numInput, pointerEvents: (wageDisplayMode(userRole) !== 'dollars' || ro) ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
          </div>
        )}

        <div>
          <div style={labelStyle}>Office</div>
          <input type="text" value={pv.officeName ?? ''}
            onChange={e => onUpdate(pv.id, "officeName", e.target.value)}
            readOnly={ro}
            placeholder="optional"
            style={{ ...textInput, width: 90, fontSize: 11, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>

        {canEdit && <button onClick={() => onRemove(pv.id)} style={{
          border: "1px solid #e8d4d4", background: "#fff5f5",
          color: "#a14848", padding: "4px 10px", borderRadius: 5,
          fontSize: 10, cursor: "pointer", ...M,
        }}>Remove</button>}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: expanded ? 12 : 0 }}>
        <Stat label="Caseload"        value={m.caseloadSize} />
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Rev"   value={$k(m.annualRev)} color="#D4A520"/>}
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Labor" value={$k(m.annualLabor)} />}
        {canSeeCompanyDollars(userRole) && <Stat label="Gross"        value={$k(m.gross)} color={marginColor}/>}
        <Stat label="Margin"          value={pct(m.grossMargin)} color={marginColor}/>
        <Stat label="Utilization"     value={pct(m.utilization)} color={utilColor}/>
        <Stat label="Billable share"  value={pct(m.billableShare)} />
      </div>

      {expanded && (
        <div>
          <div style={{ fontSize: 9, color: "#94a3b8", ...M, marginBottom: 6, marginLeft: 2 }}>
            Provider hours use group-service efficiency (group hrs ÷ group size). Click ▶ on a participant to edit services.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(pv.participants ?? []).map(p =>
              <DDAParticipantRow key={p.id} p={p} tier={pv.tier} rates={rates}
                onUpdate={(id, f, v) => onUpdateParticipant(pv.id, id, f, v)}
                onRemove={(id) => onRemoveParticipant(pv.id, id)}
                userRole={userRole}
                canEdit={canEdit}/>
            )}
          </div>
          {canEdit && <button onClick={() => onAddParticipant(pv.id)} style={{
            marginTop: 10, padding: "6px 14px",
            background: "#fff", border: "1px dashed #c8d4e4", borderRadius: 6,
            color: "#5a3800", cursor: "pointer", fontSize: 12, fontWeight: 600, ...M,
          }}>+ Add participant</button>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Roster tab
// ─────────────────────────────────────────────────────────────────────────────
export function ChildrensDDARosterTab({ config, onUpdate, userRole }) {
  const summary  = calcChildrensDDAService(config);
  const rates    = effectiveRates(config.rateOverrides ?? {});
  const canEdit  = canEditServiceLines(userRole);
  const ro       = !canEdit;

  const updateField = (field, value) => onUpdate({ ...config, [field]: value });

  const updateProvider = (pvId, field, value) =>
    onUpdate({ ...config, providers: config.providers.map(pv => pv.id === pvId ? { ...pv, [field]: value } : pv) });

  const removeProvider = (pvId) =>
    onUpdate({ ...config, providers: config.providers.filter(pv => pv.id !== pvId) });

  const addProvider = () =>
    onUpdate({
      ...config,
      providers: [
        ...config.providers,
        mkDDAProvider(`Provider ${config.providers.length + 1}`, config.defaultTier ?? 'SPECIALIST', config.defaultHourlyWage ?? 22),
      ],
    });

  const addParticipant = (pvId) =>
    onUpdate({
      ...config,
      providers: config.providers.map(pv =>
        pv.id === pvId
          ? { ...pv, participants: [...(pv.participants ?? []), mkDDAParticipant(`Participant ${(pv.participants ?? []).length + 1}`)] }
          : pv
      ),
    });

  const updateParticipant = (pvId, pId, field, value) =>
    onUpdate({
      ...config,
      providers: config.providers.map(pv =>
        pv.id === pvId
          ? { ...pv, participants: pv.participants.map(p => p.id === pId ? { ...p, [field]: value } : p) }
          : pv
      ),
    });

  const removeParticipant = (pvId, pId) =>
    onUpdate({
      ...config,
      providers: config.providers.map(pv =>
        pv.id === pvId
          ? { ...pv, participants: pv.participants.filter(p => p.id !== pId) }
          : pv
      ),
    });

  const sup = config.supervision ?? { count: 1, salary: 65000, providersPerSupervisor: 8 };
  const updateSup = (field, val) => updateField("supervision", { ...sup, [field]: val });

  return (
    // ph-no-capture: roster shows provider/participant names — keep out of replay & autocapture.
    <div className="ph-no-capture">
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <Stat label="Providers"      value={summary.providerCount} />
        <Stat label="Total caseload" value={summary.totalCaseload} />
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Rev"   value={$k(summary.totalAnnualRev)} color="#D4A520"/>}
        {canSeeCompanyDollars(userRole) && <Stat label="Direct Labor" value={$k(summary.totalAnnualLabor)} />}
        {canSeeCompanyDollars(userRole) && <Stat label="Supervision"  value={$k(summary.supervisionCost)} />}
        {canSeeCompanyDollars(userRole) && <Stat label="Gross"        value={$k(summary.totalGross)} color={summary.totalMargin > 0.25 ? "#22c55e" : "#cf6e6e"}/>}
        <Stat label="Margin"         value={pct(summary.totalMargin)} color={summary.totalMargin > 0.25 ? "#22c55e" : "#cf6e6e"}/>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={labelStyle}>Burden %</span>
          <input type="number" min={0} max={50} step={0.5} value={config.payrollBurdenPct ?? 22}
            onChange={e => updateField("payrollBurdenPct", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
      </div>

      {/* Supervision settings */}
      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ ...labelStyle, fontSize: 10 }}>Clinical Supervision</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={labelStyle}>Supervisors</span>
          <input type="number" min={0} max={20} value={sup.count ?? 1}
            onChange={e => updateSup("count", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width: 48, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={labelStyle}>Supervisor salary</span>
          <input type="number" min={30000} max={200000} step={1000} value={sup.salary ?? 65000}
            onChange={e => updateSup("salary", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width: 80, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={labelStyle}>Providers / supervisor</span>
          <input type="number" min={1} max={20} value={sup.providersPerSupervisor ?? 8}
            onChange={e => updateSup("providersPerSupervisor", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width: 48, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        {canSeeCompanyDollars(userRole) && (
          <div style={{ fontSize: 10, color: "#64748b", ...M }}>
            Annual cost: {$k((sup.count ?? 1) * (sup.salary ?? 65000) * (1 + (config.payrollBurdenPct ?? 22) / 100))}
          </div>
        )}
      </div>

      {/* Provider cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {config.providers.length === 0 && (
          <div style={{ ...card, textAlign: "center", padding: 40, color: "#64748b" }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>No providers yet.</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Add a provider to start building your Children's DDA caseload model.</div>
          </div>
        )}
        {config.providers.map(pv =>
          <DDAProviderCard key={pv.id} pv={pv}
            payrollBurdenPct={config.payrollBurdenPct}
            rates={rates}
            onUpdate={updateProvider}
            onRemove={removeProvider}
            onAddParticipant={addParticipant}
            onUpdateParticipant={updateParticipant}
            onRemoveParticipant={removeParticipant}
            userRole={userRole}
            canEdit={canEdit}/>
        )}
      </div>

      {canEdit && <button onClick={addProvider} style={{
        marginTop: 16, padding: "8px 18px",
        background: "#D4A520", border: "none", borderRadius: 6,
        color: "#5a3800", cursor: "pointer", fontSize: 12, fontWeight: 700, ...M,
      }}>+ Add provider</button>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Productivity tab
// ─────────────────────────────────────────────────────────────────────────────
export function ChildrensDDAProductivityTab({ config, userRole }) {
  const summary = calcChildrensDDAService(config);
  const prod    = config.productivity ?? {};

  if (summary.providerCount === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 40, color: "#64748b" }}>
        <div style={{ fontSize: 13 }}>Add providers in the Roster tab to see productivity analysis.</div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ ...M, fontSize: 14, color: "#5a3800", margin: "0 0 14px 0", letterSpacing: 1, textTransform: "uppercase" }}>
        Provider productivity
      </h3>

      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={labelStyle}>Billable hrs / day assumption</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#5a3800", ...M }}>{prod.billableHrsPerDay ?? 5.5}</div>
        </div>
        <div>
          <div style={labelStyle}>Cancellation rate</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b", ...M }}>{prod.cancellationRate ?? 12}%</div>
        </div>
        <div>
          <div style={labelStyle}>Drive time</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#64748b", ...M }}>{prod.driveTimePct ?? 15}%</div>
        </div>
        <div>
          <div style={labelStyle}>Documentation time</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#64748b", ...M }}>{prod.documentationTimePct ?? 20}%</div>
        </div>
        <div>
          <div style={labelStyle}>Effective billable %</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e", ...M }}>
            {(100 - (prod.cancellationRate ?? 12) - (prod.driveTimePct ?? 15) - (prod.documentationTimePct ?? 20)).toFixed(0)}%
          </div>
        </div>
        <div>
          <div style={labelStyle}>Supervision ratio</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#5a3800", ...M }}>
            {summary.providerCount} : {summary.supervisorCount}
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1.6fr 0.7fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr",
          padding: "10px 14px", background: "#eef1f6", borderBottom: "1px solid #d0dae8", ...labelStyle,
        }}>
          <span>Provider</span>
          <span style={{ textAlign: "right" }}>Tier</span>
          <span style={{ textAlign: "right" }}>Caseload</span>
          <span style={{ textAlign: "right" }}>Billed hr/mo</span>
          <span style={{ textAlign: "right" }}>Prov hr/mo</span>
          <span style={{ textAlign: "right" }}>Total hr/mo</span>
          <span style={{ textAlign: "right" }}>Utilization</span>
          <span style={{ textAlign: "right" }}>Margin</span>
        </div>
        {summary.providers.map(pv => {
          const utilColor   = pv.metrics.utilization > 1.05 ? "#cf6e6e" : pv.metrics.utilization > 0.85 ? "#22c55e" : pv.metrics.utilization > 0.65 ? "#f59e0b" : "#cf6e6e";
          const marginColor = pv.metrics.grossMargin > 0.35 ? "#22c55e" : pv.metrics.grossMargin > 0.15 ? "#f59e0b" : "#cf6e6e";
          return (
            <div key={pv.id} style={{
              display: "grid", gridTemplateColumns: "1.6fr 0.7fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr",
              padding: "10px 14px", borderBottom: "1px solid #f1f5f9", alignItems: "center", fontSize: 12, ...M,
            }}>
              <span style={{ color: "#5a3800", fontWeight: 600 }}>{pv.name}</span>
              <span style={{ textAlign: "right", fontSize: 10, color: "#475569" }}>{TIER_LABELS[pv.tier] ?? pv.tier}</span>
              <span style={{ textAlign: "right", color: "#334155" }}>{pv.metrics.caseloadSize}</span>
              <span style={{ textAlign: "right", color: "#334155" }}>{pv.metrics.monthlyBillable.toFixed(1)}</span>
              <span style={{ textAlign: "right", color: "#334155" }}>{pv.metrics.monthlyProvHrs.toFixed(1)}</span>
              <span style={{ textAlign: "right", color: "#334155" }}>{pv.metrics.totalMonthlyHrs.toFixed(1)}</span>
              <span style={{ textAlign: "right", color: utilColor, fontWeight: 700 }}>{pct(pv.metrics.utilization)}</span>
              <span style={{ textAlign: "right", color: marginColor, fontWeight: 700 }}>{pct(pv.metrics.grossMargin)}</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, padding: 14, background: "#fffbe8", border: "1px solid #f4e4a8", borderRadius: 8, fontSize: 11, color: "#5a3800", ...M, lineHeight: 1.6 }}>
        {(() => {
          const supCount   = summary.supervisorCount;
          const ratioBase  = Math.max(1, supCount);
          const ratio      = summary.providerCount / ratioBase;
          const target     = config.supervision?.providersPerSupervisor ?? 8;
          return <>
            <strong>Supervision note:</strong> {summary.providerCount} direct providers ÷ {supCount} supervisor{supCount !== 1 ? 's' : ''} =&nbsp;
            {summary.providerCount > 0 ? ratio.toFixed(1) : 0} providers/supervisor
            (target: ≤{target}).&nbsp;
            {ratio > target
              ? "⚠️ Over ratio — consider adding a supervisor."
              : "✓ Within recommended ratio."}
          </>;
        })()}
      </div>
      <div style={{ marginTop: 10, padding: 12, background: "#f7f9fc", border: "1px solid #d0dae8", borderRadius: 8, fontSize: 10, color: "#64748b", ...M }}>
        <strong>Group service note:</strong> "Prov hr/mo" shows the actual provider time after applying group efficiency
        (group hrs ÷ group size). "Billed hr/mo" shows total hours the participant receives, which drives revenue.
        Utilization is based on provider hours, not billed hours.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// P&L tab (with optional office grouping)
// ─────────────────────────────────────────────────────────────────────────────
export function ChildrensDDAPLTab({ config, userRole }) {
  const summary     = calcChildrensDDAService(config);
  const showDollars = canSeeCompanyDollars(userRole);

  if (summary.providerCount === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 40, color: "#64748b" }}>
        <div style={{ fontSize: 13 }}>Add providers in the Roster tab to see P&amp;L.</div>
      </div>
    );
  }

  const offices = {};
  summary.providers.forEach(pv => {
    const key = pv.officeName?.trim() || '— Unassigned —';
    (offices[key] = offices[key] || []).push(pv);
  });
  const isMultiOffice = Object.keys(offices).some(k => k !== '— Unassigned —');

  const cols = showDollars ? "2fr 1fr 1fr 1fr 1fr" : "2fr 1fr";
  const rowStyle = {
    display: "grid", gridTemplateColumns: cols,
    padding: "10px 14px", borderBottom: "1px solid #f1f5f9", fontSize: 12, ...M,
  };

  const renderProviderRow = (pv) => (
    <div key={pv.id} style={rowStyle}>
      <span style={{ color: "#5a3800", fontWeight: 600 }}>{pv.name}
        <span style={{ fontSize: 9, color: "#94a3b8", marginLeft: 6 }}>{TIER_LABELS[pv.tier] ?? pv.tier}</span>
      </span>
      {showDollars && <span style={{ textAlign: "right", color: "#D4A520" }}>{$k(pv.metrics.annualRev)}</span>}
      {showDollars && <span style={{ textAlign: "right", color: "#334155" }}>{$k(pv.metrics.annualLabor)}</span>}
      {showDollars && <span style={{ textAlign: "right", color: pv.metrics.gross > 0 ? "#22c55e" : "#cf6e6e" }}>{$k(pv.metrics.gross)}</span>}
      <span style={{ textAlign: "right", color: pv.metrics.grossMargin > 0.3 ? "#22c55e" : pv.metrics.grossMargin > 0.15 ? "#f59e0b" : "#cf6e6e" }}>
        {pct(pv.metrics.grossMargin)}
      </span>
    </div>
  );

  const renderOfficeSubtotal = (pvs, label) => {
    const rev   = pvs.reduce((a, pv) => a + pv.metrics.annualRev, 0);
    const labor = pvs.reduce((a, pv) => a + pv.metrics.annualLabor, 0);
    const gross = rev - labor;
    return (
      <div key={`sub_${label}`} style={{ ...rowStyle, background: "#f7f9fc", fontWeight: 700, borderTop: "1px solid #d0dae8" }}>
        <span style={{ color: "#475569" }}>{label} subtotal</span>
        {showDollars && <span style={{ textAlign: "right", color: "#D4A520" }}>{$k(rev)}</span>}
        {showDollars && <span style={{ textAlign: "right", color: "#334155" }}>{$k(labor)}</span>}
        {showDollars && <span style={{ textAlign: "right", color: gross > 0 ? "#22c55e" : "#cf6e6e" }}>{$k(gross)}</span>}
        <span style={{ textAlign: "right", color: rev > 0 && gross / rev > 0.3 ? "#22c55e" : "#f59e0b" }}>{rev > 0 ? pct(gross / rev) : "—"}</span>
      </div>
    );
  };

  return (
    <div>
      <h3 style={{ ...M, fontSize: 14, color: "#5a3800", margin: "0 0 14px 0", letterSpacing: 1, textTransform: "uppercase" }}>
        Children's DDA service line P&amp;L
      </h3>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: cols,
          padding: "10px 14px", background: "#eef1f6", borderBottom: "1px solid #d0dae8", ...labelStyle,
        }}>
          <span>Provider</span>
          {showDollars && <span style={{ textAlign: "right" }}>Annual Rev</span>}
          {showDollars && <span style={{ textAlign: "right" }}>Annual Labor</span>}
          {showDollars && <span style={{ textAlign: "right" }}>Gross</span>}
          <span style={{ textAlign: "right" }}>Margin</span>
        </div>

        {isMultiOffice
          ? Object.entries(offices).map(([office, pvs]) => (
              <div key={office}>
                <div style={{ ...rowStyle, background: "#eef7ff", fontWeight: 700, fontSize: 10, color: "#3b5fc0", borderBottom: "1px solid #c7d9f0" }}>
                  <span>📍 {office}</span>
                </div>
                {pvs.map(renderProviderRow)}
                {renderOfficeSubtotal(pvs, office)}
              </div>
            ))
          : summary.providers.map(renderProviderRow)
        }

        {showDollars && (
          <div style={{ ...rowStyle, background: "#fdf4e7", color: "#78350f" }}>
            <span style={{ fontStyle: "italic" }}>Clinical supervision ({summary.supervisorCount} supervisor{summary.supervisorCount !== 1 ? 's' : ''})</span>
            <span style={{ textAlign: "right" }}>—</span>
            <span style={{ textAlign: "right" }}>{$k(summary.supervisionCost)}</span>
            <span style={{ textAlign: "right", color: "#cf6e6e" }}>({$k(summary.supervisionCost)})</span>
            <span style={{ textAlign: "right" }}>—</span>
          </div>
        )}

        <div style={{
          display: "grid", gridTemplateColumns: cols,
          padding: "12px 14px", background: "#141d2c", color: "#D4A520",
          fontSize: 13, fontWeight: 800, ...M,
        }}>
          <span>Total</span>
          {showDollars && <span style={{ textAlign: "right" }}>{$k(summary.totalAnnualRev)}</span>}
          {showDollars && <span style={{ textAlign: "right", color: "#e4eaf2" }}>{$k(summary.totalAnnualLabor + summary.supervisionCost)}</span>}
          {showDollars && <span style={{ textAlign: "right", color: summary.totalGross > 0 ? "#22c55e" : "#cf6e6e" }}>{$k(summary.totalGross)}</span>}
          <span style={{ textAlign: "right" }}>{pct(summary.totalMargin)}</span>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 14, background: "#f7f9fc", border: "1px solid #d0dae8", borderRadius: 8, fontSize: 11, color: "#475569", ...M, lineHeight: 1.6 }}>
        <strong>Note:</strong> Direct labor only. Supervision is the clinical supervisor cost
        {showDollars && <> at {$k(summary.supervisionCost / (1 + (config.payrollBurdenPct ?? 22) / 100))}/yr salary</>}
        {' '}+ {config.payrollBurdenPct ?? 22}% burden.
        Company overhead, management fees, and billing fees flow through the Whole Company P&amp;L roll-up.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Schedule tab — editable Idaho CHIS fee schedule
// ─────────────────────────────────────────────────────────────────────────────
export function ChildrensDDARateScheduleTab({ config, onUpdate, userRole }) {
  const overrides    = config.rateOverrides ?? {};
  const hasOverrides = Object.keys(overrides).length > 0;
  const canEdit      = canEditServiceLines(userRole);
  const ro           = !canEdit;

  const setRate = (key, val) => onUpdate({ ...config, rateOverrides: { ...overrides, [key]: val } });
  const resetRate = (key) => {
    const { [key]: _removed, ...rest } = overrides;
    onUpdate({ ...config, rateOverrides: rest });
  };
  const resetAll = () => onUpdate({ ...config, rateOverrides: {} });

  // Group rows by `group` field, preserving table order
  const groups = {};
  DDA_RATE_TABLE.forEach(r => {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ ...M, fontSize: 14, color: "#5a3800", margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>
          Idaho CHIS Rate Schedule
        </h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 10, color: "#64748b", ...M }}>
            {hasOverrides ? `${Object.keys(overrides).length} rate${Object.keys(overrides).length !== 1 ? 's' : ''} overridden` : 'All rates at Idaho defaults'}
          </div>
          {hasOverrides && canEdit && (
            <button onClick={resetAll} style={{
              padding: "4px 10px", fontSize: 10, cursor: "pointer",
              border: "1px solid #d0dae8", borderRadius: 5, background: "#fff", ...M,
            }}>Reset all to defaults</button>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#64748b", ...M, marginBottom: 16, lineHeight: 1.6 }}>
        All rates are per 15-minute unit, post-9/1/2025 (post-4% reduction). Edit any rate to override it for scenario modeling.
        Overridden rates are highlighted in amber. Click ↩ to reset an individual rate to its Idaho default.
      </div>

      {Object.entries(groups).map(([groupName, rows]) => (
        <div key={groupName} style={{ marginBottom: 20 }}>
          <div style={{
            padding: "7px 12px", background: "#141d2c", color: "#D4A520",
            borderRadius: "6px 6px 0 0", fontSize: 11, fontWeight: 700, ...M,
          }}>{groupName}</div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "0.6fr 0.9fr 2.2fr 1.3fr 0.9fr 0.7fr",
            padding: "6px 12px", background: "#eef1f6",
            borderBottom: "1px solid #d0dae8", ...labelStyle,
          }}>
            <span>Code</span>
            <span>Modifier</span>
            <span>Description</span>
            <span>Tier</span>
            <span style={{ textAlign: "right" }}>Rate / 15min</span>
            <span style={{ textAlign: "right" }}>Rate / hr</span>
          </div>

          {rows.map(r => {
            const isOverridden = r.key in overrides;
            const activeRate   = isOverridden ? overrides[r.key] : r.defaultRate;
            return (
              <div key={r.key} style={{
                display: "grid",
                gridTemplateColumns: "0.6fr 0.9fr 2.2fr 1.3fr 0.9fr 0.7fr",
                padding: "7px 12px", borderBottom: "1px solid #f1f5f9",
                alignItems: "center", fontSize: 11, ...M,
                background: isOverridden ? "#fffbe8" : "#fff",
              }}>
                <span style={{ fontWeight: 600, color: "#3b5fc0" }}>{r.code}</span>
                <span style={{ color: "#64748b", fontSize: 10 }}>{r.modifier || '—'}</span>
                <span style={{ color: "#334155" }}>{r.description}</span>
                <span style={{ color: "#475569", fontSize: 10 }}>{r.tier}</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                  <input
                    type="number" min={0} max={200} step={0.01}
                    value={activeRate}
                    onChange={e => setRate(r.key, +e.target.value)}
                    readOnly={ro}
                    style={{ ...numInput, width: 68, border: isOverridden ? "1px solid #f59e0b" : undefined, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
                  {isOverridden && canEdit && (
                    <button onClick={() => resetRate(r.key)} title={`Reset to $${r.defaultRate}`} style={{
                      border: "none", background: "transparent", cursor: "pointer",
                      color: "#f59e0b", fontSize: 13, padding: 0, lineHeight: 1,
                    }}>↩</button>
                  )}
                </div>
                <span style={{ textAlign: "right", color: "#64748b" }}>{$r(activeRate * 4)}</span>
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ padding: 12, background: "#f7f9fc", border: "1px solid #d0dae8", borderRadius: 8, fontSize: 10, color: "#64748b", ...M, lineHeight: 1.7, marginTop: 4 }}>
        <strong>Source:</strong> Idaho CHIS fee schedule, effective 9/1/2025. Rates reflect the statewide 4% reduction.
        EBM = Evidence-Based Model (TF modifier). HQ = group service. HA = Technician. HN = Specialist (Bachelor's + licensure). HO = Professional (Master's + licensure). HM = Paraprofessional / Tech in crisis context.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared provider/participant CRUD helpers — used by the Roster, Participants,
// and Caseload tabs so the three views mutate the config identically. Each
// returns a fresh immutable config; callers pass it to onUpdate.
// ─────────────────────────────────────────────────────────────────────────────
function ddaCrud(config, onUpdate) {
  const providers = config.providers ?? [];
  return {
    updateProvider: (pvId, field, value) =>
      onUpdate({ ...config, providers: providers.map(pv => pv.id === pvId ? { ...pv, [field]: value } : pv) }),
    removeProvider: (pvId) =>
      onUpdate({ ...config, providers: providers.filter(pv => pv.id !== pvId) }),
    addParticipant: (pvId) =>
      onUpdate({ ...config, providers: providers.map(pv =>
        pv.id === pvId
          ? { ...pv, participants: [...(pv.participants ?? []), mkDDAParticipant(`Participant ${(pv.participants ?? []).length + 1}`)] }
          : pv) }),
    updateParticipant: (pvId, pId, field, value) =>
      onUpdate({ ...config, providers: providers.map(pv =>
        pv.id === pvId
          ? { ...pv, participants: pv.participants.map(p => p.id === pId ? { ...p, [field]: value } : p) }
          : pv) }),
    removeParticipant: (pvId, pId) =>
      onUpdate({ ...config, providers: providers.map(pv =>
        pv.id === pvId
          ? { ...pv, participants: pv.participants.filter(p => p.id !== pId) }
          : pv) }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Participants tab — flat, cross-provider list of every participant with its
// owning provider and service phase. Reuses DDAParticipantRow for editing.
// ─────────────────────────────────────────────────────────────────────────────
export function ChildrensDDAParticipantsTab({ config, onUpdate, userRole }) {
  const canEdit = canEditServiceLines(userRole);
  const rates   = effectiveRates(config.rateOverrides ?? {});
  const crud    = ddaCrud(config, onUpdate);
  const providers = config.providers ?? [];

  const rows = providers.flatMap(pv => (pv.participants ?? []).map(p => ({ p, pv })));

  if (rows.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 40, color: "#64748b" }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>No participants yet.</div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>Add providers and participants in the Staff Roster tab — they all appear here.</div>
      </div>
    );
  }

  // Phase breakdown for the summary bar
  const phaseCounts = DDA_PHASES.map(ph => ({
    ph, n: rows.filter(({ p }) => (p.phase ?? 'initial') === ph).length,
  }));

  return (
    // ph-no-capture: shows participant names — keep out of replay & autocapture.
    <div className="ph-no-capture">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <Stat label="Participants" value={rows.length} />
        {phaseCounts.map(({ ph, n }) => <Stat key={ph} label={DDA_PHASE_LABELS[ph]} value={n} />)}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(({ p, pv }) => (
          <div key={p.id}>
            <div style={{ ...labelStyle, fontSize: 9, marginBottom: 2, marginLeft: 2 }}>
              Provider: <span style={{ color: "#5a3800" }}>{pv.name}</span> · {TIER_LABELS[pv.tier] ?? pv.tier}
            </div>
            <DDAParticipantRow p={p} tier={pv.tier} rates={rates}
              onUpdate={(id, f, v) => crud.updateParticipant(pv.id, id, f, v)}
              onRemove={(id) => crud.removeParticipant(pv.id, id)}
              userRole={userRole}
              canEdit={canEdit}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Caseload tab — 3-level org hierarchy: Clinical Supervisor → Provider/Staff →
// Participant. Reuses DDAProviderCard for the provider/participant levels and
// adds a supervisor-assignment select per provider plus an "Unassigned" bucket.
// ─────────────────────────────────────────────────────────────────────────────
export function ChildrensDDACaseloadTab({ config, onUpdate, userRole }) {
  // One-shot legacy migration: synthesize named supervisors + backfill provider
  // supervisorId. Idempotent — fires onUpdate at most once and never loops.
  useEffect(() => {
    const normalized = normalizeChildrensDDA(config);
    if (normalized !== config) onUpdate(normalized);
  }, [config, onUpdate]);

  const canEdit  = canEditServiceLines(userRole);
  const ro       = !canEdit;
  const rates    = effectiveRates(config.rateOverrides ?? {});
  const summary  = calcChildrensDDAService(config);
  const crud     = ddaCrud(config, onUpdate);

  const supervisors = config.supervisors ?? [];
  const providers   = config.providers ?? [];
  const targetRatio = config.supervision?.providersPerSupervisor ?? 8;

  const [openSup, setOpenSup] = useState({});
  const toggleSup = id => setOpenSup(o => ({ ...o, [id]: !o[id] }));
  const isOpen    = id => openSup[id] !== false; // default expanded

  const supExists    = id => supervisors.some(s => s.id === id);
  const providersFor = supId => providers.filter(pv => pv.supervisorId === supId);
  const unassigned   = providers.filter(pv => !pv.supervisorId || !supExists(pv.supervisorId));

  const addSupervisor = () =>
    onUpdate({ ...config, supervisors: [...supervisors, mkDDASupervisor(`Supervisor ${supervisors.length + 1}`, config.supervision?.salary ?? 65000)] });
  const updateSupervisor = (id, field, val) =>
    onUpdate({ ...config, supervisors: supervisors.map(s => s.id === id ? { ...s, [field]: val } : s) });
  const removeSupervisor = (id) =>
    onUpdate({
      ...config,
      supervisors: supervisors.filter(s => s.id !== id),
      providers: providers.map(pv => pv.supervisorId === id ? { ...pv, supervisorId: null } : pv),
    });

  const countsFor = (pvs) => ({
    providers: pvs.length,
    participants: pvs.reduce((a, pv) => a + (pv.participants ?? []).length, 0),
  });

  const renderProviderBlock = (pv) => (
    <div key={pv.id} style={{ marginBottom: 10 }}>
      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, marginLeft: 2 }}>
          <span style={labelStyle}>Supervisor</span>
          <select value={pv.supervisorId ?? ''}
            onChange={e => crud.updateProvider(pv.id, "supervisorId", e.target.value || null)}
            style={{ ...textInput, fontSize: 11, padding: "3px 6px" }}>
            <option value="">— Unassigned —</option>
            {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <DDAProviderCard pv={pv}
        payrollBurdenPct={config.payrollBurdenPct}
        rates={rates}
        onUpdate={crud.updateProvider}
        onRemove={crud.removeProvider}
        onAddParticipant={crud.addParticipant}
        onUpdateParticipant={crud.updateParticipant}
        onRemoveParticipant={crud.removeParticipant}
        userRole={userRole}
        canEdit={canEdit}/>
    </div>
  );

  const renderSupervisorSection = (sup) => {
    const pvs    = providersFor(sup.id);
    const counts = countsFor(pvs);
    const over   = counts.providers > targetRatio;
    return (
      <div key={sup.id} style={{ marginBottom: 16, border: "1px solid #d0dae8", borderRadius: 10, overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 14px", background: "#141d2c", color: "#D4A520",
        }}>
          <button onClick={() => toggleSup(sup.id)} style={{
            border: "none", background: "transparent", cursor: "pointer", color: "#D4A520", fontSize: 13, width: 18,
          }}>{isOpen(sup.id) ? "▼" : "▶"}</button>
          <input type="text" value={sup.name}
            onChange={e => updateSupervisor(sup.id, "name", e.target.value)}
            readOnly={ro}
            style={{ ...textInput, fontWeight: 700, fontSize: 13, minWidth: 140, color: "#141d2c", pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.8 : 1 }}/>
          {wageDisplayMode(userRole) === 'dollars' && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ ...labelStyle, color: "#c8b06a" }}>Salary</span>
              <input type="number" min={30000} max={200000} step={1000} value={sup.salary ?? 65000}
                onChange={e => updateSupervisor(sup.id, "salary", +e.target.value)}
                readOnly={ro}
                style={{ ...numInput, width: 80, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.8 : 1 }}/>
            </div>
          )}
          <span style={{ fontSize: 11, ...M, color: "#e4eaf2" }}>
            {counts.providers} provider{counts.providers !== 1 ? 's' : ''} · {counts.participants} participant{counts.participants !== 1 ? 's' : ''}
            {' '}· ratio {counts.providers}:1 {over ? "⚠️" : ""}
          </span>
          {canEdit && <button onClick={() => removeSupervisor(sup.id)} style={{
            marginLeft: "auto", border: "1px solid #5a3800", background: "transparent",
            color: "#D4A520", padding: "3px 9px", borderRadius: 5, fontSize: 10, cursor: "pointer", ...M,
          }}>Remove</button>}
        </div>
        {isOpen(sup.id) && (
          <div style={{ padding: 14, background: "#f7f9fc" }}>
            {pvs.length === 0
              ? <div style={{ fontSize: 11, color: "#94a3b8", ...M }}>No providers assigned to this supervisor yet.</div>
              : pvs.map(renderProviderBlock)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <Stat label="Supervisors"    value={summary.supervisorCount} />
        <Stat label="Providers"      value={summary.providerCount} />
        <Stat label="Total caseload" value={summary.totalCaseload} />
        {canSeeCompanyDollars(userRole) && <Stat label="Supervision" value={$k(summary.supervisionCost)} />}
      </div>

      {supervisors.map(renderSupervisorSection)}

      {/* Unassigned providers */}
      {unassigned.length > 0 && (
        <div style={{ marginBottom: 16, border: "1px dashed #c8d4e4", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "#eef1f6", color: "#64748b", fontSize: 11, fontWeight: 700, ...M }}>
            Providers not assigned to a supervisor ({unassigned.length})
          </div>
          <div style={{ padding: 14 }}>
            {unassigned.map(renderProviderBlock)}
          </div>
        </div>
      )}

      {providers.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: 40, color: "#64748b" }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No providers yet.</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>Add providers in the Staff Roster tab, then assign them to a supervisor here.</div>
        </div>
      )}

      {canEdit && <button onClick={addSupervisor} style={{
        marginTop: 4, padding: "8px 18px",
        background: "#141d2c", border: "none", borderRadius: 6,
        color: "#D4A520", cursor: "pointer", fontSize: 12, fontWeight: 700, ...M,
      }}>+ Add supervisor</button>}
    </div>
  );
}
