/**
 * TSC (Targeted Service Coordination) Service Line Module
 *
 * Caseload-coordinator financial model:
 *   - Each coordinator owns a caseload of participants
 *   - Each participant has authorized monthly units across:
 *       G9002 (Service Coordination)        — $20.97 / 15min  (HM = $13.46 paraprofessional)
 *       G9007 (Plan Development)            — $20.97 / 15min
 *       H2011 (Crisis Assistance)           — $20.97 / 15min  (HM = $13.46 paraprofessional)
 *   - Revenue = sum across participants × rate
 *   - Cost = coordinator hourly wage × (productive hrs from billed units + admin hrs)
 *
 * Config shape (lives at serviceLine.config when type === 'TSC'):
 * {
 *   coordinators: [
 *     {
 *       id: string,
 *       name: string,
 *       hourlyWage: number,
 *       adminHrsPerWeek: number,    // non-billable admin / drive / documentation
 *       participants: [
 *         {
 *           id, name,
 *           unitsCoord: number,     // G9002 monthly units
 *           unitsPlanDev: number,   // G9007 annual units (typical: 0–48); divided by 12 in calc
 *           unitsCrisis: number,    // H2011 monthly units — kept for backward compat, hidden from main roster UI
 *           isParapro: boolean,     // bill at HM (paraprofessional) rate
 *         }
 *       ],
 *     }
 *   ],
 *   payrollBurdenPct: number,       // employer-side burden, default 22
 *   defaultUnitsPerParticipant: number,
 *   defaultHourlyWage: number,
 *   defaultAdminHrsPerWeek: number,
 * }
 */

import { useState } from "react";
import { wageDisplayMode, canSeeCompanyDollars, canEditServiceLines, canSeeControl } from "../lib/access.js";

// ──────────────────────────────────────────────────────────────────────
// Rate constants (mirror the post-9/1/2025 Idaho catalog)
// Could be pulled from idahoRates.js; inlined here so the module
// is self-contained for review.
// ──────────────────────────────────────────────────────────────────────
// Default Idaho post-9/1/2025 TSC rates. Stored per-service-line in config.rates
// so they can be overridden; calc falls back to these for legacy configs.
export const DEFAULT_TSC_RATES = {
  coord:          20.97,  // G9002
  coordParapro:   13.46,  // G9002 HM
  planDev:        20.97,  // G9007
  crisis:         20.97,  // H2011 (hidden from primary views per spec)
  crisisParapro:  13.46,  // H2011 HM
};

// Editable fields surfaced in the Reimbursement Rates panel.
// G9002 + G9007 only — H2011 (crisis) stays out of primary views per service-rate-spec.
const TSC_RATE_FIELDS = [
  { key:"coord",        code:"G9002",    label:"Service Coordination",           color:"#0E6B78", baseline:20.97 },
  { key:"coordParapro", code:"G9002 HM", label:"Service Coordination — Parapro",  color:"#C9921A", baseline:13.46 },
  { key:"planDev",      code:"G9007",    label:"Plan Development",                color:"#00c49a", baseline:20.97 },
];

// ──────────────────────────────────────────────────────────────────────
// Factories
// ──────────────────────────────────────────────────────────────────────
let _tscUid = 0;
const tscUid = () => ++_tscUid;

export function mkParticipant(name = "New Participant", unitsCoord = 16) {
  return {
    id: `tscp_${tscUid()}`,
    name,
    unitsCoord,
    unitsPlanDev: 0,
    unitsCrisis: 0,
    isParapro: false,
  };
}

export function mkCoordinator(name = "New Coordinator", hourlyWage = 22) {
  return {
    id: `tscc_${tscUid()}`,
    name,
    hourlyWage,
    adminHrsPerWeek: 5,
    tscType: 'mixed',   // 'adult' | 'children' | 'mixed'
    officeName: '',
    participants: [],
  };
}

export function mkAdminStaffMember(role = "Scheduler") {
  return {
    id: `tscadm_${tscUid()}`,
    role,
    mode: "salary",   // 'salary' | 'hourly'
    value: 55000,
    ftePct: 100,
    benefitsPct: 22,
  };
}

export function defaultTSCConfig() {
  return {
    coordinators: [],
    payrollBurdenPct: 22,
    defaultUnitsPerParticipant: 16,
    defaultHourlyWage: 22,
    defaultAdminHrsPerWeek: 5,
    adminStaff: [],
    productivity: {
      billableHoursPerDay:  6,
      documentationTimePct: 15,
      travelTimePct:        10,
      noShowPct:            8,
      qaReworkPct:          3,
    },
    revenue: {
      completionRate:          92,
      billingSuccessRate:       97,
      collectionRate:           99,
      billingLagDays:           30,
      faceToFaceComplianceRate: 90,  // % of contacts meeting face-to-face requirement
      planDevCompletionRate:    95,  // % of ISP plan dev completed on time
      caseloadChurnRate:        15,  // % annual caseload turnover
      denialWriteOffRate:        3,  // % of billed claims written off after denial
    },
    scenario: {
      rateAdjPct:        0,
      caseloadCount:     null,
      productivityAdjPct: 0,
    },
    rates: { ...DEFAULT_TSC_RATES },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Calculators
// ──────────────────────────────────────────────────────────────────────
export function calcTSCParticipant(p, rates = DEFAULT_TSC_RATES) {
  const R = { ...DEFAULT_TSC_RATES, ...(rates ?? {}) };
  const rateCoord  = p.isParapro ? R.coordParapro  : R.coord;
  const rateCrisis = p.isParapro ? R.crisisParapro : R.crisis;
  const ratePlan   = R.planDev;

  // G9007 is authorized annually (max 48 units/yr); divide by 12 for monthly contribution
  const monthlyRev = (p.unitsCoord    ?? 0) * rateCoord
                   + (p.unitsPlanDev  ?? 0) / 12 * ratePlan
                   + (p.unitsCrisis   ?? 0) * rateCrisis;

  // 1 unit = 15 min, so 4 units = 1 hour; G9007 prorated monthly
  const monthlyHours = ((p.unitsCoord ?? 0) + (p.unitsPlanDev ?? 0) / 12 + (p.unitsCrisis ?? 0)) / 4;

  return {
    monthlyRev,
    annualRev:    monthlyRev * 12,
    monthlyHours,
    annualHours:  monthlyHours * 12,
  };
}

export function calcTSCCoordinator(c, payrollBurdenPct = 22, rates = DEFAULT_TSC_RATES) {
  const px = (c.participants ?? []).map(p => calcTSCParticipant(p, rates));

  const monthlyRev      = px.reduce((a, p) => a + p.monthlyRev, 0);
  const monthlyBillable = px.reduce((a, p) => a + p.monthlyHours, 0);
  const adminMonthly    = (c.adminHrsPerWeek ?? 0) * 4.33;  // weeks/month
  const totalMonthlyHrs = monthlyBillable + adminMonthly;

  const burden = 1 + (payrollBurdenPct ?? 22) / 100;
  const monthlyLabor = totalMonthlyHrs * (c.hourlyWage ?? 22) * burden;
  const annualLabor  = monthlyLabor * 12;
  const annualRev    = monthlyRev * 12;
  const gross        = annualRev - annualLabor;

  // Utilization metrics — assume 160 hr/month FTE
  const FTE_HRS = 160;
  const utilization = totalMonthlyHrs / FTE_HRS;
  const billableShare = totalMonthlyHrs > 0 ? monthlyBillable / totalMonthlyHrs : 0;

  return {
    px,
    caseloadSize:    (c.participants ?? []).length,
    monthlyRev,
    annualRev,
    monthlyBillable,
    adminMonthly,
    totalMonthlyHrs,
    monthlyLabor,
    annualLabor,
    gross,
    grossMargin:     annualRev > 0 ? gross / annualRev : 0,
    utilization,
    billableShare,
  };
}

export function calcTSCService(config) {
  const rates = { ...DEFAULT_TSC_RATES, ...(config.rates ?? {}) };
  const coordinators = (config.coordinators ?? []).map(c => ({
    ...c,
    metrics: calcTSCCoordinator(c, config.payrollBurdenPct ?? 22, rates),
  }));

  const totalCaseload  = coordinators.reduce((a, c) => a + c.metrics.caseloadSize, 0);
  const totalAnnualRev = coordinators.reduce((a, c) => a + c.metrics.annualRev, 0);
  const totalAnnualLab = coordinators.reduce((a, c) => a + c.metrics.annualLabor, 0);
  const totalGross     = totalAnnualRev - totalAnnualLab;

  return {
    coordinators,
    totalCaseload,
    totalAnnualRev,
    totalAnnualLabor: totalAnnualLab,
    totalGross,
    totalMargin: totalAnnualRev > 0 ? totalGross / totalAnnualRev : 0,
    coordinatorCount: coordinators.length,
  };
}

export function calcTSCAdminStaff(adminStaff = []) {
  const staff = adminStaff.map(m => {
    const annualBase = m.mode === 'salary'
      ? (m.value ?? 55000) * ((m.ftePct ?? 100) / 100)
      : (m.value ?? 25) * 2080 * ((m.ftePct ?? 100) / 100);
    const annualCost = annualBase * (1 + (m.benefitsPct ?? 22) / 100);
    return { ...m, annualBase, annualCost };
  });
  return { staff, totalAnnualCost: staff.reduce((a, s) => a + s.annualCost, 0) };
}

export function calcTSCRevenueWaterfall(grossAuthorized, revenue = {}) {
  const completionRate     = (revenue.completionRate     ?? 92) / 100;
  const billingSuccessRate = (revenue.billingSuccessRate ?? 97) / 100;
  const collectionRate     = (revenue.collectionRate     ?? 99) / 100;
  const earned    = grossAuthorized * completionRate;
  const billed    = earned          * billingSuccessRate;
  const collected = billed          * collectionRate;
  const leakagePct = grossAuthorized > 0 ? (grossAuthorized - collected) / grossAuthorized : 0;
  return { authorized: grossAuthorized, earned, billed, collected, leakagePct };
}

export function calcTSCProductivityFactors(productivity = {}) {
  const docPct    = (productivity.documentationTimePct ?? 15) / 100;
  const travelPct = (productivity.travelTimePct        ?? 10) / 100;
  const noShowPct = (productivity.noShowPct            ??  8) / 100;
  const qaPct     = (productivity.qaReworkPct          ??  3) / 100;
  const effectiveBillablePct  = Math.max(0, 1 - docPct - travelPct - noShowPct - qaPct);
  const netBillableHrsPerDay  = (productivity.billableHoursPerDay ?? 6) * effectiveBillablePct;
  return { effectiveBillablePct, netBillableHrsPerDay };
}

export function calcTSCBreakEven(config) {
  const adminResult   = calcTSCAdminStaff(config.adminStaff ?? []);
  const burdenPct     = (config.payrollBurdenPct ?? 22) / 100;
  const wage          = config.defaultHourlyWage ?? 22;
  // Fixed cost = admin staff + cost of one coordinator with zero caseload
  const coordFixedMonthly = (config.defaultAdminHrsPerWeek ?? 5) * 4.33 * wage * (1 + burdenPct);
  const fixedCosts    = adminResult.totalAnnualCost + (coordFixedMonthly * 12);

  const summary = calcTSCService(config);
  const totalPx = summary.coordinators.reduce((a, c) => a + c.metrics.caseloadSize, 0);
  const revenuePerParticipant = totalPx > 0 ? summary.totalAnnualRev / totalPx : 0;

  const breakEvenCaseload = revenuePerParticipant > 0
    ? Math.ceil(fixedCosts / revenuePerParticipant)
    : null;

  const safetyMarginPct = (breakEvenCaseload && totalPx > 0)
    ? (totalPx - breakEvenCaseload) / totalPx
    : null;

  return {
    breakEvenCaseload,
    currentCaseload: summary.totalCaseload,
    revenuePerParticipant,
    fixedCosts,
    safetyMarginPct,
  };
}

export function calcTSCScenario(config) {
  const base = calcTSCService(config);

  const rateAdj        = 1 + (config.scenario?.rateAdjPct        ?? 0) / 100;
  const caseloadCount  = config.scenario?.caseloadCount;
  const caseloadAdj    = (caseloadCount != null && base.totalCaseload > 0)
    ? caseloadCount / base.totalCaseload
    : 1;
  const productivityAdj = 1 + (config.scenario?.productivityAdjPct ?? 0) / 100;

  // Build a modified config for scenario calculation
  const scenarioCoords = (config.coordinators ?? []).map(c => ({
    ...c,
    participants: (c.participants ?? []).map(p => ({
      ...p,
      unitsCoord:   Math.round((p.unitsCoord   ?? 0) * caseloadAdj * productivityAdj),
      unitsPlanDev: Math.round((p.unitsPlanDev ?? 0) * caseloadAdj * productivityAdj),
      unitsCrisis:  Math.round((p.unitsCrisis  ?? 0) * caseloadAdj * productivityAdj),
    })),
    hourlyWage: (c.hourlyWage ?? 22), // labor cost unchanged by rate adj
  }));

  // Apply rate adjustment by scaling the revenue result directly
  const scenarioSummary = calcTSCService({ ...config, coordinators: scenarioCoords });
  const scenarioAnnualRev = scenarioSummary.totalAnnualRev * rateAdj;
  const scenarioGross     = scenarioAnnualRev - scenarioSummary.totalAnnualLabor;
  const scenarioMargin    = scenarioAnnualRev > 0 ? scenarioGross / scenarioAnnualRev : 0;

  const scenario = {
    totalAnnualRev:   scenarioAnnualRev,
    totalAnnualLabor: scenarioSummary.totalAnnualLabor,
    totalGross:       scenarioGross,
    totalMargin:      scenarioMargin,
    coordinatorCount: scenarioSummary.coordinatorCount,
    totalCaseload:    caseloadCount ?? scenarioSummary.totalCaseload,
  };

  const delta = {
    totalAnnualRev:   scenarioAnnualRev - base.totalAnnualRev,
    totalAnnualLabor: scenario.totalAnnualLabor - base.totalAnnualLabor,
    totalGross:       scenarioGross - base.totalGross,
    totalMargin:      scenarioMargin - base.totalMargin,
  };

  return { base, scenario, delta };
}

// ──────────────────────────────────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────────────────────────────────
const $k = n => n.toLocaleString("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 });
const $d = n => `$${n.toFixed(2)}`;
const pct = n => `${(n * 100).toFixed(1)}%`;
const M = { fontFamily:"'DM Mono',monospace" };

const card = {
  background:"#ffffff",
  borderRadius:10,
  padding:14,
  border:"1px solid #d0dae8",
  boxShadow:"0 2px 10px rgba(13,26,42,0.06)",
};

const labelStyle = {
  fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1.5, ...M,
};

const numInput = {
  width:64, padding:"3px 6px", border:"1px solid #c8d4e4",
  borderRadius:5, fontSize:12, ...M, textAlign:"right", background:"#fff",
};

const textInput = {
  padding:"4px 8px", border:"1px solid #c8d4e4",
  borderRadius:5, fontSize:13, fontFamily:"'Sora',sans-serif", background:"#fff",
};

// ──────────────────────────────────────────────────────────────────────
// Stat tile
// ──────────────────────────────────────────────────────────────────────
function Stat({ label, value, color = "#0A3D47" }) {
  return (
    <div style={{
      background:"#fff", borderRadius:8, padding:"6px 13px 6px 11px",
      border:"1px solid #d0dae8", borderLeft:`3px solid ${color}`,
      boxShadow:"0 1px 3px rgba(13,26,42,0.06)",
    }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize:15, fontWeight:800, color, ...M, marginTop:3, letterSpacing:-0.3 }}>{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Participant row (inside a coordinator's card)
// ──────────────────────────────────────────────────────────────────────
function ParticipantRow({ p, onUpdate, onRemove, canEdit, userRole }) {
  const m = calcTSCParticipant(p);
  const ro = !canEdit;
  return (
    <div style={{
      display:"grid", gridTemplateColumns:"1.4fr 0.8fr 0.8fr 0.6fr 1fr 0.4fr",
      gap:8, alignItems:"center", padding:"6px 8px",
      borderRadius:6, background:"#f7f9fc", border:"1px solid #e2e8f0",
    }}>
      <input
        type="text" value={p.name}
        onChange={e => onUpdate(p.id, "name", e.target.value)}
        readOnly={ro}
        style={{ ...textInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}
      />
      <div>
        <div style={labelStyle}>G9002</div>
        <input type="number" min={0} max={200} value={p.unitsCoord ?? 0}
          onChange={e => onUpdate(p.id, "unitsCoord", +e.target.value)}
          readOnly={ro}
          style={{ ...numInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
      </div>
      <div>
        <div style={labelStyle}>G9007 u/yr</div>
        <input type="number" min={0} max={48} value={p.unitsPlanDev ?? 0}
          onChange={e => onUpdate(p.id, "unitsPlanDev", +e.target.value)}
          readOnly={ro}
          style={{ ...numInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#64748b", ...M, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}>
        <input type="checkbox" checked={!!p.isParapro}
          onChange={e => onUpdate(p.id, "isParapro", e.target.checked)}
          disabled={ro}/>
        HM
      </label>
      <div style={{ textAlign:"right" }}>
        {canSeeCompanyDollars(userRole) && <div style={{ fontSize:13, fontWeight:700, color:"#0A3D47", ...M }}>{$k(m.monthlyRev)}/mo</div>}
        <div style={{ fontSize:9, color:"#64748b", ...M }}>{m.monthlyHours.toFixed(1)} hr/mo</div>
      </div>
      {canEdit && <button onClick={() => onRemove(p.id)} style={{
        border:"none", background:"transparent", cursor:"pointer",
        color:"#cf6e6e", fontSize:14, padding:4,
      }}>✕</button>}
      {!canEdit && <span/>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Coordinator card (shows roster, expandable participant list)
// ──────────────────────────────────────────────────────────────────────
function CoordinatorCard({ coord, onUpdate, onRemove, onAddParticipant, onUpdateParticipant, onRemoveParticipant, payrollBurdenPct, userRole, hideParticipants = false, rates = DEFAULT_TSC_RATES }) {
  const [expanded, setExpanded] = useState(true);
  const m = calcTSCCoordinator(coord, payrollBurdenPct);
  const canEdit = canEditServiceLines(userRole);
  const ro = !canEdit;

  const utilColor =
    m.utilization > 1.05 ? "#cf6e6e" :
    m.utilization > 0.85 ? "#22c55e" :
    m.utilization > 0.65 ? "#f59e0b" : "#cf6e6e";

  const marginColor =
    m.grossMargin > 0.40 ? "#22c55e" :
    m.grossMargin > 0.20 ? "#f59e0b" : "#cf6e6e";

  return (
    <div style={card}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
        {!hideParticipants && (
          <button onClick={() => setExpanded(e => !e)} style={{
            border:"none", background:"transparent", cursor:"pointer",
            fontSize:14, color:"#0A3D47", width:20,
          }}>{expanded ? "▼" : "▶"}</button>
        )}

        <input type="text" value={coord.name}
          onChange={e => onUpdate(coord.id, "name", e.target.value)}
          readOnly={ro}
          style={{ ...textInput, fontWeight:700, flex:1, fontSize:14, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>

        <div>
          <div style={labelStyle}>TSC type</div>
          <select value={coord.tscType ?? 'mixed'}
            onChange={e => onUpdate(coord.id, "tscType", e.target.value)}
            disabled={ro}
            style={{ ...textInput, fontSize:11, padding:"3px 6px", pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}>
            <option value="adult">Adult</option>
            <option value="children">Children's</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        {wageDisplayMode(userRole) !== 'hidden' && (
          <div>
            <div style={labelStyle}>Wage / hr</div>
            <input type="number" min={10} max={60} step={0.5} value={coord.hourlyWage}
              onChange={e => onUpdate(coord.id, "hourlyWage", +e.target.value)}
              readOnly={wageDisplayMode(userRole) !== 'dollars' || ro}
              style={{ ...numInput, pointerEvents: (wageDisplayMode(userRole) !== 'dollars' || ro) ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
          </div>
        )}

        <div>
          <div style={labelStyle}>Admin hr/wk</div>
          <input type="number" min={0} max={40} step={0.5} value={coord.adminHrsPerWeek}
            onChange={e => onUpdate(coord.id, "adminHrsPerWeek", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>

        <div>
          <div style={labelStyle}>Office</div>
          <input type="text" value={coord.officeName ?? ''}
            onChange={e => onUpdate(coord.id, "officeName", e.target.value)}
            readOnly={ro}
            placeholder="optional"
            style={{ ...textInput, width: 90, fontSize: 11, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>

        {canEdit && <button onClick={() => onRemove(coord.id)} style={{
          border:"1px solid #e8d4d4", background:"#fff5f5",
          color:"#a14848", padding:"4px 10px", borderRadius:5,
          fontSize:10, cursor:"pointer", ...M,
        }}>Remove coordinator</button>}
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom: (!hideParticipants && expanded) ? 12 : 0 }}>
        <Stat label="Caseload"        value={m.caseloadSize} />
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Rev"   value={$k(m.annualRev)} color="#D4A520"/>}
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Labor" value={$k(m.annualLabor)} />}
        {canSeeCompanyDollars(userRole) && <Stat label="Gross"        value={$k(m.gross)} color={marginColor}/>}
        <Stat label="Margin"          value={pct(m.grossMargin)} color={marginColor}/>
        <Stat label="Utilization"     value={pct(m.utilization)} color={utilColor}/>
        <Stat label="Billable share"  value={pct(m.billableShare)} />
      </div>

      {!hideParticipants && expanded && (
        <div>
          <div style={{ display:"grid",
            gridTemplateColumns:"1.4fr 0.8fr 0.8fr 0.6fr 1fr 0.4fr",
            gap:8, padding:"4px 8px",
            ...labelStyle, marginBottom:4,
          }}>
            <span>Participant</span>
            <span style={{ textAlign:"left" }}>G9002 u/mo</span>
            <span style={{ textAlign:"left" }}>G9007 u/yr</span>
            <span>Para</span>
            <span style={{ textAlign:"right" }}>Revenue</span>
            <span></span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {(coord.participants ?? []).map(p =>
              <ParticipantRow key={p.id} p={p} rates={rates}
                onUpdate={(id, f, v) => onUpdateParticipant(coord.id, id, f, v)}
                onRemove={(id) => onRemoveParticipant(coord.id, id)}
                canEdit={canEdit}
                userRole={userRole}/>
            )}
          </div>
          {canEdit && <button onClick={() => onAddParticipant(coord.id)} style={{
            marginTop:10, padding:"6px 14px",
            background:"#fff", border:"1px dashed #c8d4e4", borderRadius:6,
            color:"#0A3D47", cursor:"pointer", fontSize:12, fontWeight:600, ...M,
          }}>+ Add participant</button>}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Roster tab — main editing UI for TSC
// ──────────────────────────────────────────────────────────────────────
export function TSCRosterTab({ config, onUpdate, userRole }) {
  const summary = calcTSCService(config);
  const canEdit = canEditServiceLines(userRole);
  const rates = { ...DEFAULT_TSC_RATES, ...(config.rates ?? {}) };

  const updateField    = (field, value) => onUpdate({ ...config, [field]: value });
  const updateCoord    = (coordId, field, value) =>
    onUpdate({
      ...config,
      coordinators: config.coordinators.map(c => c.id === coordId ? { ...c, [field]: value } : c),
    });
  const removeCoord    = (coordId) =>
    onUpdate({
      ...config,
      coordinators: config.coordinators.filter(c => c.id !== coordId),
    });
  const addCoord = () => onUpdate({
    ...config,
    coordinators: [
      ...config.coordinators,
      mkCoordinator(`Coordinator ${config.coordinators.length + 1}`, config.defaultHourlyWage),
    ],
  });
  const addParticipant = (coordId) => onUpdate({
    ...config,
    coordinators: config.coordinators.map(c =>
      c.id === coordId
        ? { ...c, participants: [...c.participants, mkParticipant(`Participant ${c.participants.length + 1}`, config.defaultUnitsPerParticipant)] }
        : c
    ),
  });
  const updateParticipant = (coordId, pId, field, value) => onUpdate({
    ...config,
    coordinators: config.coordinators.map(c =>
      c.id === coordId
        ? { ...c, participants: c.participants.map(p => p.id === pId ? { ...p, [field]: value } : p) }
        : c
    ),
  });
  const removeParticipant = (coordId, pId) => onUpdate({
    ...config,
    coordinators: config.coordinators.map(c =>
      c.id === coordId
        ? { ...c, participants: c.participants.filter(p => p.id !== pId) }
        : c
    ),
  });

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16, alignItems:"center" }}>
        <Stat label="Coordinators"  value={summary.coordinatorCount} />
        <Stat label="Total caseload" value={summary.totalCaseload} />
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Rev"   value={$k(summary.totalAnnualRev)} color="#D4A520"/>}
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Labor" value={$k(summary.totalAnnualLabor)} />}
        {canSeeCompanyDollars(userRole) && <Stat label="Gross"        value={$k(summary.totalGross)} color={summary.totalMargin > 0.3 ? "#22c55e" : "#cf6e6e"}/>}
        <Stat label="Margin"         value={pct(summary.totalMargin)} color={summary.totalMargin > 0.3 ? "#22c55e" : "#cf6e6e"}/>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <span style={labelStyle}>Burden %</span>
          <input type="number" min={0} max={50} step={0.5} value={config.payrollBurdenPct ?? 22}
            onChange={e => updateField("payrollBurdenPct", +e.target.value)}
            readOnly={!canEdit}
            style={{ ...numInput, pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}/>
        </div>
      </div>

      {/* Coordinator cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {config.coordinators.length === 0 && (
          <div style={{ ...card, textAlign:"center", padding:40, color:"#64748b" }}>
            <div style={{ fontSize:13, marginBottom:8 }}>No coordinators yet.</div>
            <div style={{ fontSize:11, color:"#94a3b8" }}>Add a coordinator to start building your TSC caseload model.</div>
          </div>
        )}
        {config.coordinators.map(coord =>
          <CoordinatorCard key={coord.id} coord={coord}
            payrollBurdenPct={config.payrollBurdenPct}
            rates={rates}
            onUpdate={updateCoord}
            onRemove={removeCoord}
            onAddParticipant={addParticipant}
            onUpdateParticipant={updateParticipant}
            onRemoveParticipant={removeParticipant}
            userRole={userRole}/>
        )}
      </div>

      {canEdit && <button onClick={addCoord} style={{
        marginTop:16, padding:"8px 18px",
        background:"#0E6B78", border:"none", borderRadius:6,
        color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700, ...M,
      }}>+ Add coordinator</button>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Participant row for flat (cross-coordinator) view
// ──────────────────────────────────────────────────────────────────────
function ParticipantFlatRow({ p, coordId, coordinators, onUpdate, onReassign, onRemove, canEdit, userRole }) {
  const m = calcTSCParticipant(p);
  const ro = !canEdit;
  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:"1.4fr 1.2fr 0.8fr 0.8fr 0.6fr 1fr 0.4fr",
      gap:8, alignItems:"center", padding:"6px 8px",
      borderRadius:6, background:"#f7f9fc", border:"1px solid #e2e8f0",
    }}>
      <input
        type="text" value={p.name}
        onChange={e => onUpdate(coordId, p.id, "name", e.target.value)}
        readOnly={ro}
        style={{ ...textInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}
      />
      <select value={coordId}
        onChange={e => onReassign(coordId, p.id, e.target.value)}
        disabled={ro}
        style={{ ...textInput, fontSize:11, padding:"3px 6px", pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}>
        {coordinators.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <div>
        <div style={labelStyle}>G9002</div>
        <input type="number" min={0} max={200} value={p.unitsCoord ?? 0}
          onChange={e => onUpdate(coordId, p.id, "unitsCoord", +e.target.value)}
          readOnly={ro}
          style={{ ...numInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
      </div>
      <div>
        <div style={labelStyle}>G9007 u/yr</div>
        <input type="number" min={0} max={48} value={p.unitsPlanDev ?? 0}
          onChange={e => onUpdate(coordId, p.id, "unitsPlanDev", +e.target.value)}
          readOnly={ro}
          style={{ ...numInput, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#64748b", ...M, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}>
        <input type="checkbox" checked={!!p.isParapro}
          onChange={e => onUpdate(coordId, p.id, "isParapro", e.target.checked)}
          disabled={ro}/>
        HM
      </label>
      <div style={{ textAlign:"right" }}>
        {canSeeCompanyDollars(userRole) && <div style={{ fontSize:13, fontWeight:700, color:"#0A3D47", ...M }}>{$k(m.monthlyRev)}/mo</div>}
        <div style={{ fontSize:9, color:"#64748b", ...M }}>{m.monthlyHours.toFixed(1)} hr/mo</div>
      </div>
      {canEdit && <button onClick={() => onRemove(coordId, p.id)} style={{
        border:"none", background:"transparent", cursor:"pointer",
        color:"#cf6e6e", fontSize:14, padding:4,
      }}>✕</button>}
      {!canEdit && <span/>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Coordinators tab — manage coordinators and their participants
// ──────────────────────────────────────────────────────────────────────
export function TSCCoordinatorsTab({ config, onUpdate, userRole }) {
  const summary = calcTSCService(config);
  const canEdit = canEditServiceLines(userRole);
  const rates = { ...DEFAULT_TSC_RATES, ...(config.rates ?? {}) };

  const updateCoord = (coordId, field, value) =>
    onUpdate({
      ...config,
      coordinators: config.coordinators.map(c => c.id === coordId ? { ...c, [field]: value } : c),
    });
  const removeCoord = (coordId) =>
    onUpdate({
      ...config,
      coordinators: config.coordinators.filter(c => c.id !== coordId),
    });
  const addCoord = () => onUpdate({
    ...config,
    coordinators: [
      ...config.coordinators,
      mkCoordinator(`Coordinator ${config.coordinators.length + 1}`, config.defaultHourlyWage),
    ],
  });
  const addParticipant = (coordId) => onUpdate({
    ...config,
    coordinators: config.coordinators.map(c =>
      c.id === coordId
        ? { ...c, participants: [...c.participants, mkParticipant(`Participant ${c.participants.length + 1}`, config.defaultUnitsPerParticipant)] }
        : c
    ),
  });
  const updateParticipant = (coordId, pId, field, value) => onUpdate({
    ...config,
    coordinators: config.coordinators.map(c =>
      c.id === coordId
        ? { ...c, participants: c.participants.map(p => p.id === pId ? { ...p, [field]: value } : p) }
        : c
    ),
  });
  const removeParticipant = (coordId, pId) => onUpdate({
    ...config,
    coordinators: config.coordinators.map(c =>
      c.id === coordId
        ? { ...c, participants: c.participants.filter(p => p.id !== pId) }
        : c
    ),
  });

  return (
    <div>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16, alignItems:"center" }}>
        <Stat label="Coordinators"   value={summary.coordinatorCount} />
        <Stat label="Total caseload" value={summary.totalCaseload} />
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Rev"   value={$k(summary.totalAnnualRev)} color="#D4A520"/>}
        {canSeeCompanyDollars(userRole) && <Stat label="Annual Labor" value={$k(summary.totalAnnualLabor)} />}
        {canSeeCompanyDollars(userRole) && <Stat label="Gross"        value={$k(summary.totalGross)} color={summary.totalMargin > 0.3 ? "#22c55e" : "#cf6e6e"}/>}
        <Stat label="Margin" value={pct(summary.totalMargin)} color={summary.totalMargin > 0.3 ? "#22c55e" : "#cf6e6e"}/>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <span style={labelStyle}>Burden %</span>
          <input type="number" min={0} max={50} step={0.5} value={config.payrollBurdenPct ?? 22}
            onChange={e => onUpdate({ ...config, payrollBurdenPct: +e.target.value })}
            readOnly={!canEdit}
            style={{ ...numInput, pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}/>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {config.coordinators.length === 0 && (
          <div style={{ ...card, textAlign:"center", padding:40, color:"#64748b" }}>
            <div style={{ fontSize:13, marginBottom:8 }}>No coordinators yet.</div>
            <div style={{ fontSize:11, color:"#94a3b8" }}>Add a coordinator to start building your TSC caseload model.</div>
          </div>
        )}
        {config.coordinators.map(coord =>
          <CoordinatorCard key={coord.id} coord={coord}
            payrollBurdenPct={config.payrollBurdenPct}
            rates={rates}
            onUpdate={updateCoord}
            onRemove={removeCoord}
            onAddParticipant={addParticipant}
            onUpdateParticipant={updateParticipant}
            onRemoveParticipant={removeParticipant}
            userRole={userRole}/>
        )}
      </div>

      {canEdit && <button onClick={addCoord} style={{
        marginTop:16, padding:"8px 18px",
        background:"#0E6B78", border:"none", borderRadius:6,
        color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700, ...M,
      }}>+ Add coordinator</button>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Participants tab — flat cross-coordinator participant list
// ──────────────────────────────────────────────────────────────────────
export function TSCParticipantsTab({ config, onUpdate, userRole }) {
  const allParticipants = (config.coordinators ?? []).flatMap(c =>
    (c.participants ?? []).map(p => ({ ...p, coordId: c.id, coordName: c.name }))
  );
  const totalUnitsCoord   = allParticipants.reduce((a, p) => a + (p.unitsCoord   ?? 0), 0);
  const totalUnitsPlanDev = allParticipants.reduce((a, p) => a + (p.unitsPlanDev ?? 0), 0);
  const canEdit = canEditServiceLines(userRole);
  const noCoords = (config.coordinators ?? []).length === 0;
  const rates = { ...DEFAULT_TSC_RATES, ...(config.rates ?? {}) };

  const updateParticipant = (coordId, pId, field, value) => onUpdate({
    ...config,
    coordinators: config.coordinators.map(c =>
      c.id === coordId
        ? { ...c, participants: c.participants.map(p => p.id === pId ? { ...p, [field]: value } : p) }
        : c
    ),
  });

  const removeParticipant = (coordId, pId) => onUpdate({
    ...config,
    coordinators: config.coordinators.map(c =>
      c.id === coordId
        ? { ...c, participants: c.participants.filter(p => p.id !== pId) }
        : c
    ),
  });

  const reassignParticipant = (oldCoordId, pId, newCoordId) => {
    if (oldCoordId === newCoordId) return;
    const participant = (config.coordinators.find(c => c.id === oldCoordId)?.participants ?? []).find(p => p.id === pId);
    if (!participant) return;
    onUpdate({
      ...config,
      coordinators: config.coordinators.map(c => {
        if (c.id === oldCoordId) return { ...c, participants: c.participants.filter(p => p.id !== pId) };
        if (c.id === newCoordId) return { ...c, participants: [...c.participants, participant] };
        return c;
      }),
    });
  };

  const addParticipant = () => {
    const firstCoord = config.coordinators[0];
    if (!firstCoord) return;
    onUpdate({
      ...config,
      coordinators: config.coordinators.map(c =>
        c.id === firstCoord.id
          ? { ...c, participants: [...c.participants, mkParticipant(`Participant ${allParticipants.length + 1}`, config.defaultUnitsPerParticipant)] }
          : c
      ),
    });
  };

  return (
    <div>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
        <Stat label="Total participants" value={allParticipants.length} />
        <Stat label="G9002 units/mo"     value={totalUnitsCoord} />
        <Stat label="G9007 units/yr"     value={totalUnitsPlanDev} />
      </div>

      {noCoords && (
        <div style={{ ...card, textAlign:"center", padding:40, color:"#64748b", marginBottom:12 }}>
          <div style={{ fontSize:13, marginBottom:8 }}>No coordinators found.</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>Add a coordinator in the Coordinators tab before adding participants.</div>
        </div>
      )}

      {!noCoords && allParticipants.length === 0 && (
        <div style={{ ...card, textAlign:"center", padding:40, color:"#64748b", marginBottom:12 }}>
          <div style={{ fontSize:13, marginBottom:8 }}>No participants yet.</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>Add participants and assign them to coordinators.</div>
        </div>
      )}

      {allParticipants.length > 0 && (
        <div style={{ ...card, padding:0, overflow:"hidden", marginBottom:12 }}>
          <div style={{
            display:"grid",
            gridTemplateColumns:"1.4fr 1.2fr 0.8fr 0.8fr 0.6fr 1fr 0.4fr",
            gap:8, padding:"8px 12px",
            background:"#eef1f6", borderBottom:"1px solid #d0dae8",
            ...labelStyle,
          }}>
            <span>Participant</span>
            <span>Coordinator</span>
            <span>G9002 u/mo</span>
            <span>G9007 u/yr</span>
            <span>Para</span>
            <span style={{ textAlign:"right" }}>Revenue</span>
            <span></span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"8px 12px" }}>
            {allParticipants.map(p =>
              <ParticipantFlatRow
                key={p.id}
                p={p}
                rates={rates}
                coordId={p.coordId}
                coordinators={config.coordinators}
                onUpdate={updateParticipant}
                onReassign={reassignParticipant}
                onRemove={removeParticipant}
                canEdit={canEdit}
                userRole={userRole}
              />
            )}
          </div>
        </div>
      )}

      {canEdit && <button
        onClick={addParticipant}
        disabled={noCoords}
        title={noCoords ? "Add a coordinator first" : ""}
        style={{
          marginTop:4, padding:"8px 18px",
          background: noCoords ? "#e2e8f0" : "#0E6B78",
          border:"none", borderRadius:6,
          color: noCoords ? "#94a3b8" : "#fff",
          cursor: noCoords ? "not-allowed" : "pointer",
          fontSize:12, fontWeight:700, ...M,
        }}
      >+ Add participant</button>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Productivity tab — utilization analysis
// ──────────────────────────────────────────────────────────────────────
export function TSCProductivityTab({ config }) {
  const summary = calcTSCService(config);

  if (summary.coordinatorCount === 0) {
    return (
      <div style={{ ...card, textAlign:"center", padding:40, color:"#64748b" }}>
        <div style={{ fontSize:13 }}>Add coordinators in the Roster tab to see productivity analysis.</div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ ...M, fontSize:14, color:"#0A3D47", margin:"0 0 14px 0", letterSpacing:1, textTransform:"uppercase" }}>
        Coordinator productivity
      </h3>

      <div style={{ ...card, padding:0, overflow:"hidden" }}>
        <div style={{
          display:"grid", gridTemplateColumns:"1.4fr 0.8fr 1fr 1fr 1fr 0.8fr 0.8fr 0.8fr",
          gap:0, padding:"10px 14px", background:"#eef1f6", borderBottom:"1px solid #d0dae8",
          ...labelStyle, color:"#475569",
        }}>
          <span>Coordinator</span>
          <span style={{ textAlign:"right" }}>Caseload</span>
          <span style={{ textAlign:"right" }}>Billable hr/mo</span>
          <span style={{ textAlign:"right" }}>Admin hr/mo</span>
          <span style={{ textAlign:"right" }}>Total hr/mo</span>
          <span style={{ textAlign:"right" }}>Utilization</span>
          <span style={{ textAlign:"right" }}>Billable %</span>
          <span style={{ textAlign:"right" }}>Margin</span>
        </div>
        {summary.coordinators.map(c => {
          const utilColor =
            c.metrics.utilization > 1.05 ? "#cf6e6e" :
            c.metrics.utilization > 0.85 ? "#22c55e" :
            c.metrics.utilization > 0.65 ? "#f59e0b" : "#cf6e6e";
          const marginColor =
            c.metrics.grossMargin > 0.40 ? "#22c55e" :
            c.metrics.grossMargin > 0.20 ? "#f59e0b" : "#cf6e6e";
          return (
            <div key={c.id} style={{
              display:"grid", gridTemplateColumns:"1.4fr 0.8fr 1fr 1fr 1fr 0.8fr 0.8fr 0.8fr",
              padding:"10px 14px", borderBottom:"1px solid #f1f5f9", alignItems:"center",
              fontSize:12, ...M, color:"#334155",
            }}>
              <span style={{ color:"#0A3D47", fontWeight:600 }}>{c.name}</span>
              <span style={{ textAlign:"right" }}>{c.metrics.caseloadSize}</span>
              <span style={{ textAlign:"right" }}>{c.metrics.monthlyBillable.toFixed(1)}</span>
              <span style={{ textAlign:"right" }}>{c.metrics.adminMonthly.toFixed(1)}</span>
              <span style={{ textAlign:"right" }}>{c.metrics.totalMonthlyHrs.toFixed(1)}</span>
              <span style={{ textAlign:"right", color:utilColor, fontWeight:700 }}>{pct(c.metrics.utilization)}</span>
              <span style={{ textAlign:"right" }}>{pct(c.metrics.billableShare)}</span>
              <span style={{ textAlign:"right", color:marginColor, fontWeight:700 }}>{pct(c.metrics.grossMargin)}</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop:16, padding:14, background:"#fffbe8", border:"1px solid #f4e4a8", borderRadius:8, fontSize:11, color:"#0A3D47", ...M, lineHeight:1.6 }}>
        <strong>Utilization color key:</strong> green = healthy 85-105% of an FTE (160 hr/month), amber = under-loaded
        (65-85%), red = either over-capacity (&gt;105%, burnout risk) or significantly under-utilized (&lt;65%, margin
        suffers). Billable share &lt; 75% suggests admin overhead is too high for the caseload.
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// P&L tab — coordinator-level + total
// ──────────────────────────────────────────────────────────────────────
export function TSCPLTab({ config, userRole }) {
  const summary    = calcTSCService(config);
  const showDollars = canSeeCompanyDollars(userRole);
  const cols = showDollars ? "2fr 1fr 1fr 1fr 1fr" : "2fr 1fr";

  if (summary.coordinatorCount === 0) {
    return (
      <div style={{ ...card, textAlign:"center", padding:40, color:"#64748b" }}>
        <div style={{ fontSize:13 }}>Add coordinators in the Roster tab to see P&amp;L.</div>
      </div>
    );
  }

  const offices = {};
  summary.coordinators.forEach(c => {
    const key = c.officeName?.trim() || '— Unassigned —';
    (offices[key] = offices[key] || []).push(c);
  });
  const isMultiOffice = Object.keys(offices).some(k => k !== '— Unassigned —');

  const rowStyle = {
    display:"grid", gridTemplateColumns:cols,
    padding:"10px 14px", borderBottom:"1px solid #f1f5f9", fontSize:12, ...M,
    color:"#334155",
  };

  const renderCoordRow = (c) => (
    <div key={c.id} style={rowStyle}>
      <span style={{ color:"#0A3D47", fontWeight:600 }}>{c.name}</span>
      {showDollars && <span style={{ textAlign:"right", color:"#D4A520" }}>{$k(c.metrics.annualRev)}</span>}
      {showDollars && <span style={{ textAlign:"right" }}>{$k(c.metrics.annualLabor)}</span>}
      {showDollars && <span style={{ textAlign:"right", color: c.metrics.gross > 0 ? "#22c55e" : "#cf6e6e" }}>{$k(c.metrics.gross)}</span>}
      <span style={{ textAlign:"right", color: c.metrics.grossMargin > 0.3 ? "#22c55e" : c.metrics.grossMargin > 0.15 ? "#f59e0b" : "#cf6e6e" }}>
        {pct(c.metrics.grossMargin)}
      </span>
    </div>
  );

  const renderOfficeSubtotal = (coords, label) => {
    const rev   = coords.reduce((a, c) => a + c.metrics.annualRev, 0);
    const labor = coords.reduce((a, c) => a + c.metrics.annualLabor, 0);
    const gross = rev - labor;
    return (
      <div key={`sub_${label}`} style={{ ...rowStyle, background:"#f7f9fc", fontWeight:700, borderTop:"1px solid #d0dae8" }}>
        <span style={{ color:"#475569" }}>{label} subtotal</span>
        {showDollars && <span style={{ textAlign:"right", color:"#D4A520" }}>{$k(rev)}</span>}
        {showDollars && <span style={{ textAlign:"right" }}>{$k(labor)}</span>}
        {showDollars && <span style={{ textAlign:"right", color: gross > 0 ? "#22c55e" : "#cf6e6e" }}>{$k(gross)}</span>}
        <span style={{ textAlign:"right", color: rev > 0 && gross/rev > 0.3 ? "#22c55e" : "#f59e0b" }}>{rev > 0 ? pct(gross/rev) : "—"}</span>
      </div>
    );
  };

  return (
    <div>
      <h3 style={{ ...M, fontSize:14, color:"#0A3D47", margin:"0 0 14px 0", letterSpacing:1, textTransform:"uppercase" }}>
        TSC service line P&amp;L
      </h3>

      <div style={{ ...card, padding:0, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:cols, padding:"10px 14px", background:"#eef1f6", borderBottom:"1px solid #d0dae8", ...labelStyle }}>
          <span>Coordinator</span>
          {showDollars && <span style={{ textAlign:"right" }}>Annual Rev</span>}
          {showDollars && <span style={{ textAlign:"right" }}>Annual Labor</span>}
          {showDollars && <span style={{ textAlign:"right" }}>Gross</span>}
          <span style={{ textAlign:"right" }}>Margin</span>
        </div>

        {isMultiOffice
          ? Object.entries(offices).map(([office, coords]) => (
              <div key={office}>
                <div style={{ ...rowStyle, background:"#eef7ff", fontWeight:700, fontSize:10, color:"#3b5fc0", borderBottom:"1px solid #c7d9f0" }}>
                  <span>📍 {office}</span>
                </div>
                {coords.map(renderCoordRow)}
                {renderOfficeSubtotal(coords, office)}
              </div>
            ))
          : summary.coordinators.map(renderCoordRow)
        }

        <div style={{ display:"grid", gridTemplateColumns:cols, padding:"12px 14px", background:"#0A2C35", color:"#D4A520", fontSize:13, fontWeight:800, ...M }}>
          <span>Total</span>
          {showDollars && <span style={{ textAlign:"right" }}>{$k(summary.totalAnnualRev)}</span>}
          {showDollars && <span style={{ textAlign:"right", color:"#e4eaf2" }}>{$k(summary.totalAnnualLabor)}</span>}
          {showDollars && <span style={{ textAlign:"right", color: summary.totalGross > 0 ? "#22c55e" : "#cf6e6e" }}>{$k(summary.totalGross)}</span>}
          <span style={{ textAlign:"right" }}>{pct(summary.totalMargin)}</span>
        </div>
      </div>

      <div style={{ marginTop:16, padding:14, background:"#f7f9fc", border:"1px solid #d0dae8", borderRadius:8, fontSize:11, color:"#475569", ...M, lineHeight:1.6 }}>
        <strong>Note:</strong> This P&amp;L is the TSC service line in isolation — direct labor only.
        Allocated company overhead, management fees, and billing fees flow through the Whole Company P&amp;L
        roll-up tab using the company's chosen allocation method.
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Staffing tab — admin & management staff matrix
// ──────────────────────────────────────────────────────────────────────
export function TSCStaffingTab({ config, onUpdate, userRole }) {
  const adminResult = calcTSCAdminStaff(config.adminStaff ?? []);
  const prod = config.productivity ?? {};
  const rev  = config.revenue      ?? {};
  const canEdit   = canEditServiceLines(userRole);
  const showCosts = canSeeCompanyDollars(userRole);
  const ro = !canEdit;

  const updateProd = (field, val) =>
    onUpdate({ ...config, productivity: { ...prod, [field]: val } });
  const updateRev = (field, val) =>
    onUpdate({ ...config, revenue: { ...rev, [field]: val } });

  const addStaff = () => onUpdate({
    ...config,
    adminStaff: [...(config.adminStaff ?? []), mkAdminStaffMember()],
  });
  const removeStaff = (id) => onUpdate({
    ...config,
    adminStaff: (config.adminStaff ?? []).filter(m => m.id !== id),
  });
  const updateStaff = (id, field, val) => onUpdate({
    ...config,
    adminStaff: (config.adminStaff ?? []).map(m => m.id === id ? { ...m, [field]: val } : m),
  });

  const factors = calcTSCProductivityFactors(prod);
  const nonBillablePct = ((prod.documentationTimePct ?? 15) + (prod.travelTimePct ?? 10) + (prod.noShowPct ?? 8) + (prod.qaReworkPct ?? 3));

  return (
    <div>
      <h3 style={{ ...M, fontSize:14, color:"#0A3D47", margin:"0 0 14px 0", letterSpacing:1, textTransform:"uppercase" }}>
        Administrative & management staffing
      </h3>

      {/* Admin staff table */}
      <div style={{ ...card, marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ display:"flex", gap:16 }}>
            <div>
              <div style={labelStyle}>Admin staff count</div>
              <div style={{ fontSize:18, fontWeight:800, color:"#0A3D47", ...M }}>{(config.adminStaff ?? []).length}</div>
            </div>
            {showCosts && (
              <div>
                <div style={labelStyle}>Total annual cost</div>
                <div style={{ fontSize:18, fontWeight:800, color:"#cf6e6e", ...M }}>{$k(adminResult.totalAnnualCost)}</div>
              </div>
            )}
          </div>
          {canEdit && <button onClick={addStaff} style={{
            padding:"6px 14px", background:"#fff", border:"1px dashed #c8d4e4",
            borderRadius:6, color:"#0A3D47", cursor:"pointer", fontSize:12, fontWeight:600, ...M,
          }}>+ Add staff</button>}
        </div>

        {(config.adminStaff ?? []).length === 0 && (
          <div style={{ textAlign:"center", padding:20, color:"#94a3b8", fontSize:12, ...M }}>
            No admin staff added. Direct coordinator labor only.
          </div>
        )}

        {adminResult.staff.length > 0 && (
          <>
            <div style={{
              display:"grid", gridTemplateColumns:`2fr 0.8fr 1fr 0.7fr 0.7fr${showCosts ? " 1fr" : ""} 0.4fr`,
              padding:"8px 10px", background:"#eef1f6", borderRadius:6,
              ...labelStyle, marginBottom:6,
            }}>
              <span>Role</span>
              <span style={{ textAlign:"right" }}>Mode</span>
              <span style={{ textAlign:"right" }}>Value</span>
              <span style={{ textAlign:"right" }}>FTE %</span>
              <span style={{ textAlign:"right" }}>Benefits %</span>
              {showCosts && <span style={{ textAlign:"right" }}>Annual cost</span>}
              <span></span>
            </div>
            {adminResult.staff.map(m => (
              <div key={m.id} style={{
                display:"grid", gridTemplateColumns:`2fr 0.8fr 1fr 0.7fr 0.7fr${showCosts ? " 1fr" : ""} 0.4fr`,
                gap:6, alignItems:"center", padding:"6px 10px",
                borderBottom:"1px solid #f1f5f9", fontSize:12, ...M,
              }}>
                <input type="text" value={m.role}
                  onChange={e => updateStaff(m.id, "role", e.target.value)}
                  readOnly={ro}
                  style={{ ...textInput, fontSize:12, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
                <select value={m.mode}
                  onChange={e => updateStaff(m.id, "mode", e.target.value)}
                  disabled={ro}
                  style={{ ...textInput, fontSize:11, padding:"3px 6px", textAlign:"right", pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}>
                  <option value="salary">Salary</option>
                  <option value="hourly">Hourly</option>
                </select>
                <input type="number" min={0} value={m.value}
                  onChange={e => updateStaff(m.id, "value", +e.target.value)}
                  readOnly={ro}
                  style={{ ...numInput, width:"100%", pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
                <input type="number" min={0} max={100} value={m.ftePct}
                  onChange={e => updateStaff(m.id, "ftePct", +e.target.value)}
                  readOnly={ro}
                  style={{ ...numInput, width:"100%", pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
                <input type="number" min={0} max={50} value={m.benefitsPct}
                  onChange={e => updateStaff(m.id, "benefitsPct", +e.target.value)}
                  readOnly={ro}
                  style={{ ...numInput, width:"100%", pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
                {showCosts && <span style={{ textAlign:"right", color:"#cf6e6e", fontWeight:700 }}>{$k(m.annualCost)}</span>}
                {canEdit && <button onClick={() => removeStaff(m.id)} style={{
                  border:"none", background:"transparent", cursor:"pointer",
                  color:"#cf6e6e", fontSize:14, padding:4,
                }}>✕</button>}
                {!canEdit && <span/>}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Productivity assumptions */}
      <h3 style={{ ...M, fontSize:14, color:"#0A3D47", margin:"0 0 14px 0", letterSpacing:1, textTransform:"uppercase" }}>
        Productivity assumptions
      </h3>

      <div style={{ ...card, marginBottom:20, display:"flex", gap:24, flexWrap:"wrap", alignItems:"flex-start" }}>
        <div>
          <div style={labelStyle}>Billable hours / day</div>
          <input type="number" min={1} max={10} step={0.5} value={prod.billableHoursPerDay ?? 6}
            onChange={e => updateProd("billableHoursPerDay", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, marginTop:4, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>Documentation time %</div>
          <input type="number" min={0} max={50} value={prod.documentationTimePct ?? 15}
            onChange={e => updateProd("documentationTimePct", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, marginTop:4, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>Travel time %</div>
          <input type="number" min={0} max={50} value={prod.travelTimePct ?? 10}
            onChange={e => updateProd("travelTimePct", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, marginTop:4, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>No-show %</div>
          <input type="number" min={0} max={50} value={prod.noShowPct ?? 8}
            onChange={e => updateProd("noShowPct", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, marginTop:4, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>QA rework %</div>
          <input type="number" min={0} max={20} value={prod.qaReworkPct ?? 3}
            onChange={e => updateProd("qaReworkPct", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, marginTop:4, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>

        {/* Visual breakdown bar */}
        <div style={{ flex:1, minWidth:200 }}>
          <div style={labelStyle}>Hours breakdown (per 8-hr day)</div>
          <div style={{ display:"flex", height:20, borderRadius:4, overflow:"hidden", marginTop:6, border:"1px solid #d0dae8" }}>
            {[
              { label:"Billable", pct: factors.effectiveBillablePct * 100, color:"#22c55e" },
              { label:"Docs",     pct: prod.documentationTimePct ?? 15,    color:"#f59e0b" },
              { label:"Travel",   pct: prod.travelTimePct        ?? 10,    color:"#94a3b8" },
              { label:"No-show",  pct: prod.noShowPct            ??  8,    color:"#cf6e6e" },
              { label:"QA",       pct: prod.qaReworkPct          ??  3,    color:"#a78bfa" },
            ].map(seg => (
              <div key={seg.label} style={{ width:`${Math.max(seg.pct, 0)}%`, background:seg.color, minWidth: seg.pct > 0 ? 2 : 0 }}/>
            ))}
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:4, fontSize:9, color:"#64748b", ...M }}>
            <span>🟩 Billable {(factors.effectiveBillablePct * 100).toFixed(0)}%</span>
            <span>🟨 Docs {prod.documentationTimePct ?? 15}%</span>
            <span>⬜ Travel {prod.travelTimePct ?? 10}%</span>
            <span>🟥 No-show {prod.noShowPct ?? 8}%</span>
            <span>🟪 QA {prod.qaReworkPct ?? 3}%</span>
          </div>
          {nonBillablePct > 60 && (
            <div style={{ marginTop:6, fontSize:10, color:"#cf6e6e", ...M }}>
              ⚠️ Non-billable burden exceeds 60% — coordinators may be under-producing.
            </div>
          )}
        </div>
      </div>

      {/* Revenue assumptions */}
      <h3 style={{ ...M, fontSize:14, color:"#0A3D47", margin:"0 0 14px 0", letterSpacing:1, textTransform:"uppercase" }}>
        Revenue collection assumptions
      </h3>

      <div style={{ ...card, display:"flex", gap:24, flexWrap:"wrap", alignItems:"flex-start" }}>
        <div>
          <div style={labelStyle}>Completion rate %</div>
          <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>Authorized units actually completed</div>
          <input type="number" min={0} max={100} value={rev.completionRate ?? 92}
            onChange={e => updateRev("completionRate", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>Billing success %</div>
          <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>Completed units successfully billed</div>
          <input type="number" min={0} max={100} value={rev.billingSuccessRate ?? 97}
            onChange={e => updateRev("billingSuccessRate", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>Collection rate %</div>
          <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>Billed claims paid</div>
          <input type="number" min={0} max={100} value={rev.collectionRate ?? 99}
            onChange={e => updateRev("collectionRate", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>Billing lag (days)</div>
          <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>Days from service to payment</div>
          <input type="number" min={0} max={180} value={rev.billingLagDays ?? 30}
            onChange={e => updateRev("billingLagDays", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div style={{ padding:"10px 14px", background:"#eef1f6", borderRadius:8, fontSize:11, ...M }}>
          <div style={labelStyle}>Effective collection rate</div>
          <div style={{ fontSize:18, fontWeight:800, color:"#22c55e", ...M }}>
            {((rev.completionRate ?? 92) * (rev.billingSuccessRate ?? 97) * (rev.collectionRate ?? 99) / 10000).toFixed(1)}%
          </div>
          <div style={{ fontSize:9, color:"#64748b", marginTop:2 }}>of authorized revenue collected</div>
        </div>
      </div>

      {/* Operational compliance assumptions */}
      <h3 style={{ ...M, fontSize:14, color:"#0A3D47", margin:"20px 0 14px 0", letterSpacing:1, textTransform:"uppercase" }}>
        Operational compliance assumptions
      </h3>

      <div style={{ ...card, display:"flex", gap:24, flexWrap:"wrap", alignItems:"flex-start" }}>
        <div>
          <div style={labelStyle}>Face-to-face compliance %</div>
          <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>Contacts meeting F2F requirement</div>
          <input type="number" min={0} max={100} value={rev.faceToFaceComplianceRate ?? 90}
            onChange={e => updateRev("faceToFaceComplianceRate", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>Plan dev completion %</div>
          <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>ISP plans completed on time</div>
          <input type="number" min={0} max={100} value={rev.planDevCompletionRate ?? 95}
            onChange={e => updateRev("planDevCompletionRate", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>Annual caseload churn %</div>
          <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>Annual participant turnover rate</div>
          <input type="number" min={0} max={100} value={rev.caseloadChurnRate ?? 15}
            onChange={e => updateRev("caseloadChurnRate", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div>
          <div style={labelStyle}>Denial write-off %</div>
          <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>Billed claims written off after denial</div>
          <input type="number" min={0} max={20} step={0.5} value={rev.denialWriteOffRate ?? 3}
            onChange={e => updateRev("denialWriteOffRate", +e.target.value)}
            readOnly={ro}
            style={{ ...numInput, width:64, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
        </div>
        <div style={{ padding:"10px 14px", background:"#fffbe8", border:"1px solid #f4e4a8", borderRadius:8, fontSize:10, color:"#0A3D47", ...M, lineHeight:1.6, maxWidth:260 }}>
          <strong>Note:</strong> These fields are operational planning inputs. Face-to-face and plan dev rates inform compliance risk; churn rate informs recruitment/onboarding cost modeling; denial write-off reduces net collected revenue.
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Scenario tab — rate / caseload / productivity adjustments
// ──────────────────────────────────────────────────────────────────────
export function TSCScenarioTab({ config, onUpdate, userRole }) {
  const sc = config.scenario ?? { rateAdjPct: 0, caseloadAdjPct: 0, productivityAdjPct: 0 };
  const canEdit   = canEditServiceLines(userRole);
  const showDollars = canSeeCompanyDollars(userRole);
  const ro = !canEdit;

  const { base, scenario, delta } = calcTSCScenario(config);
  const bev = calcTSCBreakEven(config);
  const caseloadCountVal = sc.caseloadCount ?? base.totalCaseload;

  // Reimbursement rate overrides — compact left-column panel (mirrors Home Mix Editor)
  const rates = { ...DEFAULT_TSC_RATES, ...(config.rates ?? {}) };
  const [ratesOpen, setRatesOpen] = useState(true);
  const canEditRates = canEdit;
  const setRate = (key, val) =>
    onUpdate({ ...config, rates: { ...rates, [key]: val } });
  const G9007_CAP = 48;
  const allPlanDev = (config.coordinators ?? []).flatMap(c =>
    (c.participants ?? []).map(p => p.unitsPlanDev ?? 0));
  const maxPlanDev = allPlanDev.length ? Math.max(...allPlanDev) : 0;
  const nApproaching = allPlanDev.filter(u => u >= 40).length;
  const $rate = n => `$${(n ?? 0).toFixed(2)}`;

  const updateScenario = (field, val) =>
    onUpdate({ ...config, scenario: { ...sc, [field]: val } });

  const $d = n => (n >= 0 ? "+" : "") + n.toLocaleString("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 });
  const pctD = n => (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
  const deltaColor = n => n >= 0 ? "#22c55e" : "#cf6e6e";

  const dollarRows = [
    { label:"Annual Revenue", base: base.totalAnnualRev,   scen: scenario.totalAnnualRev,   d: delta.totalAnnualRev,   fmt: $k, fmtD: $d },
    { label:"Annual Labor",   base: base.totalAnnualLabor, scen: scenario.totalAnnualLabor, d: delta.totalAnnualLabor, fmt: $k, fmtD: $d },
    { label:"Gross",          base: base.totalGross,       scen: scenario.totalGross,       d: delta.totalGross,       fmt: $k, fmtD: $d },
  ];
  const pctRows = [
    { label:"Margin",         base: base.totalMargin,      scen: scenario.totalMargin,      d: delta.totalMargin,      fmt: pct, fmtD: pctD },
    { label:"Coordinators",   base: base.coordinatorCount, scen: scenario.coordinatorCount, d: scenario.coordinatorCount - base.coordinatorCount, fmt: n => n, fmtD: n => (n >= 0 ? "+" : "") + n },
    { label:"Total Caseload", base: base.totalCaseload,    scen: scenario.totalCaseload,    d: scenario.totalCaseload - base.totalCaseload,    fmt: n => n, fmtD: n => (n >= 0 ? "+" : "") + n },
  ];
  const tableRows = showDollars ? [...dollarRows, ...pctRows] : pctRows;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:16, alignItems:"start" }}>
      {/* Left: reimbursement rates (compact — matches Home Mix Editor) */}
      {canSeeControl(userRole, 'tscRates') ? (
        <div style={{ padding:"10px 12px", background:"#FAF4E8", borderRadius:9, border:"1px solid #e0e8f0", pointerEvents: canEditRates ? "auto" : "none", opacity: canEditRates ? 1 : 0.65 }}>
          <button onClick={() => setRatesOpen(o => !o)} style={{
            background:"none", border:"none", cursor:"pointer", padding:0,
            display:"flex", alignItems:"center", gap:6, width:"100%",
            fontSize:9, color:"#9a8050", letterSpacing:2, textTransform:"uppercase", fontWeight:700,
          }}>
            <span style={{ fontSize:11, transition:"transform 200ms", transform: ratesOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
            Reimbursement Rates
          </button>
          {ratesOpen && (
            <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
              {TSC_RATE_FIELDS.map(f => {
                const val = rates[f.key] ?? f.baseline;
                return (
                  <div key={f.key}>
                    <div style={{ fontSize:9, color:"#5a7498", marginBottom:3 }}>
                      {f.label} <span style={{ color:"#9aabb8" }}>/15-min · {f.code}</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:3, flex:1 }}>
                        <span style={{ fontSize:10, color:"#9aabb8" }}>$</span>
                        <input type="number" step="0.01" value={val}
                          onChange={e => setRate(f.key, parseFloat(e.target.value) || 0)}
                          style={{ width:60, fontSize:12, fontWeight:600, color:f.color,
                            background:"#f8f8f8", border:"1px solid #d0dae8", borderRadius:5,
                            padding:"3px 6px", textAlign:"right" }}/>
                      </div>
                      <div style={{ display:"flex", gap:3 }}>
                        {[2,4,6].map(p => (
                          <button key={p} onClick={() =>
                            setRate(f.key, parseFloat((f.baseline * (1 - p/100)).toFixed(4)))}
                            style={{ fontSize:9, padding:"2px 4px", borderRadius:4, border:"1px solid #d0dae8",
                              background:"#fff", color:"#64748b", cursor:"pointer" }}>
                            −{p}%
                          </button>
                        ))}
                        <button onClick={() => setRate(f.key, f.baseline)}
                          style={{ fontSize:9, padding:"2px 4px", borderRadius:4, border:"1px solid #d0dae8",
                            background:"#fff", color:"#64748b", cursor:"pointer" }}>
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Unit caps + 15-min basis */}
              <div style={{ borderTop:"1px solid #e0e8f0", marginTop:2, paddingTop:8, display:"flex", flexDirection:"column", gap:8 }}>
                <div>
                  <div style={{ fontSize:9, color:"#5a7498", marginBottom:3 }}>Plan Dev cap (G9007)</div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#0A3D47", ...M, marginBottom:3 }}>
                    <span>{G9007_CAP} u / participant / yr</span>
                    <span style={{ color: maxPlanDev >= 40 ? "#cf6e6e" : "#64748b" }}>{maxPlanDev}/{G9007_CAP}</span>
                  </div>
                  <div style={{ position:"relative", height:5, background:"#e2e8f0", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ position:"absolute", inset:0, width:`${Math.min(100, (maxPlanDev / G9007_CAP) * 100)}%`, background: maxPlanDev >= 40 ? "#cf6e6e" : "#22c55e" }}/>
                  </div>
                  {nApproaching > 0 && (
                    <div style={{ fontSize:8.5, color:"#cf6e6e", ...M, marginTop:3 }}>{nApproaching} participant(s) ≥ 40 — near cap</div>
                  )}
                </div>
                <div style={{ fontSize:9, color:"#5a7498" }}>
                  Service Coord (G9002): <span style={{ color:"#9aabb8" }}>no monthly cap</span>
                </div>
                <div>
                  <div style={{ fontSize:9, color:"#5a7498", marginBottom:2 }}>Unit basis</div>
                  <div style={{ fontSize:9, color:"#64748b", ...M, lineHeight:1.6 }}>
                    1 unit = 15 min · 4 = 1 hr<br/>
                    e.g. 3 × {$rate(rates.coord)} = {$rate(rates.coord * 3)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : <div/>}

      {/* Right: scenario modeling */}
      <div>
      <h3 style={{ ...M, fontSize:14, color:"#0A3D47", margin:"0 0 14px 0", letterSpacing:1, textTransform:"uppercase" }}>
        Scenario modeling
      </h3>

      {/* Adjustment inputs */}
      <div style={{ ...card, marginBottom:20, display:"flex", gap:32, flexWrap:"wrap" }}>
        {[
          { label:"Rate adjustment",       field:"rateAdjPct",        hint:"Adjusts billed rates ±50%",                              val: sc.rateAdjPct ?? 0,        min:-50,  max:50,  unit:"%",   step:1 },
          { label:"Caseload (participants)",field:"caseloadCount",     hint:"Target participant count for scenario (1–60)",            val: caseloadCountVal,          min:1,    max:60,  unit:"pts", step:1 },
          { label:"Productivity adjustment",field:"productivityAdjPct",hint:"Adjusts billable units per participant (−100% to +100%)", val: sc.productivityAdjPct ?? 0,min:-100, max:100, unit:"%",   step:1 },
        ].map(({ label, field, hint, val, min, max, unit, step }) => (
          <div key={field}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize:10, color:"#64748b", ...M, marginBottom:4 }}>{hint}</div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <input type="range" min={min} max={max} step={step} value={val}
                onChange={e => updateScenario(field, +e.target.value)}
                disabled={ro}
                style={{ width:120, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
              <input type="number" min={-50} max={50} value={val}
                onChange={e => updateScenario(field, +e.target.value)}
                readOnly={ro}
                style={{ ...numInput, width:56, pointerEvents: ro ? "none" : "auto", opacity: ro ? 0.65 : 1 }}/>
              <span style={{ fontSize:11, color:"#334155", ...M }}>%</span>
            </div>
          </div>
        ))}
        {canEdit && <button onClick={() => onUpdate({ ...config, scenario: { rateAdjPct:0, caseloadAdjPct:0, productivityAdjPct:0 } })}
          style={{ alignSelf:"flex-end", padding:"6px 12px", background:"#fff", border:"1px solid #c8d4e4", borderRadius:5, fontSize:10, cursor:"pointer", ...M }}>
          Reset
        </button>}
      </div>

      {/* Base vs scenario comparison */}
      <div style={{ ...card, padding:0, overflow:"hidden", marginBottom:20 }}>
        <div style={{
          display:"grid", gridTemplateColumns:"1.5fr 1fr 1fr 1fr",
          padding:"10px 14px", background:"#eef1f6", borderBottom:"1px solid #d0dae8", ...labelStyle,
        }}>
          <span>Metric</span>
          <span style={{ textAlign:"right" }}>Base</span>
          <span style={{ textAlign:"right" }}>Scenario</span>
          <span style={{ textAlign:"right" }}>Delta</span>
        </div>
        {tableRows.map(({ label, base: b, scen, d, fmt, fmtD }) => (
          <div key={label} style={{
            display:"grid", gridTemplateColumns:"1.5fr 1fr 1fr 1fr",
            padding:"10px 14px", borderBottom:"1px solid #f1f5f9", fontSize:12, ...M,
          }}>
            <span style={{ color:"#475569" }}>{label}</span>
            <span style={{ textAlign:"right", color:"#0A3D47" }}>{fmt(b)}</span>
            <span style={{ textAlign:"right", color:"#D4A520", fontWeight:700 }}>{fmt(scen)}</span>
            <span style={{ textAlign:"right", color: deltaColor(d), fontWeight:700 }}>{fmtD(d)}</span>
          </div>
        ))}
      </div>

      {/* Break-even analysis */}
      <h3 style={{ ...M, fontSize:14, color:"#0A3D47", margin:"0 0 14px 0", letterSpacing:1, textTransform:"uppercase" }}>
        Break-even analysis
      </h3>

      <div style={{ ...card, display:"flex", gap:20, flexWrap:"wrap" }}>
        <div>
          <div style={labelStyle}>Break-even caseload</div>
          <div style={{ fontSize:24, fontWeight:800, color:"#0A3D47", ...M }}>
            {bev.breakEvenCaseload ?? "—"}
          </div>
          <div style={{ fontSize:9, color:"#64748b", ...M }}>participants needed to cover fixed costs</div>
        </div>
        <div>
          <div style={labelStyle}>Current caseload</div>
          <div style={{ fontSize:24, fontWeight:800, color: bev.currentCaseload >= (bev.breakEvenCaseload ?? 0) ? "#22c55e" : "#cf6e6e", ...M }}>
            {bev.currentCaseload}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Safety margin</div>
          <div style={{ fontSize:24, fontWeight:800, color: (bev.safetyMarginPct ?? 0) > 0.2 ? "#22c55e" : "#cf6e6e", ...M }}>
            {bev.safetyMarginPct != null ? pct(bev.safetyMarginPct) : "—"}
          </div>
          <div style={{ fontSize:9, color:"#64748b", ...M }}>above break-even</div>
        </div>
        {showDollars && (
          <div>
            <div style={labelStyle}>Rev per participant/yr</div>
            <div style={{ fontSize:24, fontWeight:800, color:"#D4A520", ...M }}>
              {bev.revenuePerParticipant > 0 ? $k(bev.revenuePerParticipant) : "—"}
            </div>
          </div>
        )}
        {showDollars && (
          <div>
            <div style={labelStyle}>Fixed costs (admin)</div>
            <div style={{ fontSize:24, fontWeight:800, color:"#cf6e6e", ...M }}>
              {$k(bev.fixedCosts)}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
