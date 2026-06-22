import { useState, useMemo, useRef, useEffect } from "react";

// ── New architecture imports ──
import { migrateConfig, getSelectedCompany, createServiceLine, createSharedConfig } from "../lib/companyShape.js";
import { SERVICE_LINE_TYPES, SERVICE_LINE_DEFS, getShortLabel, getGroupedPickerOptions } from "../serviceLines/types.js";
import { ratesForLine } from "../data/idahoRates.js";
import { TSCRosterTab, TSCCoordinatorsTab, TSCParticipantsTab, TSCProductivityTab, TSCPLTab, TSCStaffingTab, TSCScenarioTab, calcTSCService } from "../serviceLines/tsc.jsx";
import { ChildrensDDARosterTab, ChildrensDDAParticipantsTab, ChildrensDDACaseloadTab, ChildrensDDAProductivityTab, ChildrensDDAPLTab, ChildrensDDARateScheduleTab, calcChildrensDDAService } from "../serviceLines/childrens_dda.jsx";
import { CSERosterTab, CSEProductivityTab, CSEPLTab, CSERateScheduleTab, calcCSEService } from "../serviceLines/cse.jsx";
import { SchoolBasedRosterTab, SchoolBasedProductivityTab, SchoolBasedPLTab, SchoolBasedRateScheduleTab, SchoolBasedStaffingTab, SchoolBasedScenarioTab, SchoolBasedParticipantsTab, calcSchoolBasedService } from "../serviceLines/school_based.jsx";
import { budgetRowVisibility, canAddServiceLine, canEditServiceLines, canSeeCompanyDollars, canSeeControl, canSeeTopNumbers, editMode, wageDisplayMode, ROLE_TIERS } from "../lib/access.js";

import { LOGO } from "../assets/logo.js";
import posthog, { useFeatureFlag } from "../lib/posthog.js";


/* ══════════════════════════════════════════════════════════
   RATES & CONSTANTS
══════════════════════════════════════════════════════════ */
const RATES_DEF = { intenseDaily: 678.77, highDaily: 368.67, iuUnit: 7.07, igUnit: 3.61 };

/* ══════════════════════════════════════════════════════════
   FORMATTERS
══════════════════════════════════════════════════════════ */
const $k  = n => n.toLocaleString("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 });
const $d  = n => `$${n.toFixed(2)}`;
const pct = n => `${(n * 100).toFixed(1)}%`;
const mc  = p => p > 0.62 ? "#00e5aa" : p > 0.52 ? "#22c55e" : p > 0.42 ? "#f59e0b" : p > 0.30 ? "#fb923c" : "#f87171";
const nmc = p => p > 0.45 ? "#00e5aa" : p > 0.35 ? "#22c55e" : p > 0.25 ? "#f59e0b" : p > 0.12 ? "#fb923c" : "#f87171";

/* ══════════════════════════════════════════════════════════
   TAX
══════════════════════════════════════════════════════════ */
const calcTax = (ebitda, entityType, ownerRate) => {
  if (ebitda <= 0) return { stateTax:0, federalTax:0, totalTax:0, netIncome:ebitda };
  if (entityType === "ccorp") {
    const stateTax   = ebitda * 0.058;
    const federalTax = (ebitda - stateTax) * 0.21;
    const totalTax   = stateTax + federalTax;
    return { stateTax, federalTax, totalTax, netIncome: ebitda - totalTax };
  }
  const rate     = ownerRate / 100;
  const stateTax = ebitda * 0.058;
  const fedTax   = ebitda * Math.max(0, rate - 0.058);
  return { stateTax, federalTax: fedTax, totalTax: ebitda * rate, netIncome: ebitda * (1 - rate) };
};

/* ══════════════════════════════════════════════════════════
   CORE LABOR & REVENUE CALC

   Rules:
   ▸ Max 3 clients per home (enforced in UI)
   ▸ All-high (nIntense=0): 1 staff covers all (up to 1:3) = 24 labor hrs, no group billing
   ▸ Single intense only (total=1): 1:1 all 24 hrs, no group possible
   ▸ Has intense + 2+ total: group hours apply
       Night group : 1 staff × gHrs
       Day         : ceil(nHigh/2) high staff + nIntense intense 1:1 staff, × dHrs
   ▸ Normal Intense billing : $678.77/day regardless of group hrs
   ▸ Blended billing        : dHrs × IU_HR + gHrs × IG_HR per intense client
══════════════════════════════════════════════════════════ */
function calcHome({ nHigh, nIntense, groupHrs, billingType, hhrsPerWeek = 0, graveyardSleepHrs = 0 }, wage, rates = RATES_DEF, graveyardWage = null) {
  const IU_HR  = rates.iuUnit * 4;   // $28.28/hr
  const IG_HR  = rates.igUnit * 4;   // $14.44/hr
  const sleepWage = (graveyardWage != null && graveyardWage > 0) ? graveyardWage : wage;
  const total  = nHigh + nIntense;
  if (total === 0) return { laborHrs:0, rev:0, labor:0, gross:0, margin:0, annualRev:0, annualGross:0, annualLabor:0, plHr:0, gHrs:0, dHrs:24, hhrsRev:0, hhrsLabor:0, sleepHrs:0, awakeNightHrs:0 };

  const canGroup  = nIntense > 0 && total >= 2;
  const gHrs      = canGroup ? Math.max(0, Math.min(groupHrs, 20)) : 0;
  const dHrs      = 24 - gHrs;

  // ── Graveyard sleep hours apply to ALL home types ────────────────────────
  // For grouped homes: sleeping hrs are within the group night window (max = gHrs)
  // For all-high or single-client: sleeping hrs are within the overnight shift (max = 12)
  const maxSleepHrs = canGroup ? gHrs : 12;
  const sleepHrs      = Math.max(0, Math.min(graveyardSleepHrs, maxSleepHrs));
  const awakeNightHrs = canGroup ? gHrs - sleepHrs : 0;

  // ── Labor hours (structural count, unchanged) ────────────────────────────
  let laborHrs;
  if (nIntense === 0) {
    laborHrs = 24;
  } else if (total === 1) {
    laborHrs = 24;
  } else {
    const highDayStaff = nHigh > 0 ? Math.ceil(nHigh / 2) : 0;
    laborHrs = gHrs + dHrs * (highDayStaff + nIntense);
  }

  // ── Revenue ───────────────────────────────────────────────────────────────
  const highRev    = nHigh * rates.highDaily;
  const intenseRev = billingType === "normal"
    ? nIntense * rates.intenseDaily
    : nIntense * (dHrs * IU_HR + gHrs * IG_HR);

  // ── Labor cost with graveyard sleep wage ─────────────────────────────────
  let laborCost;
  if (canGroup) {
    // Grouped: 1 night staff (split sleep/awake) + day staff at regular wage
    const highDayStaff = nHigh > 0 ? Math.ceil(nHigh / 2) : 0;
    const nightCost = awakeNightHrs * wage + sleepHrs * sleepWage;
    const dayCost   = dHrs * (highDayStaff + nIntense) * wage;
    laborCost = nightCost + dayCost;
  } else {
    // All-high or single-client: 1 staff covers all hours
    // sleepHrs at sleepWage, remaining at regular wage
    const awakeHrs = 24 - sleepHrs;
    laborCost = sleepHrs * sleepWage + awakeHrs * wage;
  }

  // ── 1:1 individual hours for High Support clients (weekly, billed U2) ────
  const hhrsPerDay  = (hhrsPerWeek * 52) / 365;
  const hhrsRev     = nHigh > 0 ? nHigh * hhrsPerDay * IU_HR : 0;
  const hhrsLabor   = nHigh > 0 ? nHigh * hhrsPerDay * wage  : 0;
  const extraHrs    = nHigh > 0 ? nHigh * hhrsPerDay : 0;

  const rev    = highRev + intenseRev + hhrsRev;
  const labor  = laborCost + hhrsLabor;
  const gross  = rev - labor;
  const margin = rev > 0 ? gross / rev : 0;
  const totalLaborHrs = laborHrs + extraHrs;

  return { laborHrs: totalLaborHrs, rev, labor, gross, margin,
    annualRev: rev*365, annualGross: gross*365, annualLabor: labor*365,
    plHr: totalLaborHrs > 0 ? gross / totalLaborHrs : 0, gHrs, dHrs,
    hhrsRev, hhrsLabor, hhrsPerDay, sleepHrs, awakeNightHrs, maxSleepHrs };
}

/* ══════════════════════════════════════════════════════════
   ID FACTORY & DEFAULTS
══════════════════════════════════════════════════════════ */
let _uid = 400;
const uid = () => ++_uid;

const mkHome = (label, nHigh, nIntense, groupHrs, billingType) =>
  ({ id:uid(), label, nHigh, nIntense, groupHrs, billingType, hhrsPerWeek:0, graveyardSleepHrs:0 });

// Expand legacy home-type entries (numHomes multiplier) into individual home objects.
// Used at read-time so existing saves with config.homes are transparently migrated.
const expandHomeTypes = (homeTypes = []) =>
  homeTypes.flatMap(ht => {
    const count = ht.numHomes || 1;
    return Array.from({ length: count }, (_, i) => ({
      id: uid(),
      label: count > 1 ? `${ht.label} ${i + 1}` : ht.label,
      nHigh:             ht.nHigh,
      nIntense:          ht.nIntense,
      groupHrs:          ht.groupHrs,
      billingType:       ht.billingType,
      hhrsPerWeek:       ht.hhrsPerWeek       ?? 0,
      graveyardSleepHrs: ht.graveyardSleepHrs ?? 0,
    }));
  });
const DEFAULT_HOMES = [
  mkHome("Maple House",  2, 1, 12, "normal"),
  mkHome("Cedar House",  3, 0,  0, "normal"),
  mkHome("Pine House",   1, 2, 10, "normal"),
  mkHome("Birch House",  0, 3, 12, "normal"),
];

const MGMT_DEF = [
  { id:1, role:"CEO / Executive Director",  salary:110000 },
  { id:2, role:"Director of Operations",    salary:85000  },
  { id:3, role:"Clinical Director / QA",    salary:80000  },
  { id:4, role:"Program Managers (×2)",     salary:110000 },
  { id:5, role:"HR Manager",                salary:60000  },
  { id:6, role:"Billing Specialists (×2)",  salary:90000  },
  { id:7, role:"Scheduling / Admin (×2)",   salary:80000  },
];
const OVHD_DEF = [
  { id:1, item:"Office Lease",                   amount:36000 },
  { id:2, item:"Professional Liability Ins.",    amount:70000 },
  { id:3, item:"Training & Development",         amount:45000 },
  { id:4, item:"EVV / EMR Technology",           amount:36000 },
  { id:5, item:"Background Checks & Hiring",     amount:30000 },
  { id:6, item:"Legal & Accounting",             amount:45000 },
  { id:7, item:"Marketing & Referral Dev.",      amount:25000 },
  { id:8, item:"Vehicle Fleet",                  amount:48000 },
  { id:9, item:"Supplies & Misc.",               amount:25000 },
];

/* ══════════════════════════════════════════════════════════
   HOURLY PARTICIPANT MODEL
   Rates match Intense Individual (U2) / Intense Group (U3)
   Tracked per-participant with weekly cap + annual auth
══════════════════════════════════════════════════════════ */
const mkHourly = (name) => ({
  id: uid(), name,
  indHrsPerWeek:   10,   // individual authorized hrs/week
  groupHrsPerWeek:  5,   // group authorized hrs/week
  weeklyCapHrs:    15,   // total weekly cap (ind + group combined)
  weeksPerYear:    52,   // annual authorization weeks
  groupSize:        2,   // # of participants sharing group time (for labor split)
});

const DEFAULT_HOURLY = [
  mkHourly("Client A"),
  mkHourly("Client B"),
];

function calcHourlyParticipant(p, rates, wage) {
  const IU_HR = rates.iuUnit * 4;  // $28.28/hr
  const IG_HR = rates.igUnit * 4;  // $14.44/hr
  const indHrs   = Math.min(p.indHrsPerWeek,  p.weeklyCapHrs);
  const remaining= Math.max(0, p.weeklyCapHrs - indHrs);
  const groupHrs = Math.min(p.groupHrsPerWeek, remaining);
  const totalWeeklyHrs = indHrs + groupHrs;
  const annualIndHrs   = indHrs   * p.weeksPerYear;
  const annualGroupHrs = groupHrs * p.weeksPerYear;
  const annualIndRev   = annualIndHrs  * IU_HR;
  const annualGroupRev = annualGroupHrs * IG_HR;
  const annualRev      = annualIndRev + annualGroupRev;
  // Labor: individual is 1:1; group is split among group size
  const annualIndLabor   = annualIndHrs  * wage;
  const annualGroupLabor = (annualGroupHrs * wage) / Math.max(1, p.groupSize);
  const annualLabor      = annualIndLabor + annualGroupLabor;
  const gross  = annualRev - annualLabor;
  const margin = annualRev > 0 ? gross / annualRev : 0;
  return {
    indHrs, groupHrs, totalWeeklyHrs,
    annualIndHrs, annualGroupHrs, annualRev, annualIndRev, annualGroupRev,
    annualLabor, annualIndLabor, annualGroupLabor,
    gross, margin,
    weeklyRev: annualRev / Math.max(1, p.weeksPerYear),
  };
}

const M = { fontFamily:"'DM Mono',monospace" };

function Slider({ label, value, min, max, step=1, onChange, color="#0E6B78", format }) {
  const p = ((value-min)/(max-min))*100;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
        <span style={{ fontSize:9.5, color:"#7a6030", textTransform:"uppercase", letterSpacing:1.2, fontFamily:"'DM Mono',monospace", fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:15, fontWeight:800, color, fontFamily:"'DM Mono',monospace", letterSpacing:-0.5 }}>{format?format(value):value}</span>
      </div>
      <div style={{ position:"relative", height:5, background:"#ddd8cc", borderRadius:3 }}>
        <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${p}%`, background:`linear-gradient(90deg,${color}70,${color})`, borderRadius:3 }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e=>onChange(Number(e.target.value))}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", margin:0 }} />
        <div style={{ position:"absolute", top:"50%", left:`${p}%`, transform:"translate(-50%,-50%)", width:14, height:14, borderRadius:"50%", background:color, border:"2.5px solid #fff", pointerEvents:"none", boxShadow:`0 1px 4px ${color}50` }} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
        <span style={{ fontSize:9, color:"#b5a880", fontFamily:"'DM Mono',monospace" }}>{format?format(min):min}</span>
        <span style={{ fontSize:9, color:"#b5a880", fontFamily:"'DM Mono',monospace" }}>{format?format(max):max}</span>
      </div>
    </div>
  );
}

function Stepper({ label, value, min=0, max=3, onChange, color="#0A3D47", disabled }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
      <div style={{ fontSize:9, color:disabled?"#9a8050":"#5a4020", textTransform:"uppercase", letterSpacing:0.8, ...M, textAlign:"center" }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", background:"#fff", borderRadius:8, border:`1px solid ${disabled?"#c8d4e4":"#d5c898"}`, overflow:"hidden", opacity:disabled?0.4:1, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <button onClick={()=>!disabled&&onChange(Math.max(min,value-1))} style={{ width:28, height:28, background:"none", border:"none", color:"#9a8050", cursor:disabled?"not-allowed":"pointer", fontSize:16, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
        <div style={{ width:30, textAlign:"center", fontWeight:800, color, fontFamily:"'DM Mono',monospace", fontSize:15, borderLeft:"1px solid #e8edf3", borderRight:"1px solid #e8edf3" }}>{value}</div>
        <button onClick={()=>!disabled&&onChange(Math.min(max,value+1))} style={{ width:28, height:28, background:"none", border:"none", color:"#9a8050", cursor:disabled?"not-allowed":"pointer", fontSize:16, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
      </div>
    </div>
  );
}

function Toggle({ value, options, onChange, small }) {
  return (
    <div style={{ display:"flex", background:"#ebebeb", borderRadius:7, border:"1px solid #d0dae8", overflow:"hidden" }}>
      {options.map(opt=>(
        <button key={opt.value} onClick={()=>onChange(opt.value)} style={{
          flex:1, padding:small?"5px 8px":"7px 10px", border:"none", cursor:"pointer",
          fontSize:small?10:11, fontWeight:700, ...M, whiteSpace:"nowrap", transition:"all 0.15s",
          background:value===opt.value?opt.color+"22":"none",
          color:value===opt.value?opt.color:"#7a5020",
          borderBottom:value===opt.value?`2px solid ${opt.color}`:"2px solid transparent",
        }}>{opt.label}</button>
      ))}
    </div>
  );
}

function MarginRing({ p, size=52 }) {
  const r=(size/2)-5, circ=2*Math.PI*r, col=mc(Math.max(0,p));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#FAF4E8" strokeWidth={4.5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={4.5}
        strokeDasharray={circ} strokeDashoffset={circ*(1-Math.max(0,Math.min(1,p)))}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+4} textAnchor="middle" fill={col} fontSize={10} fontWeight={800} fontFamily="monospace">
        {(p*100).toFixed(0)}%
      </text>
    </svg>
  );
}

function Chip({ label, value, color, highlight }) {
  return (
    <div style={{
      background: highlight ? color+"18" : "#fff",
      borderRadius:10, padding:"10px 15px",
      border: highlight ? `1px solid ${color}45` : "1px solid #e2e8f0",
      borderLeft: `3px solid ${highlight ? color : "#e2e8f0"}`,
      minWidth:110, flex:"1 1 auto",
      boxShadow: highlight ? `0 2px 8px ${color}20` : "0 1px 3px rgba(13,26,42,0.05)",
    }}>
      <div style={{ fontSize:8, color:"#94a3b8", textTransform:"uppercase", letterSpacing:1.8, fontFamily:"'DM Mono',monospace", fontWeight:500, marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color, fontFamily:"'DM Mono',monospace", lineHeight:1, letterSpacing:-0.5 }}>{value}</div>
    </div>
  );
}

function SL({ children }) {
  return <div style={{ fontSize:9, color:"#5a4020", textTransform:"uppercase", letterSpacing:2, ...M, marginBottom:10 }}>{children}</div>;
}

function MixBadges({ nHigh, nIntense, size=22 }) {
  return (
    <div style={{ display:"flex", gap:3 }}>
      {Array(nHigh).fill("H").concat(Array(nIntense).fill("I")).concat(Array(Math.max(0,3-nHigh-nIntense)).fill(null)).map((s,i)=>(
        <div key={i} style={{ width:size, height:size, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:9, fontWeight:800, ...M,
          background:s==="H"?"#C9921A20":s==="I"?"#D4A52020":"#FAF4E8",
          border:s==="H"?"1px solid #C9921A60":s==="I"?"1px solid #D4A52060":"1px dashed #d0dae8",
          color:s==="H"?"#C9921A":s==="I"?"#D4A520":"#d5c898",
        }}>{s||"·"}</div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   COMPANY P&L PANEL
══════════════════════════════════════════════════════════ */
function CompanyPL({ co, mgmt, overhead, onMgmt, onOvhd, entityType, ownerRate, mgmtFeePct, billingFeePct, slBreakdown, title, userRole }) {
  const [showEdit, setShowEdit] = useState(false);
  const { annualRevGross, annualRevNet, annualDirectLabor, payrollBurden, totalLabor,
    mgmtTotal, overheadTotal, mgmtFee, billingFee, totalCosts, ebitda, ebitdaMargin,
    stateTax, federalTax, totalTax, netIncome, netMargin } = co;
  const showDollars = canSeeCompanyDollars(userRole);
  const isCorp   = entityType==="ccorp";
  const effTax   = ebitda>0 ? totalTax/ebitda : 0;
  const netColor = nmc(Math.max(0,netMargin));

  // Only render per-SL sub-rows when 2+ service lines are active (single-SL is redundant)
  const showBreakdown = slBreakdown && slBreakdown.length >= 2;

  const rows = [
    { l:"── REVENUE ──",                                  v: null,                        t:"hdr" },
    ...(showBreakdown ? slBreakdown.map(sl => ({ l:`  ↳ ${sl.label}  ·  ${sl.detail}`, v: sl.rev, t:"sl-rev" })) : []),
    { l:"Gross Revenue (100% occ.)",                    v: annualRevGross,              t:"rev" },
    { l:"Occupancy Adjustment",                         v: annualRevNet-annualRevGross,  t:"ded" },
    { l:"Net Revenue",                                  v: annualRevNet,                 t:"sub" },
    null,
    { l:"── COSTS ──",                                   v: null,                        t:"hdr" },
    ...(showBreakdown ? slBreakdown.map(sl => ({ l:`  ↳ ${sl.label}  ·  ${sl.detail}`, v: -sl.labor, t:"sl-labor" })) : []),
    { l: showBreakdown ? "Direct Care Labor (total)" : "Direct Care Labor", v:-annualDirectLabor, t:"cost" },
    { l:"Payroll Burden (22%)",                         v:-payrollBurden,               t:"cost" },
    { l:"Management & Admin (Salaries)",                v:-mgmtTotal,                   t:"cost" },
    { l:"Operating Overhead",                           v:-overheadTotal,               t:"cost" },
    { l:`Management Fee (${mgmtFeePct}% of revenue)`,  v:-mgmtFee,                     t:"fee" },
    { l:`Billing Fee (${billingFeePct}% of revenue)`,  v:-billingFee,                  t:"fee" },
    { l:"Total Costs",                                  v:-totalCosts,                  t:"sub" },
    null,
    { l:"EBITDA",                        v: ebitda,                      t:"ebitda" },
    { l:"EBITDA Margin",                 v: pct(ebitdaMargin),           t:"epct" },
    null,
    { l:"── TAXES ──",                                   v: null,                        t:"hdr" },
    { l:"Idaho State Tax (5.8%)",        v:-stateTax,                    t:"tax" },
    { l:isCorp?"Federal Corporate (21%)":  `Federal/Personal (${((ownerRate/100-0.058)*100).toFixed(1)}% est.)`,
                                         v:-federalTax,                  t:"tax" },
    { l:`Total Tax  ·  Eff. ${pct(effTax)}`, v:-totalTax,               t:"taxsub" },
    null,
    { l:isCorp?"Net Income (After-Tax)":"Owner Net Income (Est.)", v:netIncome, t:"net" },
    { l:isCorp?"Net Profit Margin":      "Net Margin (Est.)",      v:pct(netMargin), t:"npct" },
  ];

  // Light-theme P&L palette — readable on parchment, semantic but not alarming
  const POS = "#0f7a4f", NEG = "#c0453a";
  // row background — subtle tints for highlight rows, no dark bands
  const rb = t =>
    t==="net"||t==="npct"   ? (netIncome>=0 ? "#e7f4ec" : "#fcece9") :
    t==="ebitda"||t==="epct"? (ebitda>=0    ? "#e9f5ee" : "#fdedeb") :
    t==="taxsub"            ? "#f6f0e4" :
    t==="sub"               ? "#f0ece2" : "transparent";
  // label (left cell) color — neutral and readable
  const lc = t =>
    t==="hdr"               ? "#9a8050" :
    t==="ebitda"||t==="net" ? "#33291a" :
    t==="epct"||t==="npct"  ? "#6a5a40" :
    t==="sub"||t==="rev"    ? "#33291a" :
    t==="sl-rev"||t==="sl-labor" ? "#8a7a5a" : "#5a4838";
  // value (right cell) color — semantic
  const vc = t =>
    t==="net"||t==="npct"   ? (netIncome>=0 ? POS : NEG) :
    t==="ebitda"||t==="epct"? (ebitda>=0    ? POS : NEG) :
    t==="rev"||t==="sub"    ? "#33291a" :
    t==="cost"||t==="ded"||t==="fee"||t==="tax"||t==="taxsub"||t==="sl-labor" ? NEG :
    t==="sl-rev"            ? "#6a5a30" : "#5a4838";
  const bd = t => ["sub","ebitda","net","taxsub","rev"].includes(t);
  const emph = t => t==="ebitda" || t==="net";
  const fs = t => t==="ebitda"||t==="net" ? 15 : t==="epct"||t==="npct" ? 12 : t==="hdr" ? 9 : t==="sl-rev"||t==="sl-labor" ? 10 : 11.5;
  const fw = t => t==="ebitda"||t==="net" ? 800 : bd(t) ? 700 : t==="hdr" ? 600 : 400;

  return (
    <div style={{ background:"#FAF4E8", borderRadius:13, border:"1px solid #d0dae8", overflow:"hidden" }}>
      <div style={{ padding:"16px 20px", borderBottom:"1px solid #d0dae8" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <SL>{title ?? `Annual P&L — ${co.totalHomes} homes / ${co.totalClients} clients`}</SL>
          {showDollars && (
            <button onClick={()=>setShowEdit(!showEdit)} style={{ fontSize:10, color:"#0E6B78", background:"none", border:"1px solid #d0dae8", borderRadius:5, padding:"3px 10px", cursor:"pointer", ...M }}>
              {showEdit?"▲ Done":"▼ Edit Overhead"}
            </button>
          )}
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <tbody>
            {rows.map((row,i)=> !row
              ? <tr key={i}><td colSpan={2} style={{ height:8 }}/></tr>
              : <tr key={i} style={{ borderBottom: row.t==="hdr" ? "none" : "1px solid #ece7dd", background:rb(row.t) }}>
                  <td style={{ padding: row.t==="hdr" ? "10px 12px 4px" : emph(row.t) ? "11px 12px" : "7px 12px", color:lc(row.t), fontWeight:fw(row.t), fontFamily: row.t==="hdr" ? "'DM Mono',monospace" : "'Sora',sans-serif", fontSize:fs(row.t), letterSpacing: row.t==="hdr" ? 1.5 : 0, textTransform: row.t==="hdr" ? "uppercase" : "none", borderLeft: emph(row.t) ? `3px solid ${vc(row.t)}` : "3px solid transparent" }}>{row.l}</td>
                  <td style={{ padding: row.t==="hdr" ? "10px 12px 4px" : emph(row.t) ? "11px 12px" : "7px 12px", textAlign:"right", color:vc(row.t), fontWeight:fw(row.t), ...M, fontSize:fs(row.t), whiteSpace:"nowrap" }}>
                    {row.t==="hdr" ? "" : row.t==="epct"||row.t==="npct" ? row.v : typeof row.v==="number" ? (showDollars ? $k(row.v) : (annualRevNet > 0 ? pct(row.v / annualRevNet) : "—")) : ""}
                  </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
      {showDollars && showEdit && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
          {[
            { title:"Management Team", items:mgmt, labelKey:"role", valKey:"salary", step:5000, onEdit:onMgmt, total:mgmtTotal, totalLabel:"Total w/ 22% burden" },
            { title:"Operating Overhead", items:overhead, labelKey:"item",  valKey:"amount", step:1000, onEdit:onOvhd, total:overheadTotal, totalLabel:"Total Overhead" },
          ].map((sec,si)=>(
            <div key={si} style={{ padding:"14px 18px", borderRight:si===0?"1px solid #e8edf3":"none" }}>
              <SL>{sec.title}</SL>
              {sec.items.map(r=>(
                <div key={r.id} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}>
                  <span style={{ fontSize:10, color:"#5a4020", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r[sec.labelKey]}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:3, background:"#ebebeb", borderRadius:5, padding:"2px 7px", border:"1px solid #d0dae8" }}>
                    <span style={{ fontSize:9, color:"#9a8050" }}>$</span>
                    <input type="number" value={r[sec.valKey]} min={0} step={sec.step}
                      onChange={e=>sec.onEdit(r.id, Number(e.target.value))}
                      style={{ width:68, background:"none", border:"none", color:"#0A3D47", ...M, fontSize:11, fontWeight:700, outline:"none", textAlign:"right" }}/>
                  </div>
                </div>
              ))}
              <div style={{ paddingTop:7, borderTop:"1px solid #d0dae8", display:"flex", justifyContent:"space-between", fontSize:11 }}>
                <span style={{ color:"#5a4020" }}>{sec.totalLabel}</span>
                <span style={{ fontWeight:800, color:"#D4A520", ...M }}>{$k(sec.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB: COMPANY BUILDER
══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   INTRINSIC APPROVAL THRESHOLDS
   These define what Intrinsic considers an acceptable home
   configuration. Clients see the status, not the numbers.
══════════════════════════════════════════════════════════ */
const APPROVAL_THRESHOLDS = {
  approved:  0.45,   // gross margin ≥ 45% → Approved
  marginal:  0.30,   // gross margin 30–44% → Needs Review
                     // gross margin < 30%  → Not Viable
};

function getApprovalStatus(margin, total) {
  if (!total || total === 0) return { status:"incomplete", label:"Configure Home", color:"#64748b", bg:"#eef1f6", border:"#c8d8ec", icon:"○" };
  if (margin >= APPROVAL_THRESHOLDS.approved) return { status:"approved",  label:"Approved",     color:"#00e5aa", bg:"#00e5aa12", border:"#00e5aa35", icon:"✓" };
  if (margin >= APPROVAL_THRESHOLDS.marginal) return { status:"marginal",  label:"Needs Review", color:"#f59e0b", bg:"#f59e0b12", border:"#f59e0b35", icon:"⚠" };
  return                                             { status:"rejected",  label:"Not Viable",   color:"#f87171", bg:"#f8717112", border:"#f8717135", icon:"✗" };
}

// Labor Efficiency tab uses labor ratio thresholds (not gross margin).
// Intrinsic approved threshold: labor ratio < 47% of revenue.
const LABOR_APPROVAL_THRESHOLDS = { approved: 0.47, marginal: 0.58, concerning: 0.68 };

function getLaborApprovalStatus(laborRatio, total) {
  if (!total || total === 0)                             return { status:"incomplete",  label:"Configure Home", color:"#64748b", bg:"#eef1f6",   border:"#c8d8ec",   icon:"○" };
  if (laborRatio < LABOR_APPROVAL_THRESHOLDS.approved)  return { status:"approved",    label:"Approved",       color:"#00e5aa", bg:"#00e5aa12", border:"#00e5aa35", icon:"✓" };
  if (laborRatio < LABOR_APPROVAL_THRESHOLDS.marginal)  return { status:"needs_review", label:"Needs Review",  color:"#f59e0b", bg:"#f59e0b12", border:"#f59e0b35", icon:"⚠" };
  if (laborRatio < LABOR_APPROVAL_THRESHOLDS.concerning) return { status:"concerning", label:"Concerning",     color:"#fb923c", bg:"#fb923c12", border:"#fb923c35", icon:"⚠" };
  return                                                        { status:"rejected",   label:"Not Viable",     color:"#f87171", bg:"#f8717112", border:"#f8717135", icon:"✗" };
}

function CompanyTab({ co, mgmt, overhead, onMgmt, onOvhd, entityType, ownerRate, mgmtFeePct, billingFeePct, hourlyCount, tscCaseload, slBreakdown, userRole }) {
  const showDollars = canSeeCompanyDollars(userRole);
  const topChips = [
    { l:"24hr Clients",  v:co.totalClients, c:"#0E6B78", f:n=>n },
    ...(hourlyCount > 0  ? [{ l:"Hourly Clients", v:hourlyCount,  c:"#0A5260", f:n=>n }] : []),
    ...(tscCaseload > 0  ? [{ l:"TSC Caseload",   v:tscCaseload,  c:"#0A5260", f:n=>n }] : []),
    { l:"Homes",         v:co.totalHomes,   c:"#0A5260", f:n=>n },
    ...(showDollars ? [
      { l:"Net Revenue", v:co.annualRevNet, c:"#0A3D47", f:$k },
      { l:"EBITDA",      v:co.ebitda,       c:mc(Math.max(0,co.ebitdaMargin)), f:$k },
    ] : []),
    { l:"EBITDA Mgn",    v:co.ebitdaMargin, c:mc(Math.max(0,co.ebitdaMargin)), f:pct },
  ];
  const bottomChips = [
    ...(showDollars ? [{ l:entityType==="ccorp"?"Net Income":"Owner Net", v:co.netIncome, c:nmc(Math.max(0,co.netMargin)), f:$k, hi:true }] : []),
    { l:"Net Margin", v:co.netMargin, c:nmc(Math.max(0,co.netMargin)), f:pct, hi:true },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          {topChips.map((s,i)=><Chip key={i} label={s.l} value={s.f(s.v)} color={s.c} highlight={s.hi}/>)}
        </div>
        <div style={{ display:"flex", gap:7 }}>
          {bottomChips.map((s,i)=><Chip key={i} label={s.l} value={s.f(s.v)} color={s.c} highlight={s.hi}/>)}
        </div>
      </div>
      <CompanyPL co={co} mgmt={mgmt} overhead={overhead} onMgmt={onMgmt} onOvhd={onOvhd} entityType={entityType} ownerRate={ownerRate} mgmtFeePct={mgmtFeePct} billingFeePct={billingFeePct} slBreakdown={slBreakdown} userRole={userRole}/>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB: LABOR EFFICIENCY (client-facing home projector)
   — no gross/revenue dollar amounts
   — everything expressed as ratios, %, and hours
══════════════════════════════════════════════════════════ */
function LaborEfficiencyTab({ wage: globalWage, rates = RATES_DEF, graveyardWage, userRole }) {
  const [nHigh,            setNHigh]            = useState(2);
  const [nIntense,         setNIntense]         = useState(1);
  const [groupHrs,         setGroupHrs]         = useState(12);
  const [billing,          setBilling]          = useState("normal");
  const [useGlobal,        setUseGlobal]        = useState(true);
  const [custWage,         setCustWage]         = useState(globalWage);
  const [hhrsPerWeek,      setHhrsPerWeek]      = useState(0);
  const [graveyardSleepHrs,setGraveyardSleepHrs]= useState(0);
  const wage = useGlobal ? globalWage : custWage;

  const total    = nHigh + nIntense;
  const canGroup = nIntense > 0 && total >= 2;
  const allHigh  = nIntense === 0;

  const chH = v => { setNHigh(Math.max(0, Math.min(v, 3 - nIntense))); };
  const chI = v => { setNIntense(Math.max(0, Math.min(v, 3 - nHigh))); };

  const cfg = { nHigh, nIntense, groupHrs, billingType: billing, hhrsPerWeek, graveyardSleepHrs };
  const m   = calcHome(cfg, wage, rates, graveyardWage);

  // Key efficiency ratios
  const laborRatio  = m.rev > 0 ? m.labor / m.rev : 0;    // labor as % of revenue
  const efficiencyR = 1 - laborRatio;                       // remaining after labor
  const approval    = getLaborApprovalStatus(laborRatio, total);

  // Labor breakdown in hours only
  const nightHrs    = canGroup ? m.gHrs : 0;
  const dayHighHrs  = canGroup && nHigh > 0 ? Math.ceil(nHigh / 2) * m.dHrs : allHigh ? 24 : 0;
  const dayIntHrs   = canGroup ? nIntense * m.dHrs : !allHigh && total > 0 ? 24 : 0;

  // Unified sweep — covers labor ratio chart and 5-year projection data
  const sweep = Array.from({ length: 11 }, (_, i) => {
    const gh = i * 2;
    const sm = calcHome({ ...cfg, groupHrs: gh }, wage, rates, graveyardWage);
    const lr = sm.rev > 0 ? sm.labor / sm.rev : 0;
    return { gh, laborRatio: lr, ...sm };
  });
  const swMax = Math.max(...sweep.map(s => Math.abs(s.gross)));

  const GROWTH = [1, 1.05, 1.10, 1.16, 1.22];
  const yr = new Date().getFullYear();

  // Wage sensitivity — labor ratio at different wages, no dollars
  const wageSensitivity = [-4, -2, 0, 2, 4].map(delta => {
    const w  = Math.max(12, Math.min(32, wage + delta));
    const sm = calcHome(cfg, w, rates, graveyardWage);
    const lr = sm.rev > 0 ? sm.labor / sm.rev : 0;
    return { wage: w, laborRatio: lr, margin: sm.margin, isCurrent: delta === 0 };
  });

  // Color for labor ratio: < 47% = approved green, 47–70% = amber/orange, > 70% = red
  const lrc = r => r < 0.47 ? "#00e5aa" : r < 0.58 ? "#f59e0b" : r < 0.68 ? "#fb923c" : "#f87171";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header + approval badge row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 14, color: "#0E6B78", letterSpacing: 2, marginBottom: 3 }}>Home Labor Efficiency</div>
          <div style={{ fontSize: 10, color: "#64748b", ...M }}>Model a home's staffing ratios — all figures expressed as percentages of revenue</div>
        </div>
        {total > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, background: approval.bg, border: `1px solid ${approval.border}` }}>
            <span style={{ fontSize: 14, color: approval.color }}>{approval.icon}</span>
            <div>
              <div style={{ fontSize: 7, color: approval.color, textTransform: "uppercase", letterSpacing: 2, ...M, opacity: 0.7 }}>Intrinsic</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: approval.color, fontFamily: "'Cinzel',serif" }}>{approval.label}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 14, alignItems: "start" }}>

        {/* Config panel — identical controls to projector */}
        <div style={{ background: "#eef1f6", borderRadius: 13, border: "1px solid #d0dae8", padding: "18px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <SL>Client Mix — max 3 per home</SL>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10 }}>
              <Stepper label="High Support" value={nHigh}    max={3 - nIntense} onChange={chH} color="#C9921A"/>
              <Stepper label="Intense"      value={nIntense} max={3 - nHigh}    onChange={chI} color="#D4A520"/>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", ...M }}>Total</div>
                <div style={{ width: 50, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "#e6ebf3", borderRadius: 7, border: "1px solid #d0dae8" }}>
                  <span style={{ fontWeight: 800, color: total === 3 ? "#00e5aa" : total === 0 ? "#f87171" : "#0A3D47", ...M, fontSize: 15 }}>{total}/3</span>
                </div>
              </div>
            </div>
            <MixBadges nHigh={nHigh} nIntense={nIntense}/>
          </div>

          {canGroup && (
            <Slider label="Night Group Hours" value={groupHrs} min={0} max={20} step={1}
              onChange={setGroupHrs} color="#f59e0b" format={v => `${v}hr`}/>
          )}
          {allHigh && total > 0 && <div style={{ padding: "7px 12px", background: "#e6ebf3", borderRadius: 7, borderLeft: "2px solid #C9921A", fontSize: 10, color: "#7a5020" }}>All-high: 1 staff (1:{total}) → 24 labor hrs</div>}
          {!allHigh && total === 1 && <div style={{ padding: "7px 12px", background: "#e6ebf3", borderRadius: 7, borderLeft: "2px solid #f87171", fontSize: 10, color: "#b04040" }}>Single intense: 1:1 all 24 hrs — grouping not possible</div>}

          {nIntense > 0 && (
            <div>
              <SL>Intense Billing Method</SL>
              <Toggle value={billing} onChange={setBilling} options={[
                { value: "normal",  label: "Normal (Daily Rate)", color: "#0E6B78" },
                { value: "blended", label: "Blended (Unit Rates)", color: "#E8C44A" },
              ]} small/>
            </div>
          )}

          {nHigh > 0 && (
            <div style={{ background: "#f0f6ff", borderRadius: 9, border: "1px solid #c8d4e4", padding: "10px 12px" }}>
              <SL>High Support — 1:1 Hrs/Week</SL>
              <Slider label="1:1 hrs/week per client" value={hhrsPerWeek} min={0} max={40} step={1}
                onChange={setHhrsPerWeek} color="#0A5260" format={v => `${v} hrs/wk`}/>
              {hhrsPerWeek > 0 && (
                <div style={{ fontSize: 9, color: "#475569", marginTop: 4, ...M }}>
                  {(hhrsPerWeek/7*nHigh).toFixed(1)} staff hrs/day · billed U2 rate
                </div>
              )}
            </div>
          )}

          {total > 0 && (
            <div style={{ background: "#f4f6ff", borderRadius: 9, border: "1px solid #c8d4e4", padding: "10px 12px" }}>
              <SL>Graveyard — Sleeping Hrs</SL>
              <Slider label={canGroup ? `Sleeping hrs (of ${groupHrs}hr group)` : "Overnight sleeping hrs (of 24hr shift)"} value={Math.min(graveyardSleepHrs, canGroup ? groupHrs : 12)} min={0} max={canGroup ? groupHrs : 12} step={1}
                onChange={v => setGraveyardSleepHrs(v)} color="#7a94b0" format={v => `${v}hr`}/>
              {graveyardSleepHrs > 0 && (
                <div style={{ fontSize: 9, color: "#475569", marginTop: 4, ...M }}>
                  {Math.min(graveyardSleepHrs, canGroup ? groupHrs : 12)}hr at sleep wage · {canGroup ? groupHrs - Math.min(graveyardSleepHrs, groupHrs) : 24 - Math.min(graveyardSleepHrs, 12)}hr awake · sleep wage set in sidebar
                </div>
              )}
            </div>
          )}

          {wageDisplayMode(userRole) === 'dollars' && <div>
            <SL>Staff Wage</SL>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {["Use Global", "Custom"].map((l, i) => (
                <button key={l} onClick={() => setUseGlobal(i === 0)} style={{ flex: 1, padding: "5px", border: "none", borderRadius: 5, cursor: "pointer", background: (i === 0) === useGlobal ? "#dce8f4" : "#e6ebf3", color: (i === 0) === useGlobal ? "#0E6B78" : "#64748b", ...M, fontSize: 10, fontWeight: 700 }}>{l}</button>
              ))}
            </div>
            {useGlobal
              ? <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", ...M }}>${globalWage.toFixed(2)}/hr (from global)</div>
              : <Slider label="" value={custWage} min={12} max={32} step={0.25} onChange={setCustWage} color="#E8C44A" format={v => `$${v.toFixed(2)}/hr`}/>
            }
          </div>}
        </div>

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Dollar metric tiles — tier 1–3 only */}
          {total > 0 && canSeeCompanyDollars(userRole) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { l: "Daily Revenue",  v: $d(m.rev),              c: "#0A3D47", sz: 20 },
                { l: "Daily Gross",    v: $d(m.gross),            c: mc(m.margin), sz: 20 },
                { l: "Gross Margin",   v: pct(m.margin),          c: mc(m.margin), sz: 28 },
                wageDisplayMode(userRole) !== 'hidden' && { l: "$/Labor Hr", v: `$${m.plHr.toFixed(2)}`, c: "#f59e0b", sz: 20 },
                { l: "Annual Revenue", v: $k(m.annualRev),        c: "#6a4c10", sz: 16 },
                { l: "Annual Gross",   v: $k(m.annualGross),      c: "#1d7a35", sz: 16 },
                { l: "Annual Labor",   v: $k(m.annualLabor),      c: "#f87171", sz: 16 },
                { l: "Labor Hrs/Day",  v: m.laborHrs + "hrs",     c: "#5a4020", sz: 16 },
              ].filter(Boolean).map((s, i) => (
                <div key={i} style={{ background: "#FAF4E8", borderRadius: 10, padding: "13px 15px", border: "1px solid #d0dae8" }}>
                  <div style={{ fontSize: 9, color: "#5a4020", textTransform: "uppercase", letterSpacing: 1.5, ...M, marginBottom: 5 }}>{s.l}</div>
                  <div style={{ fontSize: s.sz, fontWeight: 800, color: s.c, ...M }}>{s.v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Main efficiency visual */}
          {total > 0 && (
            <div style={{ background: "#eef1f6", borderRadius: 13, border: `1px solid ${approval.border}`, padding: "18px 20px" }}>
              <SL>Labor vs Revenue Ratio</SL>

              {/* Stacked ratio bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", height: 36, borderRadius: 8, overflow: "hidden", gap: 2 }}>
                  <div style={{ flex: laborRatio, background: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#ebebeb", ...M }}>{(laborRatio * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ flex: efficiencyR, background: approval.color + "cc", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 30 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#ebebeb", ...M }}>{(efficiencyR * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: "#f87171" }}/>
                    <span style={{ fontSize: 9, color: "#f87171", ...M, textTransform: "uppercase", letterSpacing: 1 }}>Labor Cost</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: approval.color }}/>
                    <span style={{ fontSize: 9, color: approval.color, ...M, textTransform: "uppercase", letterSpacing: 1 }}>After Labor</span>
                  </div>
                </div>
              </div>

              {/* Key ratio chips — no dollars */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {[
                  { l: "Labor Ratio",     v: pct(laborRatio),          c: lrc(laborRatio),          desc: "of revenue goes to staffing" },
                  { l: "Labor Hrs / Day", v: m.laborHrs + "hrs",        c: "#6a4c10",                desc: "direct care hours required" },
                  wageDisplayMode(userRole) !== 'hidden' && { l: "Wage Rate", v: `$${wage.toFixed(2)}/hr`, c: "#5a7498", desc: "per direct care staff hour" },
                ].filter(Boolean).map((s, i) => (
                  <div key={i} style={{ background: "#e6ebf3", borderRadius: 9, padding: "10px 12px", border: "1px solid #d0dae8" }}>
                    <div style={{ fontSize: 8, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, ...M, marginBottom: 4 }}>{s.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.c, ...M, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: "#64748b", ...M, marginTop: 4 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staffing hours breakdown — hrs always shown; cost shown for tier 1–3 */}
          {total > 0 && (
            <div style={{ background: "#eef1f6", borderRadius: 12, border: "1px solid #d0dae8", padding: "14px 18px" }}>
              <SL>Staffing Hours Breakdown — per Day</SL>
              {allHigh ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#e6ebf3", borderRadius: 7 }}>
                    <span style={{ fontSize: 11, color: "#6a4818" }}>1 staff · {total} client{total > 1 ? "s" : ""} · all 24 hrs</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#6a4c10", ...M }}>{m.laborHrs}hrs{canSeeCompanyDollars(userRole) ? ` · ${$d(m.labor)}` : ""}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>All-high ratio: 1 staff per {total} client{total > 1 ? "s" : ""}</div>
                </div>
              ) : total === 1 ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#e6ebf3", borderRadius: 7 }}>
                  <span style={{ fontSize: 11, color: "#6a4818" }}>1:1 staffing · all 24 hrs</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#6a4c10", ...M }}>24hrs{canSeeCompanyDollars(userRole) ? ` · ${$d(m.labor)}` : ""}</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {[
                    { l: "🌙 Night group",           hrs: nightHrs,   cost: nightHrs * wage,              sub: `1 staff covers all ${total} clients` },
                    nHigh > 0 ? { l: "☀️ High Support staff", hrs: dayHighHrs, cost: dayHighHrs * wage, sub: `${Math.ceil(nHigh / 2)} staff · paired 1:2` } : null,
                    { l: "☀️ Intense 1:1 staff",    hrs: dayIntHrs,  cost: dayIntHrs * wage,             sub: `${nIntense} staff · individual 1:1` },
                    { l: "📊 Total",                  hrs: m.laborHrs, cost: m.labor, bold: true },
                  ].filter(Boolean).map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: r.bold ? "#ebebeb" : "transparent", borderRadius: r.bold ? 7 : 0, borderTop: r.bold ? "1px solid #d0dae8" : "none" }}>
                      <div>
                        <span style={{ fontSize: 11, color: r.bold ? "#6a4c10" : "#5a7498" }}>{r.l}</span>
                        {r.sub && <div style={{ fontSize: 9, color: "#64748b", ...M, marginTop: 1 }}>{r.sub}</div>}
                      </div>
                      <span style={{ fontSize: r.bold ? 15 : 12, fontWeight: r.bold ? 800 : 600, color: r.bold ? "#0A3D47" : "#6a4818", ...M }}>
                        {r.hrs}hrs{canSeeCompanyDollars(userRole) ? ` · ${$d(r.cost)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Group hours sweep — labor ratio at each setting */}
      {canGroup && (
        <div style={{ background: "#eef1f6", borderRadius: 12, border: "1px solid #d0dae8", padding: "16px 20px" }}>
          <SL>Labor Ratio by Group Hours — Click a Bar to Select</SL>
          <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 100, marginBottom: 8 }}>
            {sweep.map(s => {
              const ap  = getLaborApprovalStatus(s.laborRatio, total);
              const barH = Math.max(8, (1 - s.laborRatio) * 80);
              const sel = groupHrs === s.gh;
              return (
                <div key={s.gh} onClick={() => setGroupHrs(s.gh)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer" }}>
                  <div style={{ fontSize: 8, color: lrc(s.laborRatio), ...M, fontWeight: 700 }}>{(s.laborRatio * 100).toFixed(0)}%</div>
                  <div style={{ width: "100%", borderRadius: "3px 3px 0 0", height: `${barH}px`, transition: "height 0.3s", background: sel ? lrc(s.laborRatio) : lrc(s.laborRatio) + "55", border: sel ? `1px solid ${lrc(s.laborRatio)}` : "none" }}/>
                  <div style={{ fontSize: 8.5, color: ap.color }}>{ap.icon}</div>
                  <div style={{ fontSize: 8, color: sel ? "#0A3D47" : "#64748b", ...M }}>{s.gh}hr</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            {[
              { label: "Bar height = efficiency (taller = less labor)", color: "#475569" },
              { label: "% label = labor ratio at that setting", color: "#475569" },
            ].map((l, i) => <span key={i} style={{ fontSize: 9, color: l.color, ...M }}>· {l.label}</span>)}
          </div>
        </div>
      )}

      {/* 5-year projection — tier 1–3 only */}
      {canSeeCompanyDollars(userRole) && (
        <div style={{ background: "#FAF4E8", borderRadius: 12, border: "1px solid #d0dae8", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e0e8f0" }}>
            <SL>5-Year Projection — 5% Annual Growth</SL>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #d0dae8" }}>
                {["Year", "Annual Revenue", "Annual Labor", "Annual Gross", "Gross Margin"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, color: "#5a4020", textTransform: "uppercase", letterSpacing: 1, ...M }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROWTH.map((g, i) => {
                const r = { rev: m.annualRev * g, labor: m.annualLabor * g, gross: m.annualGross * g };
                const mp = r.rev > 0 ? r.gross / r.rev : 0;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #e8edf3", background: i === 0 ? "#ebebeb" : "transparent" }}>
                    <td style={{ padding: "9px 14px", fontWeight: 700, color: "#6a4c10", ...M }}>{yr + i}{i === 0 ? " (Yr 1)" : ""}</td>
                    <td style={{ padding: "9px 14px", color: "#0A3D47", ...M }}>{$k(r.rev)}</td>
                    <td style={{ padding: "9px 14px", color: "#f87171", ...M }}>{$k(r.labor)}</td>
                    <td style={{ padding: "9px 14px", fontWeight: 700, color: mc(mp), ...M }}>{$k(r.gross)}</td>
                    <td style={{ padding: "9px 14px", fontWeight: 700, color: mc(mp), ...M }}>{pct(mp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Wage sensitivity — labor ratio at different wages */}
      {wageDisplayMode(userRole) === 'dollars' && <div style={{ background: "#eef1f6", borderRadius: 12, border: "1px solid #d0dae8", overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #e8edf3" }}>
          <SL>Wage Sensitivity — Labor Ratio at Different Wage Rates</SL>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e8edf3" }}>
              {["Staff Wage", "Labor Ratio", "Efficiency Bar", "Intrinsic Status"].map(h => (
                <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 1, ...M }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wageSensitivity.map((row, i) => {
              const ap = getLaborApprovalStatus(row.laborRatio, total);
              return (
                <tr key={i} style={{ borderBottom: "1px solid #e8edf3", background: row.isCurrent ? "#edf2f8" : "transparent" }}>
                  <td style={{ padding: "9px 14px", ...M, fontSize: 12, fontWeight: row.isCurrent ? 800 : 400, color: row.isCurrent ? "#0E6B78" : "#5a7498" }}>
                    ${row.wage.toFixed(2)}/hr{row.isCurrent ? " ← current" : ""}
                  </td>
                  <td style={{ padding: "9px 14px", fontSize: 14, fontWeight: 800, color: lrc(row.laborRatio), ...M }}>
                    {pct(row.laborRatio)}
                  </td>
                  <td style={{ padding: "9px 14px", width: 160 }}>
                    <div style={{ height: 6, background: "#eef1f6", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${row.laborRatio * 100}%`, background: lrc(row.laborRatio), borderRadius: 3 }}/>
                    </div>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, ...M, textTransform: "uppercase", letterSpacing: 1, padding: "2px 8px", borderRadius: 4, background: ap.bg, color: ap.color, border: `1px solid ${ap.border}` }}>{ap.icon} {ap.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}

      {/* Guidance footer */}
      {total > 0 && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: approval.bg, border: `1px solid ${approval.border}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: approval.color, fontSize: 16, flexShrink: 0 }}>{approval.icon}</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: approval.color, marginBottom: 3 }}>
              {approval.label} — {pct(laborRatio)} labor ratio · {m.laborHrs}hrs staffing/day
            </div>
            <div style={{ fontSize: 10, color: approval.color, opacity: 0.85, lineHeight: 1.6 }}>
              {approval.status === "approved" && canGroup && `${groupHrs}-hour night group is effective. Labor is a sustainable portion of this home's authorized hours.`}
              {approval.status === "approved" && allHigh && `All-high configuration with ${total} clients is efficient. One staff covers all ${total} clients during all hours.`}
              {approval.status === "approved" && !canGroup && !allHigh && "Configuration meets Intrinsic's efficiency standards."}
              {approval.status === "needs_review" && nIntense > 0 && total < 2 && "A single intense client requires 1:1 staffing all 24 hours. Adding a second client and enabling group hours would reduce the labor ratio significantly."}
              {approval.status === "needs_review" && canGroup && groupHrs < 8 && "Increasing night group hours (try 10–14 hrs) would lower the labor ratio and likely reach Approved."}
              {approval.status === "needs_review" && allHigh && total < 3 && "Adding another high-support client would spread the fixed staffing hours across more clients, improving the ratio."}
              {approval.status === "needs_review" && canGroup && groupHrs >= 8 && "Configuration is close to threshold. Consider increasing group hours or adjusting client mix."}
              {approval.status === "concerning" && nIntense > 0 && "Intense clients drive a high labor ratio. Adding a second intense client with extended group hours may bring this below Concerning."}
              {approval.status === "concerning" && canGroup && groupHrs < 10 && "Labor ratio is elevated. Increasing group hours to 10–14 may move this home into Needs Review."}
              {approval.status === "concerning" && (!canGroup || groupHrs >= 10) && "This configuration's labor ratio is high. Review client mix and staffing hours before committing to this home."}
              {approval.status === "rejected" && total === 1 && nIntense > 0 && "One intense client requires full 24-hour 1:1 staffing. This ratio is not sustainable. A minimum of 2 clients is needed to enable grouping."}
              {approval.status === "rejected" && total > 1 && groupHrs === 0 && canGroup && "Group hours are set to 0. Enabling 10–14 hours of group staffing would substantially reduce the labor ratio."}
              {approval.status === "rejected" && total > 1 && groupHrs > 0 && "Even with grouping this configuration's labor ratio is too high. Consider increasing group hours or adding a client to improve the ratio."}
              {approval.status === "incomplete" && "Add clients above to evaluate this home's labor efficiency."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function HomeMixEditor({ homes, onUpdate, onAdd, onRemove, wage, setWage, rates = RATES_DEF, setRates, graveyardWage, setGraveyardWage, occupancy, setOccupancy, canEdit = true, userRole }) {
  const [selId, setSelId] = useState(homes[0]?.id);
  const [ratesOpen, setRatesOpen] = useState(false);
  const sel = homes.find(h=>h.id===selId) ?? homes[0];
  const m   = sel ? calcHome(sel, wage, rates, graveyardWage) : null;
  const canGroup = sel && sel.nIntense>0 && (sel.nHigh+sel.nIntense)>=2;
  const showDollars  = canSeeCompanyDollars(userRole);
  const showWageCost = wageDisplayMode(userRole) !== 'hidden';

  const chH = v => onUpdate(sel.id, "nHigh",    Math.max(0,Math.min(v, 3-sel.nIntense)));
  const chI = v => onUpdate(sel.id, "nIntense", Math.max(0,Math.min(v, 3-sel.nHigh)));

  const portfolioStats = useMemo(()=>{
    const ms = homes.map(h=>calcHome(h,wage,rates,graveyardWage));
    return {
      clients: homes.reduce((a,h)=>a+h.nHigh+h.nIntense,0),
      dailyRev: ms.reduce((a,m)=>a+m.rev,0),
      dailyGross: ms.reduce((a,m)=>a+m.gross,0),
      annualGross: ms.reduce((a,m)=>a+m.annualGross,0),
    };
  }, [homes, wage, rates]);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"210px 1fr", gap:14, alignItems:"start" }}>
      {/* Left: home list */}
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <SL>Homes ({homes.length})</SL>
          {canEdit && <button onClick={onAdd} style={{ fontSize:10, color:"#0E6B78", background:"#3a280022", border:"1px solid #d0dae8", borderRadius:5, padding:"3px 8px", cursor:"pointer", ...M }}>+ Add</button>}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          {homes.map(h=>{
            const hm = calcHome(h,wage,rates,graveyardWage);
            const s  = h.id===sel?.id;
            return (
              <div key={h.id} onClick={()=>setSelId(h.id)} style={{
                padding:"9px 12px", borderRadius:8, cursor:"pointer",
                background: s ? "#fff" : "#f4f1ea",
                border: s ? "1px solid #d0ccc4" : "1px solid #e0dbd4",
                borderLeft:s?`4px solid ${mc(hm.margin)}`:`2px solid ${mc(hm.margin)}50`,
                boxShadow: s ? "0 2px 8px rgba(13,26,42,0.08)" : "none",
                transition:"all 0.15s",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:11, fontWeight:700, color:s?"#0A3D47":"#7a6040" }}>{h.label}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:mc(hm.margin), ...M }}>{pct(hm.margin)}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
                  <MixBadges nHigh={h.nHigh} nIntense={h.nIntense} size={18}/>
                  <span style={{ fontSize:9, color:"#9a8050", ...M }}>{showDollars ? `${$d(hm.gross)}/day` : `${pct(hm.margin)} margin`}</span>
                </div>
              </div>
            );
          })}
        </div>
        {/* Reimbursement Rates */}
        {canSeeControl(userRole, 'resHabRates') && <div style={{ marginTop:10, padding:"10px 12px", background:"#FAF4E8", borderRadius:9, border:"1px solid #e0e8f0", pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}>
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
              {RATE_FIELDS.map(f => (
                <div key={f.key}>
                  <div style={{ fontSize:9, color:"#5a7498", marginBottom:3 }}>{f.label} <span style={{ color:"#64748b" }}>{f.unit}</span></div>
                  <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:3, flex:1 }}>
                      <span style={{ fontSize:10, color:"#64748b" }}>$</span>
                      <input type="number" step="0.01"
                        value={rates[f.key] ?? f.baseline}
                        onChange={e => setRates(r => ({ ...r, [f.key]: parseFloat(e.target.value)||0 }))}
                        style={{ width:60, fontSize:12, fontWeight:600, color:f.color,
                          background:"#f8f8f8", border:"1px solid #d0dae8", borderRadius:5,
                          padding:"3px 6px", textAlign:"right" }}/>
                    </div>
                    <div style={{ display:"flex", gap:3 }}>
                      {[2,4,6].map(p => (
                        <button key={p} onClick={() =>
                          setRates(r => ({ ...r, [f.key]: parseFloat((f.baseline*(1-p/100)).toFixed(4)) }))}
                          style={{ fontSize:9, padding:"2px 4px", borderRadius:4, border:"1px solid #d0dae8",
                            background:"#fff", color:"#64748b", cursor:"pointer" }}>
                          −{p}%
                        </button>
                      ))}
                      <button onClick={() => setRates(r => ({ ...r, [f.key]: f.baseline }))}
                        style={{ fontSize:9, padding:"2px 4px", borderRadius:4, border:"1px solid #d0dae8",
                          background:"#fff", color:"#64748b", cursor:"pointer" }}>
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>}

        {/* Portfolio stats */}
        <div style={{ marginTop:10, padding:"12px 14px", background:"#FAF4E8", borderRadius:9, border:"1px solid #e0dbd4" }}>
          <SL>Portfolio</SL>
          {[
            ["Homes",       homes.length],
            ["Clients",     portfolioStats.clients],
            showDollars && ["Daily Rev",   $d(portfolioStats.dailyRev)],
            showDollars && ["Daily Gross", $d(portfolioStats.dailyGross)],
            showDollars && ["Annual Gross",$k(portfolioStats.annualGross)],
          ].filter(Boolean).map(([l,v])=>(
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0" }}>
              <span style={{ fontSize:10, color:"#5a4020", ...M }}>{l}</span>
              <span style={{ fontSize:10, fontWeight:700, color:"#0A3D47", ...M }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: editor */}
      {sel && m && (
        <div style={{ background:"#FAF4E8", borderRadius:13, border:`1px solid ${mc(m.margin)}22`, borderLeft:`3px solid ${mc(m.margin)}`, overflow:"hidden" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"1px solid #e0e8f0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <MarginRing p={m.margin} size={48}/>
              <div>
                <input value={sel.label} onChange={canEdit ? e=>onUpdate(sel.id,"label",e.target.value) : undefined}
                  readOnly={!canEdit}
                  style={{ background:"none", border:"none", color:"#0A3D47", fontWeight:800, fontSize:15, fontFamily:"'Sora',sans-serif", padding:0, width:200, outline:"none", cursor: canEdit ? undefined : "default" }}/>
                <div style={{ fontSize:10, color:"#9a8050", ...M, marginTop:2 }}>
                  {m.laborHrs}hr labor{showDollars ? ` · ${$d(m.rev)} rev` : ""}{showDollars ? ` · ${$d(m.labor)} labor cost/day` : ""}
                </div>
              </div>
            </div>
            {canEdit && homes.length>1 && (
              <button onClick={()=>{const nxt=homes.find(h=>h.id!==sel.id)?.id; onRemove(sel.id); if(nxt)setSelId(nxt);}}
                style={{ background:"#f0eef8", border:"1px solid #f0c8d4", color:"#f87171", cursor:"pointer", borderRadius:6, padding:"5px 12px", fontSize:11, ...M }}>
                Remove
              </button>
            )}
          </div>

          <div style={{ padding:"18px 20px", display:"flex", flexDirection:"column", gap:16 }}>
            {/* Mix */}
            <div>
              <SL>Client Mix — max 3 per home</SL>
              <div style={{ display:"flex", gap:18, alignItems:"center", flexWrap:"wrap", pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}>
                <Stepper label="High Support" value={sel.nHigh}    max={3-sel.nIntense} onChange={chH} color="#C9921A"/>
                <Stepper label="Intense"      value={sel.nIntense} max={3-sel.nHigh}    onChange={chI} color="#D4A520"/>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                    <MixBadges nHigh={sel.nHigh} nIntense={sel.nIntense}/>
                    <span style={{ fontSize:11, color:"#5a4020" }}>{sel.nHigh+sel.nIntense}/3 occupied</span>
                  </div>
                  <div style={{ fontSize:10, color:"#7a5020", lineHeight:1.6, maxWidth:260 }}>
                    {sel.nIntense===0 && `All-high: 1 staff (1:${sel.nHigh||"—"}) all 24 hrs = 24 labor hrs`}
                    {sel.nIntense>0 && (sel.nHigh+sel.nIntense)<2 && "Single intense: 1:1 all 24 hrs, no group possible"}
                    {canGroup && `Mixed: ${sel.groupHrs}hr group night (1 staff) + ${24-sel.groupHrs}hr day (${sel.nHigh>0?Math.ceil(sel.nHigh/2)+" high staff + ":""}${sel.nIntense} intense 1:1)`}
                  </div>
                </div>
              </div>
            </div>

            {/* Group hours with quick-pick */}
            {canGroup && (
              <div>
                <SL>Night Group Hours</SL>
                <div style={{ pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}>
                <Slider label="" value={sel.groupHrs} min={0} max={20} step={1}
                  onChange={v=>onUpdate(sel.id,"groupHrs",v)} color="#f59e0b" format={v=>`${v}hr`}/>
                <div style={{ marginTop:10, display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6 }}>
                  {[0,6,8,10,12,14].map(gh=>{
                    const tm=calcHome({...sel,groupHrs:gh},wage,rates,graveyardWage);
                    return (
                      <div key={gh} onClick={canEdit ? ()=>onUpdate(sel.id,"groupHrs",gh) : undefined}
                        style={{ padding:"7px 0", background:sel.groupHrs===gh?"#e8f1fb":"#f4f1ea", borderRadius:7, border:sel.groupHrs===gh?"1px solid #0E6B7840":"1px solid #e0e8f0", cursor: canEdit ? "pointer" : "default", textAlign:"center" }}>
                        <div style={{ fontSize:9, color:"#5a4020", ...M }}>{gh}hr</div>
                        <div style={{ fontSize:11, fontWeight:700, color:mc(tm.margin), ...M }}>{pct(tm.margin)}</div>
                        {showDollars && <div style={{ fontSize:9, color:"#7a5020", ...M }}>{$d(tm.gross)}</div>}
                      </div>
                    );
                  })}
                </div>
                </div>{/* end canEdit wrapper for group hours */}
              </div>
            )}

            {/* ── Home Settings ── */}
            <div style={{ background:"#f5f3ee", borderRadius:10, border:"1px solid #ddd8ce", padding:"14px 16px", pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}>
              <div style={{ fontSize:9, color:"#9a8050", letterSpacing:2, textTransform:"uppercase", fontWeight:700, marginBottom:12 }}>Home Settings</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px 24px" }}>
                {wageDisplayMode(userRole) === 'dollars' && (
                  <Slider label="Staff Wage" value={wage} min={12} max={32} step={0.25}
                    onChange={setWage} color="#f87171" format={v=>`$${v.toFixed(2)}/hr`}/>
                )}
                {wageDisplayMode(userRole) === 'dollars' && (
                  <Slider label="Graveyard / Sleeping Wage" value={graveyardWage} min={8} max={32} step={0.25}
                    onChange={setGraveyardWage} color="#5a7498" format={v=>`$${v.toFixed(2)}/hr`}/>
                )}
                {canSeeControl(userRole, 'occupancy') && (
                  <Slider label="Occupancy Rate" value={occupancy} min={60} max={100} step={1}
                    onChange={setOccupancy} color="#0E6B78" format={v=>`${v}%`}/>
                )}
              </div>
            </div>

            {/* Billing */}
            {sel.nIntense>0 && (
              <div style={{ pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}>
                <SL>Intense Billing</SL>
                <Toggle value={sel.billingType} onChange={v=>onUpdate(sel.id,"billingType",v)} options={[
                  { value:"normal",  label:showDollars ? `Normal (Daily $${rates.intenseDaily.toFixed(2)})` : "Normal (Daily Rate)", color:"#0E6B78" },
                  { value:"blended", label:"Blended (Unit Billing)",  color:"#E8C44A" },
                ]}/>
              </div>
            )}

            {sel.nHigh > 0 && (
              <div style={{ background:"#f0f6ff", borderRadius:9, border:"1px solid #c8d4e4", padding:"10px 14px", pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}>
                <SL>High Support — 1:1 Individual Hours</SL>
                <Slider label="1:1 hrs/week per High Support client" value={sel.hhrsPerWeek||0} min={0} max={40} step={1}
                  onChange={v=>onUpdate(sel.id,"hhrsPerWeek",v)} color="#0A5260" format={v=>`${v} hrs/wk`}/>
                {(sel.hhrsPerWeek||0) > 0 && (
                  <div style={{ fontSize:9, color:"#475569", marginTop:5, ...M }}>
                    {((sel.hhrsPerWeek||0)/7*sel.nHigh).toFixed(1)} staff hrs/day · billed U2 individual rate
                  </div>
                )}
              </div>
            )}

            {(sel.nHigh + sel.nIntense) > 0 && (
              <div style={{ background:"#f4f6ff", borderRadius:9, border:"1px solid #c8d4e4", padding:"10px 14px", pointerEvents: canEdit ? "auto" : "none", opacity: canEdit ? 1 : 0.65 }}>
                <SL>Graveyard — Sleeping Staff Hours</SL>
                <Slider label={canGroup ? `Sleeping hrs within ${sel.groupHrs}hr night group` : "Overnight sleeping hrs (of 24hr shift)"} value={Math.min(sel.graveyardSleepHrs||0, canGroup ? sel.groupHrs : 12)} min={0} max={canGroup ? sel.groupHrs : 12} step={1}
                  onChange={v=>onUpdate(sel.id,"graveyardSleepHrs",v)} color="#7a94b0" format={v=>`${v}hr sleeping`}/>
                {(sel.graveyardSleepHrs||0) > 0 && (
                  <div style={{ fontSize:9, color:"#475569", marginTop:5, ...M }}>
                    {Math.min(sel.graveyardSleepHrs||0, canGroup ? sel.groupHrs : 12)}hr at sleep wage · {canGroup ? sel.groupHrs - Math.min(sel.graveyardSleepHrs||0, sel.groupHrs) : 24 - Math.min(sel.graveyardSleepHrs||0, 12)}hr at regular wage · sleep wage set in sidebar
                  </div>
                )}
              </div>
            )}

            {/* Metric grid */}
            <div style={{ background:"#ebebeb", borderRadius:10, overflow:"hidden", border:"1px solid #e0e8f0" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)" }}>
                {[
                  showDollars    && { l:"Daily Revenue",  v:$d(m.rev),               c:"#0A3D47" },
                  showWageCost   && { l:"Daily Labor",    v:$d(m.labor),             c:"#f87171" },
                  showDollars    && { l:"Daily Gross",    v:$d(m.gross),             c:mc(m.margin) },
                                    { l:"Margin",         v:pct(m.margin),           c:mc(m.margin) },
                                    { l:"Labor Hrs/Day",  v:m.laborHrs+"hrs",        c:"#5a4020" },
                  showWageCost   && { l:"$/Labor Hr",     v:`$${m.plHr.toFixed(2)}`, c:"#f59e0b" },
                  showDollars    && { l:"Annual Revenue", v:$k(m.annualRev),         c:"#6a4c10" },
                  showDollars    && { l:"Annual Gross",   v:$k(m.annualGross),       c:"#1d7a35" },
                ].filter(Boolean).map((s,i)=>(
                  <div key={i} style={{ padding:"10px 14px", borderRight:i%4<3?"1px solid #e8edf3":"none", borderTop:i>=4?"1px solid #e8edf3":"none" }}>
                    <div style={{ fontSize:8, color:"#9a8050", textTransform:"uppercase", letterSpacing:0.8, ...M, marginBottom:3 }}>{s.l}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:s.c, ...M }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Labor breakdown */}
            {canGroup && showWageCost && (
              <div style={{ background:"#f4f2ec", borderRadius:10, border:"1px solid #e0e8f0", padding:"14px 16px" }}>
                <SL>Labor Breakdown</SL>
                {[
                  { l:"🌙 Night group (1 staff)",  hrs:m.gHrs,                       cost:m.gHrs*wage },
                  { l:"☀️ Day — High pair staff",   hrs:sel.nHigh>0?Math.ceil(sel.nHigh/2)*m.dHrs:0, cost:sel.nHigh>0?Math.ceil(sel.nHigh/2)*m.dHrs*wage:0, dim:sel.nHigh===0 },
                  { l:"☀️ Day — Intense 1:1 staff", hrs:sel.nIntense*m.dHrs,          cost:sel.nIntense*m.dHrs*wage },
                  { l:"📊 Total",                  hrs:m.laborHrs,                   cost:m.labor, bold:true },
                ].filter(r=>r.hrs>0||r.bold).map((r,i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 8px", background:r.bold?"#ebebeb":"transparent", borderRadius:r.bold?6:0, borderTop:r.bold?"1px solid #d0dae8":"none" }}>
                    <span style={{ fontSize:11, color:r.bold?"#6a4c10":"#5a4020" }}>{r.l}</span>
                    <span style={{ fontSize:11, fontWeight:r.bold?800:600, color:r.bold?"#0A3D47":"#6a4818", ...M }}>{r.hrs}hr · {$d(r.cost)}</span>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════════ */

// Rate field definitions — shared between Sidebar and the Home Mix Editor settings panel.
const RATE_FIELDS = [
  { key:"intenseDaily", label:"Intense Support (Daily)",      unit:"/day",   color:"#D4A520", baseline:678.77 },
  { key:"highDaily",    label:"High Support (Daily)",         unit:"/day",   color:"#C9921A", baseline:368.67 },
  { key:"iuUnit",       label:"Intense Individual U2",        unit:"/15-min",color:"#00e5aa", baseline:7.07   },
  { key:"igUnit",       label:"Intense Group U3",             unit:"/15-min",color:"#f59e0b", baseline:3.61   },
];

function Sidebar({ entityType, setEntityType, ownerRate, setOwnerRate, mgmtFeePct, setMgmtFeePct, billingFeePct, setBillingFeePct, userRole }) {
  const [feesOpen, setFeesOpen] = useState(true);
  const [taxOpen,  setTaxOpen]  = useState(true);

  const showFees      = canSeeControl(userRole, 'mgmtFee');
  const showTaxStruct = canSeeControl(userRole, 'entityType');

  return (
    <div style={{ borderRight:"1px solid #d0dae8", padding:"16px 14px", display:"flex", flexDirection:"column", gap:18, background:"#f4f2ec", overflowY:"auto" }}>
      {showFees && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: feesOpen ? 12 : 0 }}>
            <SL>Variable Fees</SL>
            <button onClick={()=>setFeesOpen(!feesOpen)} style={{ fontSize:9, color:"#0E6B78", background:"none", border:"1px solid #d0dae8", borderRadius:4, padding:"2px 7px", cursor:"pointer", ...M }}>
              {feesOpen?"▲":"▼"}
            </button>
          </div>
          {feesOpen && (
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              <div>
                <Slider label="Management Fee" value={mgmtFeePct} min={1} max={12} step={0.5} onChange={setMgmtFeePct} color="#E8C44A" format={v=>`${v}%`}/>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
                  <span style={{ fontSize:9, color:"#7a5020", ...M }}>Standard 5%</span>
                  <span style={{ fontSize:9, color: mgmtFeePct===5?"#7a5020":"#E8C44A", fontWeight:700, ...M }}>{mgmtFeePct !== 5 ? `${mgmtFeePct > 5 ? "+" : ""}${(mgmtFeePct - 5).toFixed(1)}pp vs. standard` : "at standard"}</span>
                </div>
              </div>
              <div>
                <Slider label="Billing Fee" value={billingFeePct} min={1} max={5} step={0.25} onChange={setBillingFeePct} color="#0A5260" format={v=>`${v}%`}/>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
                  <span style={{ fontSize:9, color:"#7a5020", ...M }}>Standard 1%</span>
                  <span style={{ fontSize:9, color: billingFeePct===1?"#7a5020":"#C9921A", fontWeight:700, ...M }}>{billingFeePct !== 1 ? `+${(billingFeePct - 1).toFixed(2)}pp vs. standard` : "at standard"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showTaxStruct && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: taxOpen ? 10 : 0 }}>
            <SL>Tax Structure</SL>
            <button onClick={()=>setTaxOpen(!taxOpen)} style={{ fontSize:9, color:"#0E6B78", background:"none", border:"1px solid #d0dae8", borderRadius:4, padding:"2px 7px", cursor:"pointer", ...M }}>
              {taxOpen?"▲":"▼"}
            </button>
          </div>
          {taxOpen && (
            <>
              <Toggle value={entityType} onChange={setEntityType} options={[
                { value:"ccorp",       label:"C-Corp",      color:"#0E6B78" },
                { value:"passthrough", label:"Pass-Through", color:"#E8C44A" },
              ]} small/>
              {entityType==="ccorp" ? (
                <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4 }}>
                  {[["Idaho State","5.8%","#f59e0b"],["Federal Corp","21.0%","#fb923c"],["Effective","~25.6%","#f87171"]].map(([l,r,c])=>(
                    <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 8px", background:"#f0f4f8", borderRadius:6, border:"1px solid #e8edf5" }}>
                      <span style={{ fontSize:10, color:"#5a4020", ...M }}>{l}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:c, ...M }}>{r}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop:8 }}>
                  <Slider label="Owner Blended Rate" value={ownerRate} min={15} max={50} step={1} onChange={setOwnerRate} color="#E8C44A" format={v=>`${v}%`}/>
                  <div style={{ marginTop:6, fontSize:9, color:"#9a8050", lineHeight:1.6 }}>Idaho 5.8% + federal personal. Adjust to your bracket.</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div>
        <SL>Margin Guide</SL>
        {[["Excellent >62%","#00e5aa"],["Strong 52–62%","#22c55e"],["Good 42–52%","#f59e0b"],["Tight 30–42%","#fb923c"],["At Risk <30%","#f87171"]].map(([l,c])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <div style={{ width:9, height:9, borderRadius:3, background:c, flexShrink:0, boxShadow:`0 0 6px ${c}50` }}/>
            <span style={{ fontSize:10, color:"#5a4020", fontFamily:"'DM Mono',monospace" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB: HOURLY SERVICES
══════════════════════════════════════════════════════════ */
function HourlyTab({ participants, onUpdate, onAdd, onRemove, wage, rates, setRates, userRole }) {
  const [selId, setSelId] = useState(participants[0]?.id);
  const [ratesOpen, setRatesOpen] = useState(true);
  const sel = participants.find(p=>p.id===selId) ?? participants[0];

  // Hourly bills the same Intense Individual (U2) / Group (U3) 15-min codes that
  // Res Hab Daily uses for hourly add-ons; they live in company-wide shared.rates.
  // Surface just those two fields here so rates are adjustable in-module.
  const hourlyRateFields = RATE_FIELDS.filter(f => f.key === 'iuUnit' || f.key === 'igUnit');
  // Same gate as the Home Mix Editor (these are the same company-wide shared.rates).
  const canEditRates = canEditServiceLines(userRole);
  // Light-theme P&L colors (match CompanyPL) — readable on the light cards below.
  const POS = "#0f7a4f", NEG = "#c0453a";

  const metrics = useMemo(()=>
    participants.map(p=>({ ...p, m: calcHourlyParticipant(p, rates, wage) })),
    [participants, rates, wage]
  );
  const selM = sel ? calcHourlyParticipant(sel, rates, wage) : null;

  const totals = useMemo(()=>({
    annualRev:   metrics.reduce((a,p)=>a+p.m.annualRev,0),
    annualLabor: metrics.reduce((a,p)=>a+p.m.annualLabor,0),
    annualGross: metrics.reduce((a,p)=>a+p.m.gross,0),
    avgMargin:   metrics.length > 0
      ? metrics.reduce((a,p)=>a+p.m.margin,0) / metrics.length : 0,
  }), [metrics]);

  const IU_HR = rates.iuUnit * 4;
  const IG_HR = rates.igUnit * 4;
  const showDollars  = canSeeCompanyDollars(userRole);
  const showWageCost = wageDisplayMode(userRole) !== 'hidden';

  const kpiItems = [
    { l:"Hourly Participants", v:participants.length,           c:"#0E6B78", f:n=>n },
    showDollars && { l:"Annual Revenue",     v:totals.annualRev,              c:"#0A3D47", f:$k  },
    showDollars && { l:"Annual Gross",       v:totals.annualGross,            c:totals.annualGross>=0?POS:NEG, f:$k },
    { l:"Avg Gross Margin",   v:totals.avgMargin,              c:totals.avgMargin>=0?POS:NEG, f:pct },
  ].filter(Boolean);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* KPI strip */}
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${kpiItems.length},1fr)`, gap:10 }}>
        {kpiItems.map((s,i)=>(
          <div key={i} style={{ background:"#fff", borderRadius:10, padding:"14px 16px", border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(13,26,42,0.05)" }}>
            <div style={{ fontSize:9, color:"#5a7498", textTransform:"uppercase", letterSpacing:1.5, ...M, marginBottom:6 }}>{s.l}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.c, ...M }}>{s.f(s.v)}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:14, alignItems:"start" }}>
        {/* Participant list */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <SL>Participants ({participants.length})</SL>
            <button onClick={onAdd} style={{ fontSize:10, color:"#0E6B78", background:"#0E6B7815", border:"1px solid #0E6B7830", borderRadius:5, padding:"3px 10px", cursor:"pointer", ...M }}>+ Add</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {metrics.map(p=>{
              const s = p.id === sel?.id;
              return (
                <div key={p.id} onClick={()=>setSelId(p.id)} style={{
                  padding:"10px 12px", borderRadius:8, cursor:"pointer",
                  background:s?"#eef4fb":"#fff",
                  border:s?`1px solid ${mc(p.m.margin)}50`:"1px solid #e2e8f0",
                  borderLeft:`3px solid ${mc(p.m.margin)}`,
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:s?"#0A3D47":"#5a7498" }}>{p.name}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:p.m.margin>=0?POS:NEG, ...M }}>{pct(p.m.margin)}</span>
                  </div>
                  <div style={{ fontSize:10, color:"#64748b", marginTop:3, ...M }}>
                    {p.m.totalWeeklyHrs}hr/wk{showDollars ? ` · ${$k(p.m.annualRev)}/yr` : ""}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Portfolio totals */}
          <div style={{ marginTop:10, padding:"12px", background:"#fff", borderRadius:9, border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(13,26,42,0.05)" }}>
            <SL>Portfolio Totals</SL>
            {[
              showDollars && ["Annual Revenue",  $k(totals.annualRev)],
              showDollars && ["Annual Labor",    $k(totals.annualLabor)],
              showDollars && ["Annual Gross",    $k(totals.annualGross)],
              ["Avg Margin",      pct(totals.avgMargin)],
            ].filter(Boolean).map(([l,v])=>(
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid #eef1f6" }}>
                <span style={{ fontSize:10, color:"#5a7498", ...M }}>{l}</span>
                <span style={{ fontSize:10, fontWeight:700, color:"#0A3D47", ...M }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Reimbursement rates — edits the shared U2/U3 15-min rates (company-wide, shared with Res Hab Daily) */}
          {canSeeControl(userRole, 'resHabRates') && <div style={{ marginTop:10, padding:"10px 12px", background:"#FAF4E8", borderRadius:9, border:"1px solid #e0e8f0", pointerEvents: canEditRates ? "auto" : "none", opacity: canEditRates ? 1 : 0.65 }}>
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
                {hourlyRateFields.map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize:9, color:"#5a7498", marginBottom:3 }}>{f.label} <span style={{ color:"#64748b" }}>{f.unit}</span></div>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:3, flex:1 }}>
                        <span style={{ fontSize:10, color:"#64748b" }}>$</span>
                        <input type="number" step="0.01"
                          value={rates[f.key] ?? f.baseline}
                          onChange={e => setRates(r => ({ ...r, [f.key]: parseFloat(e.target.value)||0 }))}
                          style={{ width:60, fontSize:12, fontWeight:600, color:f.color,
                            background:"#f8f8f8", border:"1px solid #d0dae8", borderRadius:5,
                            padding:"3px 6px", textAlign:"right" }}/>
                      </div>
                      <div style={{ display:"flex", gap:3 }}>
                        {[2,4,6].map(p => (
                          <button key={p} onClick={() =>
                            setRates(r => ({ ...r, [f.key]: parseFloat((f.baseline*(1-p/100)).toFixed(4)) }))}
                            style={{ fontSize:9, padding:"2px 4px", borderRadius:4, border:"1px solid #d0dae8",
                              background:"#fff", color:"#64748b", cursor:"pointer" }}>
                            −{p}%
                          </button>
                        ))}
                        <button onClick={() => setRates(r => ({ ...r, [f.key]: f.baseline }))}
                          style={{ fontSize:9, padding:"2px 4px", borderRadius:4, border:"1px solid #d0dae8",
                            background:"#fff", color:"#64748b", cursor:"pointer" }}>
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize:8.5, color:"#9a8050", ...M, lineHeight:1.5 }}>
                  Shared with Res Hab Daily (intense individual/group add-ons).
                </div>
              </div>
            )}
          </div>}
        </div>

        {/* Editor */}
        {sel && selM && (
          <div style={{ background:"#FAF4E8", borderRadius:13, border:`1px solid ${mc(selM.margin)}30`, borderLeft:`3px solid ${mc(selM.margin)}`, overflow:"hidden" }}>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", borderBottom:"1px solid #d0dae8" }}>
              <div>
                <input value={sel.name} onChange={e=>onUpdate(sel.id,"name",e.target.value)}
                  style={{ background:"none", border:"none", color:"#0A3D47", fontWeight:800, fontSize:16, fontFamily:"'Sora',sans-serif", padding:0, outline:"none", width:220 }}/>
                <div style={{ fontSize:10, color:"#64748b", ...M, marginTop:3 }}>
                  {selM.totalWeeklyHrs}hr/wk authorized{showDollars ? ` · ${$k(selM.weeklyRev)}/wk revenue est.` : ""}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:9, color:"#64748b", ...M }}>{showDollars ? "annual gross" : "gross margin"}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:selM.margin>=0?POS:NEG, ...M }}>{showDollars ? $k(selM.gross) : pct(selM.margin)}</div>
                </div>
                {participants.length > 1 && (
                  <button onClick={()=>{ const nxt=participants.find(p=>p.id!==sel.id)?.id; onRemove(sel.id); if(nxt)setSelId(nxt); }}
                    style={{ background:"#fcecea", border:"1px solid #e6b4ad", color:"#c0453a", cursor:"pointer", borderRadius:6, padding:"5px 10px", fontSize:10, ...M }}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div style={{ padding:"18px 20px", display:"flex", flexDirection:"column", gap:18 }}>
              {/* Authorization sliders */}
              <div>
                <SL>Weekly Authorization</SL>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:14 }}>
                  <Slider label="Individual Hrs / Week" value={sel.indHrsPerWeek} min={0} max={40} step={0.5}
                    onChange={v=>onUpdate(sel.id,"indHrsPerWeek",v)} color="#0E6B78"
                    format={v=>`${v}hr`}/>
                  <Slider label="Group Hrs / Week" value={sel.groupHrsPerWeek} min={0} max={40} step={0.5}
                    onChange={v=>onUpdate(sel.id,"groupHrsPerWeek",v)} color="#0A5260"
                    format={v=>`${v}hr`}/>
                </div>
                {/* Weekly cap display */}
                <div style={{ padding:"10px 14px", background:"#eef1f6", borderRadius:8, border:"1px solid #d0dae8" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:9, color:"#5a7498", textTransform:"uppercase", letterSpacing:1, ...M }}>Total Weekly Cap</div>
                      <Slider label="" value={sel.weeklyCapHrs} min={1} max={60} step={0.5}
                        onChange={v=>onUpdate(sel.id,"weeklyCapHrs",v)} color="#C9921A"
                        format={v=>`${v}hr`}/>
                    </div>
                    <div style={{ textAlign:"right", minWidth:100 }}>
                      <div style={{ fontSize:9, color:"#64748b", ...M }}>Utilized</div>
                      <div style={{ fontSize:18, fontWeight:800, ...M,
                        color: selM.totalWeeklyHrs >= sel.weeklyCapHrs ? "#c0453a" : "#0f7a4f" }}>
                        {selM.totalWeeklyHrs}/{sel.weeklyCapHrs}hr
                      </div>
                      {selM.totalWeeklyHrs > sel.weeklyCapHrs && (
                        <div style={{ fontSize:9, color:"#c0453a", ...M }}>⚠ Over cap</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Annual settings */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <Slider label="Weeks Per Year (Authorization)" value={sel.weeksPerYear} min={1} max={52} step={1}
                  onChange={v=>onUpdate(sel.id,"weeksPerYear",v)} color="#5a7498"
                  format={v=>`${v} wks`}/>
                <Slider label="Group Size (for labor split)" value={sel.groupSize} min={1} max={4} step={1}
                  onChange={v=>onUpdate(sel.id,"groupSize",v)} color="#0A5260"
                  format={v=>v===1?"1:1 only":`${v} participants`}/>
              </div>

              {/* Rate reference */}
              {showDollars && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { l:"Hourly Individual Rate", v:`$${IU_HR.toFixed(2)}/hr (U2)`, c:"#D4A520" },
                  { l:"Hourly Group Rate",       v:`$${IG_HR.toFixed(2)}/hr (U3)`, c:"#C9921A" },
                ].map((r,i)=>(
                  <div key={i} style={{ padding:"8px 12px", background:"#FAF4E8", borderRadius:7, border:"1px solid #e6ddca", borderLeft:`2px solid ${r.c}` }}>
                    <div style={{ fontSize:9, color:"#5a4838", ...M, marginBottom:2 }}>{r.l}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:"#33291a", ...M }}>{r.v}</div>
                  </div>
                ))}
              </div>}

              {/* Revenue/labor breakdown */}
              {showDollars && <div style={{ background:"#FAF4E8", borderRadius:10, border:"1px solid #d0dae8", overflow:"hidden" }}>
                <div style={{ padding:"10px 14px", borderBottom:"1px solid #d0dae8" }}>
                  <SL>Annual Revenue & Labor Breakdown</SL>
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <tbody>
                    {[
                      { l:"Individual Hours Revenue", v:$k(selM.annualIndRev),   sub:`${selM.annualIndHrs} hrs × $${IU_HR.toFixed(2)}`, c:"#5a4838" },
                      { l:"Group Hours Revenue",      v:$k(selM.annualGroupRev), sub:`${selM.annualGroupHrs} hrs × $${IG_HR.toFixed(2)}`, c:"#5a4838" },
                      { l:"Total Revenue",            v:$k(selM.annualRev),      sub:null, c:"#33291a", bold:true },
                      { l:"Individual Labor Cost",    v:`(${$k(selM.annualIndLabor)})`,   sub:`1:1 staffing`, c:"#c0453a" },
                      { l:"Group Labor Cost",         v:`(${$k(selM.annualGroupLabor)})`, sub:`÷ ${sel.groupSize} participants`, c:"#c0453a" },
                      { l:"Total Labor",              v:`(${$k(selM.annualLabor)})`,      sub:null, c:"#c0453a", bold:true },
                      { l:"Gross Profit",             v:$k(selM.gross),          sub:null, c:(selM.margin>=0?"#0f7a4f":"#c0453a"), bold:true, bg:true },
                      { l:"Gross Margin",             v:pct(selM.margin),        sub:null, c:(selM.margin>=0?"#0f7a4f":"#c0453a"), bold:true, bg:true },
                    ].map((row,i)=>(
                      <tr key={i} style={{ borderBottom:"1px solid #e6ddca", background:row.bg?(selM.gross>=0?"#e7f4ec":"#fcece9"):"transparent" }}>
                        <td style={{ padding:"7px 14px", color:row.c, fontWeight:row.bold?700:400, ...M, fontSize:12 }}>
                          {row.l}
                          {row.sub && <div style={{ fontSize:9, color:"#64748b", marginTop:2 }}>{row.sub}</div>}
                        </td>
                        <td style={{ padding:"7px 14px", textAlign:"right", color:row.c, fontWeight:row.bold?700:400, ...M, fontSize:12 }}>{row.v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}

              {/* Note on grouping with 24hr clients */}
              <div style={{ padding:"10px 14px", background:"#FBF3DC", borderRadius:8, border:"1px solid #e6d9a8", fontSize:11, color:"#6a5320", lineHeight:1.7 }}>
                <strong style={{ color:"#5a4308" }}>Note on 24-Hour Home Grouping:</strong> In rare cases, hourly participants may share evening group time with 24-hour supported living clients. When this occurs, add them to the relevant home in the Home Mix Editor (still not to exceed 3 total participants). Their revenue still bills at the unit rates above; the 24-hour clients' billing is unaffected.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB: BUDGET BUILDER
══════════════════════════════════════════════════════════ */
function BudgetBuilderTab({ co, hourlyTotals, wage, userRole }) {
  const [custom, setCustom] = useState({});

  const totalPx   = co.totalClients;
  const annualRev = co.annualRevNet;
  const revPerPx  = totalPx > 0 ? annualRev / totalPx : 0;

  // ownerTier: which tier "owns" this budget line (per access-levels-and-rights.md)
  const categories = [
    { id:0,  label:"Direct Care Labor (DSP Wages)",    ownerTier:1, recommended: co.annualDirectLabor,         note:"From your model" },
    { id:1,  label:"Overtime Reserve",                  ownerTier:4, recommended: co.annualDirectLabor * 0.10, note:"10% of direct labor" },
    { id:2,  label:"House Lead / Senior DSP Labor",     ownerTier:5, recommended: totalPx * 18000,             note:"~$18K/participant (0.33 FTE)" },
    { id:3,  label:"HR & Recruiting",                   ownerTier:6, recommended: totalPx * 1200,              note:"~$1,200/participant/yr (30% turnover)" },
    { id:4,  label:"Training & Development",            ownerTier:6, recommended: totalPx * 600,               note:"~$600/participant/yr ($300/DSP × 2 DSPs/px)" },
    { id:5,  label:"Program Supplies",                  ownerTier:8, recommended: totalPx * 1200,              note:"~$100/participant/month" },
    { id:6,  label:"Community Activities & Recreation", ownerTier:8, recommended: totalPx * 1800,              note:"~$150/participant/month" },
    { id:7,  label:"Transportation / Vehicle Fleet",    ownerTier:5, recommended: co.totalHomes * 6000,        note:"~$500/home/month" },
    { id:8,  label:"Technology & EVV",                  ownerTier:5, recommended: totalPx * 480,               note:"~$40/participant/month" },
    { id:9,  label:"Administrative & Compliance",       ownerTier:4, recommended: annualRev * 0.03,            note:"3% of net revenue" },
    { id:10, label:"Contingency Reserve",               ownerTier:1, recommended: annualRev * 0.03,            note:"3% of total budget" },
  ];

  const categoriesWithVis = categories.map(c => ({
    ...c,
    vis: budgetRowVisibility(userRole, c.ownerTier),
  }));

  const visible     = categoriesWithVis.filter(c => c.vis !== 'hidden');
  const totalBudget = categories.reduce((a,c) => a + (custom[c.id] ?? c.recommended), 0);
  const visibleBudget = visible.reduce((a,c) => a + (custom[c.id] ?? c.recommended), 0);
  const showCompanyTotal = canSeeCompanyDollars(userRole);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Top context — tiers 1–3 only */}
      {showCompanyTotal && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          {[
            { l:"Total Participants",    v: totalPx,   c:"#0E6B78", f:n=>n },
            { l:"Net Revenue",           v: annualRev, c:"#0A3D47", f:$k  },
            { l:"Revenue / Participant", v: revPerPx,  c:"#C9921A", f:$k  },
          ].map((s,i)=>(
            <div key={i} style={{ background:"#f0f4fa", borderRadius:9, padding:"12px 16px", border:"1px solid #c8d4e4" }}>
              <div style={{ fontSize:9, color:"#5a7498", textTransform:"uppercase", letterSpacing:1.5, ...M, marginBottom:5 }}>{s.l}</div>
              <div style={{ fontSize:18, fontWeight:800, color:s.c, ...M }}>{s.f(s.v)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Budget lines */}
      <div style={{ background:"#f0f4fa", borderRadius:12, border:"1px solid #c8d4e4", overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #c8d4e4", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <SL>Budget Lines ({visible.length} of {categories.length} categories)</SL>
          <div style={{ fontSize:11, color:"#5a7498", ...M }}>
            {showCompanyTotal ? "Click a value to edit · Showing recommended defaults" : "Values shown as % of net revenue"}
          </div>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:"2px solid #c8d4e4" }}>
              {["Budget Category","Annual Amount","Per Participant","Notes"].map(h=>(
                <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:9, color:"#5a7498", textTransform:"uppercase", letterSpacing:1, ...M }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((cat,i)=>{
              const amt   = custom[cat.id] ?? cat.recommended;
              const perPx = totalPx > 0 ? amt / totalPx : 0;
              const isDollars = cat.vis === 'dollars';
              return (
                <tr key={cat.id} style={{ borderBottom:"1px solid #e2e8f0", background:i%2===0?"#e8eef6":"transparent" }}>
                  <td style={{ padding:"10px 14px", color:"#0A3D47", fontWeight:600, fontSize:12 }}>{cat.label}</td>
                  <td style={{ padding:"10px 14px" }}>
                    {isDollars ? (
                      <div style={{ display:"flex", alignItems:"center", gap:4, background:"#ebebeb", borderRadius:6, padding:"4px 8px", border:`1px solid ${custom[cat.id]!=null?"#D4A52040":"#b5c8de"}`, width:"fit-content" }}>
                        <span style={{ fontSize:10, color:"#64748b" }}>$</span>
                        <input type="number" value={Math.round(amt)} min={0} step={1000}
                          onChange={e=>setCustom(c=>({...c,[cat.id]:Number(e.target.value)}))}
                          style={{ width:90, background:"none", border:"none", color:custom[cat.id]!=null?"#E8C44A":"#0A3D47", ...M, fontSize:13, fontWeight:700, outline:"none", textAlign:"right" }}/>
                      </div>
                    ) : (
                      <span style={{ fontSize:13, fontWeight:700, color:"#5a7498", ...M }}>
                        {annualRev > 0 ? pct(amt / annualRev) : "—"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding:"10px 14px", color:"#5a7498", ...M, fontSize:12 }}>
                    {isDollars ? $k(perPx) : (totalPx > 0 ? pct(amt / annualRev) : "—")}
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:10, color:"#64748b" }}>{cat.note}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background:"#e8eef6", borderTop:"2px solid #c8d4e4" }}>
              <td style={{ padding:"12px 14px", fontWeight:700, color:"#0A3D47", fontSize:13 }}>Visible Budget Total</td>
              <td style={{ padding:"12px 14px", fontWeight:800, color:"#D4A520", ...M, fontSize:15 }}>
                {showCompanyTotal ? $k(visibleBudget) : (annualRev > 0 ? pct(visibleBudget/annualRev) : "—")}
              </td>
              <td style={{ padding:"12px 14px", color:"#0A5260", ...M, fontSize:12 }}>
                {showCompanyTotal ? `${$k(totalPx>0?visibleBudget/totalPx:0)}/participant` : ""}
              </td>
              <td/>
            </tr>
            {showCompanyTotal && (
              <tr style={{ background:"#f0fff4" }}>
                <td style={{ padding:"10px 14px", fontWeight:700, color:"#15803d", fontSize:12 }}>Total Company Budget (All Lines)</td>
                <td style={{ padding:"10px 14px", fontWeight:800, color:"#15803d", ...M, fontSize:13 }}>{$k(totalBudget)}</td>
                <td style={{ padding:"10px 14px", color:"#15803d", ...M, fontSize:11 }}>
                  {annualRev > 0 ? pct(totalBudget/annualRev) : "—"} of revenue
                </td>
                <td/>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {showCompanyTotal && (
        <div style={{ padding:"12px 16px", background:"#f0f4fa", borderRadius:9, border:"1px solid #c8d4e4", fontSize:11, color:"#5a7498", lineHeight:1.8 }}>
          <strong style={{ color:"#D4A520" }}>How to use this budget tool:</strong> Recommended values are calculated from your model's participant count and revenue. Adjust any line by clicking the dollar amount. Role-based views hide financial position from non-executive roles — a House Lead only sees their program supply and activity budget; HR only sees recruiting and training. Use this tool to set department budgets that directors can work within without seeing company-level financials.
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB: FAQ & AI ASSISTANT
══════════════════════════════════════════════════════════ */
// minTier/maxTier default to 1/8 — items outside a user's tier are filtered out
const FAQ_DATA = [
  {
    cat: "Understanding Your Revenue",
    items: [
      { maxTier:7,
        q:"What is the difference between Intense Support and High Support?",
        a:"Intense Support clients have more complex needs and are authorized for a higher daily rate ($678.77/day). High Support clients receive a lower daily rate ($368.67/day). Both are billed 365 days per year. The key operational difference is that Intense clients often require 1:1 staffing while High Support clients can typically be staffed at 1:2 or 1:3 ratios." },
      { maxTier:4,
        q:"What is the difference between Normal Intense and Intense Blended billing?",
        a:"Normal Intense bills the flat daily rate ($678.77) every day regardless of how service is delivered — this rate does not change when clients share group time at night. Intense Blended bills using unit rates: individual time at $7.07/15-min ($28.28/hr) and group time at $3.61/15-min ($14.44/hr). For clients who group at night, Normal Intense is almost always more favorable because the revenue doesn't decrease when staff are shared." },
      { maxTier:6,
        q:"How do group hours affect revenue and labor?",
        a:"During group hours (typically overnight), one staff member covers all clients in the home — so a home with 3 clients that groups 12 hours/night uses only 1 staff for those hours instead of 3. For Normal Intense billing, revenue stays at the full daily rate ($678.77/client) regardless. This means grouping creates pure labor savings with no revenue reduction — the primary financial lever in this model." },
      { maxTier:5,
        q:"What are Hourly Supported Living rates?",
        a:"Hourly services use the same unit rates as Intense Individual (U2) at $7.07/15-min ($28.28/hr) and Intense Group (U3) at $3.61/15-min ($14.44/hr). Unlike 24-hour clients, hourly participants are authorized for a specific number of hours per week with a weekly cap. They typically live independently in the community rather than in a supported living home." },
    ]
  },
  {
    cat: "Staffing & Labor",
    items: [
      { q:"How is the staffing ratio calculated for High Support clients?",
        a:"High Support clients are staffed at a 1:2 ratio — one staff member can cover two High Support clients simultaneously. So a home with 2 High Support clients uses 1 staff position during day hours. If there are 3 High Support clients, it still rounds up to 2 staff (ceiling division). This is why all-high homes are extremely cost-efficient." },
      { maxTier:7,
        q:"How is labor calculated for group hours?",
        a:"During group hours (when multiple clients are together), only 1 staff member is needed for the entire group. During day hours, each Intense client needs 1:1 coverage, and High Support clients share at 1:2. The tool calculates: Night labor = 1 staff × group hours. Day labor = (High clients ÷ 2, rounded up) + Intense clients × day hours." },
      { maxTier:6,
        q:"What is payroll burden and why is it 22%?",
        a:"Payroll burden represents employer-paid taxes and benefits on top of wages — including FICA (7.65%), workers' compensation, unemployment insurance (SUTA/FUTA), and any employer-paid benefits. The 22% default is a reasonable estimate for Idaho supported living providers. Your actual burden may vary; adjust this by updating the payroll burden assumption in your overhead settings." },
    ]
  },
  {
    cat: "Financial Metrics",
    items: [
      { maxTier:4,
        q:"What is EBITDA and why does it matter?",
        a:"EBITDA (Earnings Before Interest, Taxes, Depreciation, and Amortization) represents your operating profitability before financing and tax effects. It's the standard measure for comparing operational performance across businesses and is used to value companies. A healthy supported living provider typically targets 35-50% EBITDA margin. Net Income (after tax) is what you actually keep." },
      { maxTier:4,
        q:"What EBITDA margin should I target?",
        a:"Based on the rate structure in Idaho, well-run supported living homes with proper grouping should achieve 55-65% gross margin at the home level. After management overhead, G&A, and fees, company-wide EBITDA margins of 35-45% are realistic. Margins below 30% indicate staffing inefficiency or under-utilization of group hours." },
      { maxTier:3,
        q:"What are the management and billing fees for?",
        a:"Management fees (default 5%) represent what a management company or corporate entity charges for administrative oversight, compliance management, and operational support — common in multi-site provider organizations. Billing fees (default 1%) cover EVV compliance, claims submission, denial management, and Medicaid billing administration. These are often contracted out to specialized firms." },
      { minTier:4, maxTier:7,
        q:"Why are values shown as percentages instead of dollar amounts?",
        a:"Your access level is configured to show financial performance as margins and ratios rather than raw dollar figures. This gives you the information you need to assess performance relative to revenue without exposing company-level financials. The Margin Guide in the sidebar (Excellent >62%, Strong 52–62%, Good 42–52%, Tight 30–42%, At Risk <30%) translates those percentages into actionable color-coded health states." },
    ]
  },
  {
    cat: "Using This Tool",
    items: [
      { maxTier:4,
        q:"What is the difference between Home Mix Editor and Labor Efficiency?",
        a:"Home Mix Editor lets you configure each home individually — setting client mix (High Support vs Intense), night group hours, wages, and billing type. Labor Efficiency models a single home's staffing ratios and long-run economics: all users see efficiency ratios and the group-hours sweep; authorized roles also see dollar metrics, labor costs per shift, and a 5-year projection at 5% annual growth." },
      { maxTier:5,
        q:"How do I model a rate reduction scenario?",
        a:"Use the Reimbursement Rates panel in the left sidebar. Click the expand arrow, then type new rates or use the quick reduction buttons (−2%, −4%, −6% from baseline). The tool recalculates all margins and performance metrics in real time across every tab." },
      { q:"How does the Budget Builder work?",
        a:"The Budget Builder shows the operational budget for each category based on your participant count. Each row is assigned to the role responsible for that budget line — your access level determines which rows you see and in what form. Rows at your tier are shown in dollar amounts. Rows below your tier are shown as a percentage of net revenue. Rows above your tier are hidden entirely." },
      { q:"What does the Margin Guide mean?",
        a:"The Margin Guide on the left side of the screen translates gross margin percentages into operational health states: Excellent (>62%), Strong (52–62%), Good (42–52%), Tight (30–42%), and At Risk (<30%). Excellent means the home is running efficiently with strong grouping and optimal client mix. At Risk means labor costs are consuming most of the revenue — typically caused by insufficient group hours, low occupancy, or inefficient staffing patterns." },
    ]
  },
];

function getAISystemPrompt(userRole) {
  const t = ROLE_TIERS[userRole] ?? 99;
  const base = `You are a knowledgeable assistant specializing in Idaho HCBS (Home and Community Based Services) supported living programs. Keep responses concise (2-4 paragraphs max), practical, and specific to Idaho HCBS.`;
  if (t <= 3) {
    return `${base} You help providers understand their revenue model, billing, staffing ratios, and financial performance.

Key rate knowledge:
- Intense Support Daily (Normal): $678.77/day (365 days/yr)
- High Support Daily: $368.67/day (365 days/yr)
- Intense/Hourly Individual U2: $7.07 per 15-min unit = $28.28/hr
- Intense/Hourly Group U3: $3.61 per 15-min unit = $14.44/hr
- High Support staffing: 1:2 ratio; Intense staffing: 1:1
- Group hours: 1 staff covers all clients (up to 3 per home)
- Max 3 participants per supported living home
- Normal Intense billing locks revenue at daily rate regardless of group hours
- Blended Intense bills unit rates (revenue decreases as group time increases)

Use dollar amounts and percentages where helpful.`;
  }
  if (t === 4) {
    return `${base} You help Regional Directors understand operational performance metrics, staffing efficiency, and service line margins. Financial figures are shown as percentages and margins rather than raw dollars in this tool.

Key operational knowledge:
- EBITDA margin target: 35–50% for well-run providers
- Gross margin per home target: 55–65% with good grouping
- High Support staffing: 1:2 ratio; Intense: 1:1
- Group hours (overnight): 1 staff covers the full home — primary labor efficiency lever
- Occupancy and group hours are the two biggest drivers of per-home performance
- Reimbursement rate overrides available in the sidebar for scenario planning

Focus on margins, ratios, and operational levers. Avoid quoting raw annual revenue or income dollar totals.`;
  }
  if (t <= 6) {
    return `${base} You help Program Managers and HR Managers understand staffing structures, labor efficiency, and operational metrics for HCBS service lines.

Key staffing knowledge:
- High Support clients: 1:2 staffing ratio (one staff covers two clients)
- Intense Support clients: 1:1 staffing (individual hours)
- Group hours (typically overnight): one staff covers the entire home regardless of client count
- Maximizing group hours is the primary lever for reducing labor cost per client
- Payroll burden (taxes, workers' comp, benefits) adds approximately 22% on top of base wages
- Gross margin per home typically runs 55–65% in well-configured homes

Focus on staffing ratios, scheduling efficiency, and operational health. Avoid quoting company-level dollar totals.`;
  }
  if (t === 7) {
    return `${base} You help Schedulers understand staffing patterns, coverage requirements, and labor efficiency in supported living homes.

Key scheduling knowledge:
- High Support clients: 1 staff covers 2 clients simultaneously during day hours
- Intense Support clients: require individual 1:1 coverage during day hours
- Group hours (overnight): 1 staff covers all clients in the home regardless of mix — this is the most important scheduling efficiency lever
- A 3-client home grouping 12 hours overnight needs only 1 overnight staff instead of 3
- Occupancy rate affects how many staff hours are billable vs. idle
- Night group hours vs. individual hours is the key variable in staff scheduling efficiency

Focus on scheduling coverage, shift planning, and staffing ratios. Avoid financial figures beyond basic ratios.`;
  }
  return `${base} You help House Leads and Team Coordinators understand daily operations, client care expectations, and occupancy in their supported living home.

Key operational knowledge:
- High Support clients can share staff time at a 1:2 ratio during the day
- Intense Support clients require individual staff coverage during the day
- Overnight (group hours), one staff member covers all clients in the home
- Occupancy rate reflects how consistently the home is fully staffed and serving clients
- The Margin Guide shows the operational health of the home using color-coded states

Focus on day-to-day operations, client mix, and occupancy. Keep financial concepts minimal and accessible.`;
}

function FAQTab({ userRole }) {
  const userTier = ROLE_TIERS[userRole] ?? 99;
  const visibleData = FAQ_DATA.map(section => ({
    ...section,
    items: section.items.filter(item =>
      (item.minTier ?? 1) <= userTier && userTier <= (item.maxTier ?? 8)
    ),
  })).filter(section => section.items.length > 0);

  const [open, setOpen]   = useState({});
  const [messages, setMessages] = useState([
    { role:"assistant", content:"Hello! I'm your Idaho HCBS assistant. I can help you understand supported living operations, staffing, and how to read your model results. What would you like to know?" }
  ]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(()=>{ chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role:"user", content:input.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          system: getAISystemPrompt(userRole),
          messages: nextMessages.map(m=>({ role:m.role, content:m.content })),
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? "I'm sorry, I couldn't generate a response.";
      setMessages(prev=>[...prev, { role:"assistant", content:text }]);
    } catch {
      setMessages(prev=>[...prev, { role:"assistant", content:"I'm having trouble connecting right now. Please try again in a moment." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"start" }}>
      {/* FAQ accordion */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#0A3D47", marginBottom:4 }}>Frequently Asked Questions</div>
        {visibleData.map((section,si)=>(
          <div key={si} style={{ background:"#f0f4fa", borderRadius:10, border:"1px solid #c8d4e4", overflow:"hidden" }}>
            <div style={{ padding:"10px 16px", background:"#e4eaf4", fontSize:11, fontWeight:700, color:"#0A3D47", textTransform:"uppercase", letterSpacing:1.5, ...M }}>
              {section.cat}
            </div>
            {section.items.map((item,ii)=>{
              const key = `${si}-${ii}`;
              return (
                <div key={ii} style={{ borderTop:"1px solid #c8d4e4" }}>
                  <button onClick={()=>setOpen(o=>({...o,[key]:!o[key]}))} style={{
                    width:"100%", padding:"12px 16px", background:"none", border:"none", cursor:"pointer",
                    display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, textAlign:"left",
                  }}>
                    <span style={{ fontSize:12, color:"#0A3D47", fontFamily:"'Sora',sans-serif", fontWeight:600, lineHeight:1.5 }}>{item.q}</span>
                    <span style={{ color:"#0E6B78", fontSize:14, flexShrink:0 }}>{open[key]?"▲":"▼"}</span>
                  </button>
                  {open[key] && (
                    <div style={{ padding:"0 16px 14px", fontSize:12, color:"#5a7498", lineHeight:1.8, borderTop:"1px solid #c8d4e4" }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* AI Chat */}
      <div style={{ background:"#f0f4fa", borderRadius:12, border:"1px solid #c8d4e4", display:"flex", flexDirection:"column", height:620 }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #c8d4e4" }}>
          <div style={{ fontWeight:800, fontSize:14, color:"#0A3D47" }}>AI Financial Assistant</div>
          <div style={{ fontSize:10, color:"#64748b", marginTop:3 }}>Powered by Claude · Idaho HCBS expertise</div>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
          {messages.map((msg,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:msg.role==="user"?"flex-end":"flex-start" }}>
              <div style={{
                maxWidth:"85%", padding:"10px 14px", borderRadius:10, fontSize:12, lineHeight:1.7,
                background: msg.role==="user" ? "#0E6B7818" : "#ffffff",
                border: msg.role==="user" ? "1px solid #0E6B7860" : "1px solid #c8d4e4",
                color: "#0A3D47",
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display:"flex", gap:4, padding:"10px 14px" }}>
              {[0,1,2].map(i=>(
                <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#0E6B78",
                  animation:`pulse 1.2s ${i*0.2}s infinite`,
                  opacity:0.6 }}/>
              ))}
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>
        <div style={{ padding:"12px 16px", borderTop:"1px solid #c8d4e4", display:"flex", gap:8 }}>
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMessage()}
            placeholder="Ask about billing, staffing, margins, rates…"
            style={{
              flex:1, background:"#ffffff", border:"1px solid #c8d4e4", borderRadius:8,
              padding:"9px 14px", color:"#0A3D47", fontSize:12, outline:"none",
              fontFamily:"'Sora',sans-serif",
            }}/>
          <button onClick={sendMessage} disabled={loading || !input.trim()} style={{
            padding:"9px 18px", borderRadius:8, border:"none", cursor:"pointer",
            background: input.trim() && !loading ? "#0E6B78" : "#b5c8de",
            color: input.trim() && !loading ? "#ebebeb" : "#64748b",
            fontWeight:700, fontSize:12, fontFamily:"'Sora',sans-serif", transition:"all 0.15s",
          }}>Send</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   PORTFOLIO COMPARISON (demo data — live version uses Supabase)
══════════════════════════════════════════════════════════ */
const DEMO_COMPANIES = [
  { id:1, name:"Cascade Care Group",   status:"active",  wage:18.50, occ:92, clients:14, homes:6, ebitdaMgn:0.58, netMgn:0.42, revNet:1240000, ebitda:719200,  netInc:520800, lastSaved:"2026-03-18" },
  { id:2, name:"Blue Ridge Services",  status:"active",  wage:17.00, occ:88, clients:9,  homes:4, ebitdaMgn:0.51, netMgn:0.37, revNet:780000,  ebitda:397800,  netInc:288600, lastSaved:"2026-03-15" },
  { id:3, name:"Summit Supported Living",status:"active", wage:19.00, occ:95, clients:21, homes:8, ebitdaMgn:0.63, netMgn:0.47, revNet:1890000, ebitda:1190700, netInc:888300, lastSaved:"2026-03-19" },
  { id:4, name:"Valley View HCBS",     status:"active",  wage:16.50, occ:80, clients:6,  homes:3, ebitdaMgn:0.38, netMgn:0.25, revNet:520000,  ebitda:197600,  netInc:130000, lastSaved:"2026-02-28" },
  { id:5, name:"Clearwater Partners",  status:"active",  wage:18.00, occ:90, clients:12, homes:5, ebitdaMgn:0.55, netMgn:0.40, revNet:1050000, ebitda:577500,  netInc:420000, lastSaved:"2026-03-10" },
  { id:6, name:"Pioneer Community Care",status:"suspended",wage:17.50, occ:65, clients:5,  homes:3, ebitdaMgn:0.28, netMgn:0.14, revNet:380000,  ebitda:106400,  netInc:53200,  lastSaved:"2026-01-15" },
  { id:7, name:"Horizon Home Services",status:"active",  wage:20.00, occ:97, clients:18, homes:7, ebitdaMgn:0.61, netMgn:0.45, revNet:1640000, ebitda:1000400, netInc:738000, lastSaved:"2026-03-17" },
];

function MarginBar({ value, max=0.7 }) {
  const pctVal = Math.max(0, Math.min(value ?? 0, max));
  const width  = (pctVal / max) * 100;
  const color  = mc(pctVal);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ flex:1, height:6, background:"#dce7f5", borderRadius:3, overflow:"hidden" }}>
        <div style={{ width:`${width}%`, height:"100%", background:color, borderRadius:3 }}/>
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, ...M, minWidth:38, textAlign:"right" }}>{pct(pctVal)}</span>
    </div>
  );
}

function PortfolioComparison({ userRole }) {
  const [sortCol, setSortCol] = useState("ebitdaMgn");
  const [sortDir, setSortDir] = useState("desc");
  const [filter,  setFilter]  = useState("all");
  const showDollars = canSeeCompanyDollars(userRole);
  const showWage    = wageDisplayMode(userRole) !== 'hidden';

  const handleSort = col => {
    if (col === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const visible = filter === "all" ? DEMO_COMPANIES : DEMO_COMPANIES.filter(c => c.status === filter);
  const sorted  = [...visible].sort((a,b) => {
    const av = a[sortCol] ?? -Infinity;
    const bv = b[sortCol] ?? -Infinity;
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const active   = DEMO_COMPANIES.filter(c => c.status === "active");
  const totRev   = active.reduce((a,c) => a + c.revNet, 0);
  const totEbitda= active.reduce((a,c) => a + c.ebitda, 0);
  const totNet   = active.reduce((a,c) => a + c.netInc, 0);
  const avgMgn   = totRev > 0 ? totEbitda / totRev : 0;
  const avgNet   = totRev > 0 ? totNet    / totRev : 0;
  const totClients= active.reduce((a,c) => a + c.clients, 0);
  const totHomes  = active.reduce((a,c) => a + c.homes,   0);

  const SH = ({ col, label, right }) => (
    <th onClick={() => handleSort(col)} style={{
      padding:"9px 12px", textAlign:right?"right":"left", cursor:"pointer", userSelect:"none",
      fontSize:9, color:sortCol===col?"#0E6B78":"#475569", textTransform:"uppercase",
      letterSpacing:1.5, ...M, borderBottom:"1px solid #d0dae8", background:"#eef1f6", whiteSpace:"nowrap",
    }}>
      {label}
      <span style={{ color:sortCol===col?"#0E6B78":"#64748b", marginLeft:4 }}>
        {sortCol===col ? (sortDir==="asc"?"↑":"↓") : "↕"}
      </span>
    </th>
  );

  const rankByMargin = [...DEMO_COMPANIES].filter(c=>c.status==="active").sort((a,b)=>b.ebitdaMgn-a.ebitdaMgn);
  const rankMap = {};
  rankByMargin.forEach((c,i) => { rankMap[c.id] = i+1; });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Cinzel',serif", fontSize:14, color:"#0E6B78", letterSpacing:2, marginBottom:4 }}>Portfolio Comparison</div>
          <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1.5, ...M }}>
            {active.length} active · {DEMO_COMPANIES.length} total companies
            <span style={{ color:"#0E6B7860", marginLeft:8 }}>· demo data — live version syncs from Supabase</span>
          </div>
        </div>
        <div style={{ display:"flex", gap:7 }}>
          {["all","active","suspended"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding:"4px 12px", borderRadius:6, border:"none", cursor:"pointer",
              fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, ...M,
              background:filter===f?"#0E6B78":"#eef1f6",
              color:filter===f?"#ebebeb":"#475569",
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
        {[
          { l:"Active Companies", v:active.length,     c:"#0E6B78",                        f:n=>n },
          { l:"Total Clients",    v:totClients,         c:"#0E6B78",                        f:n=>n },
          { l:"Total Homes",      v:totHomes,           c:"#0A5260",                        f:n=>n },
          showDollars && { l:"Portfolio Revenue",v:totRev, c:"#0A3D47", f:$k },
          { l:"Portfolio EBITDA", v:showDollars?totEbitda:avgMgn, c:mc(Math.max(0,avgMgn)), f:showDollars?$k:pct, sub:showDollars?pct(avgMgn)+" avg mgn":undefined },
          { l:"Portfolio Net",    v:showDollars?totNet:avgNet,    c:nmc(Math.max(0,avgNet)), f:showDollars?$k:pct, sub:showDollars?pct(avgNet)+" avg mgn":undefined, hi:true },
        ].filter(Boolean).map((s,i) => (
          <div key={i} style={{
            flex:"1 1 120px", background:s.hi?s.c+"12":"#eef1f6",
            borderRadius:10, padding:"10px 14px",
            border:s.hi?`1px solid ${s.c}35`:"1px solid #d0dae8",
          }}>
            <div style={{ fontSize:8.5, color:"#475569", textTransform:"uppercase", letterSpacing:1.5, ...M, marginBottom:4 }}>{s.l}</div>
            <div style={{ fontSize:17, fontWeight:800, color:s.c, ...M, lineHeight:1 }}>{s.f(s.v)}</div>
            {s.sub && <div style={{ fontSize:9, color:"#475569", ...M, marginTop:3 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius:12, border:"1px solid #d0dae8", overflow:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth:860 }}>
          <thead>
            <tr>
              <th style={{ padding:"9px 12px", width:36, background:"#eef1f6", borderBottom:"1px solid #d0dae8" }}></th>
              <SH col="name"      label="Company"/>
              <SH col="status"    label="Status"    right/>
              <SH col="clients"   label="Clients"   right/>
              <SH col="homes"     label="Homes"     right/>
              <SH col="revNet"    label="Net Revenue" right/>
              <SH col="ebitda"    label="EBITDA"    right/>
              <SH col="ebitdaMgn" label="EBITDA Margin" right/>
              <SH col="netInc"    label="Net Income" right/>
              <SH col="netMgn"    label="Net Margin" right/>
              <SH col="wage"      label="Wage"      right/>
              <SH col="occ"       label="Occ%"      right/>
              <SH col="lastSaved" label="Last Saved" right/>
            </tr>
          </thead>
          <tbody>
            {sorted.map((co,ri) => {
              const rank   = rankMap[co.id];
              const active = co.status === "active";
              return (
                <tr key={co.id} style={{ borderBottom:"1px solid #e8edf3", background:ri%2===0?"#eef1f6":"#e6ebf3", opacity:active?1:0.5 }}
                  onMouseEnter={e=>e.currentTarget.style.background="#edf2f8"}
                  onMouseLeave={e=>e.currentTarget.style.background=ri%2===0?"#eef1f6":"#e6ebf3"}
                >
                  {/* Rank badge */}
                  <td style={{ padding:"10px 12px", textAlign:"center" }}>
                    {active && (
                      <div style={{
                        width:22, height:22, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center",
                        background:rank===1?"#D4A520":rank===2?"#9ca3af":rank===3?"#b45309":"#dce7f5",
                        color:rank<=3?"#ebebeb":"#475569", fontSize:9, fontWeight:800, ...M,
                      }}>{rank}</div>
                    )}
                  </td>
                  <td style={{ padding:"10px 12px", color:"#0A3D47", fontWeight:600, fontSize:12 }}>{co.name}</td>
                  <td style={{ padding:"10px 12px", textAlign:"right" }}>
                    <span style={{
                      fontSize:8, fontWeight:700, textTransform:"uppercase", letterSpacing:1, ...M,
                      padding:"2px 6px", borderRadius:4,
                      background:active?"#00e5aa18":"#f8717118",
                      color:active?"#00e5aa":"#f87171",
                      border:active?"1px solid #00e5aa30":"1px solid #f8717130",
                    }}>{co.status}</span>
                  </td>
                  <td style={{ padding:"10px 12px", textAlign:"right", ...M, fontSize:12, color:"#0E6B78", fontWeight:700 }}>{co.clients}</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", ...M, fontSize:12, color:"#0A5260", fontWeight:700 }}>{co.homes}</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", ...M, fontSize:12, color:"#0A3D47", fontWeight:700 }}>{showDollars ? $k(co.revNet) : "—"}</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", ...M, fontSize:12, color:mc(co.ebitdaMgn), fontWeight:700 }}>{showDollars ? $k(co.ebitda) : pct(co.ebitdaMgn)}</td>
                  <td style={{ padding:"8px 12px", minWidth:150 }}><MarginBar value={co.ebitdaMgn}/></td>
                  <td style={{ padding:"10px 12px", textAlign:"right", ...M, fontSize:12, color:nmc(co.netMgn), fontWeight:700 }}>{showDollars ? $k(co.netInc) : pct(co.netMgn)}</td>
                  <td style={{ padding:"8px 12px", minWidth:130 }}><MarginBar value={co.netMgn} max={0.5}/></td>
                  <td style={{ padding:"10px 12px", textAlign:"right", fontSize:11, color:"#5a7498", ...M }}>{showWage ? `$${co.wage?.toFixed(2)}/hr` : "—"}</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", fontSize:11, color:"#5a7498", ...M }}>{co.occ}%</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", fontSize:10, color:"#64748b", ...M }}>
                    {new Date(co.lastSaved).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"})}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:8.5, color:"#64748b", textTransform:"uppercase", letterSpacing:1.5, ...M }}>Margin guide:</span>
        {[{label:"> 62%",c:"#00e5aa"},{label:"52–62%",c:"#22c55e"},{label:"42–52%",c:"#f59e0b"},{label:"30–42%",c:"#fb923c"},{label:"< 30%",c:"#f87171"}].map(g=>(
          <div key={g.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:g.c }}/>
            <span style={{ fontSize:9, color:"#475569", ...M }}>{g.label}</span>
          </div>
        ))}
        <span style={{ fontSize:8.5, color:"#64748b", ...M, marginLeft:8 }}>· Rank ① = highest EBITDA margin among active companies</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SERVICE LINE STRIP COMPONENTS
// ════════════════════════════════════════════════════════════════════

function ServiceLineTab({ label, active, onRemove, containerRef, isDragging, onPointerDown, onPointerMove, onPointerUp }) {
  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position:"relative", display:"inline-flex", alignItems:"stretch",
        cursor: "pointer", flexShrink:0,
        userSelect:"none", touchAction:"none",
        opacity: isDragging ? 0.45 : 1,
        transition:"opacity 80ms",
      }}
    >
      <button style={{
        padding:"8px 16px", borderRadius:"8px 8px 0 0", border: "none",
        cursor:"inherit", pointerEvents:"none",
        fontSize:11, fontWeight:700, whiteSpace:"nowrap",
        background: active ? "#0A2C35" : "rgba(20,29,44,0.04)",
        color: active ? "#fff" : "#5a7498",
        outline: active ? "1px solid #7AB5C0" : "1px solid transparent",
        outlineOffset: 0,
        marginBottom: active ? "-1px" : "0",
        transition: "background 0.12s, color 0.12s",
      }}>
        {label}
        {active && onRemove && (
          <span
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onRemove(); }}
            style={{ marginLeft:8, color:"#cf6e6e", fontSize:10, opacity:0.7, pointerEvents:"auto" }}
            title="Remove service line">✕</span>
        )}
      </button>
    </div>
  );
}

// Animated gap that appears between tabs during a drag to show the drop target.
function GapIndicator({ width }) {
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      width, minWidth:2, alignSelf:"stretch",
      transition:"width 120ms ease", flexShrink:0,
    }}>
      <div style={{ width:2, height:20, background:"#0E6B78", borderRadius:1, opacity:0.85 }} />
    </div>
  );
}

function AddServiceLineButton({ existingTypes, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const groups = getGroupedPickerOptions();
  // Kill-switch: enable the `hide-catalog-service-lines` flag in PostHog to hide
  // in-development (catalog) types from the picker without a deploy. Default off
  // = current behavior (catalog types shown).
  const hideCatalog = useFeatureFlag('hide-catalog-service-lines');

  return (
    <div ref={ref} style={{ position:"relative", marginLeft:6 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding:"7px 14px", borderRadius:"7px 7px 0 0", border:"1px dashed #c8d4e4",
        background:"transparent", color:"#5a7498", cursor:"pointer",
        fontSize:11, fontWeight:700, whiteSpace:"nowrap",
      }}>+ Add Service Line</button>

      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 2px)", left:0, zIndex:50,
          background:"#fff", border:"1px solid #c8d4e4", borderRadius:8,
          padding:"6px 0", minWidth:340, maxHeight:480, overflowY:"auto",
          boxShadow:"0 6px 24px rgba(0,0,0,0.12)",
        }}>
          {groups.map(group => (
            <div key={group.archetype} style={{ marginBottom:6 }}>
              <div style={{
                padding:"6px 14px 4px", fontSize:9, color:"#94a3b8",
                fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:1.5,
              }}>{group.label}</div>
              {group.types.map(t => {
                const existing = existingTypes.includes(t.type);
                if (hideCatalog && t.status === 'catalog' && !existing) return null;
                return (
                  <button key={t.type} disabled={existing}
                    onClick={() => { onAdd(t.type); setOpen(false); }}
                    style={{
                      width:"100%", textAlign:"left", padding:"6px 14px",
                      border:"none", background: existing ? "#f5f5f5" : "transparent",
                      cursor: existing ? "not-allowed" : "pointer",
                      color: existing ? "#94a3b8" : "#0A3D47",
                      fontSize:12, fontFamily:"'Sora',sans-serif",
                    }}
                    onMouseEnter={(e) => { if (!existing) e.currentTarget.style.background = "#f7f9fc"; }}
                    onMouseLeave={(e) => { if (!existing) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ fontWeight:600 }}>
                      {t.label}{existing && <span style={{ marginLeft:8, fontSize:9 }}>(added)</span>}
                      {t.status === 'catalog' && !existing && <span style={{ marginLeft:8, fontSize:9, color:"#94a3b8" }}>(catalog)</span>}
                    </div>
                    <div style={{ fontSize:10, color:"#64748b", marginTop:2 }}>{t.description}</div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogPlaceholder({ type }) {
  const def = SERVICE_LINE_DEFS[type];
  if (!def) return null;
  const lineRates = ratesForLine(type);

  return (
    <div>
      <div style={{
        background:"#fff", border:"1px solid #d0dae8", borderRadius:10,
        padding:24, marginBottom:14,
      }}>
        <h2 style={{ margin:"0 0 6px", color:"#0A3D47", fontSize:18, fontWeight:700 }}>{def.label}</h2>
        <div style={{ color:"#64748b", fontSize:13, marginBottom:14 }}>{def.description}</div>
        <div style={{
          padding:14, background:"#fffbe8", border:"1px solid #f4e4a8", borderRadius:8,
          color:"#0A3D47", fontSize:12, fontFamily:"'DM Mono',monospace", lineHeight:1.6,
        }}>
          <strong>Coming soon.</strong> The full UI for this service line is on the roadmap.
          For now, the rate catalog below shows the codes and rates that apply. Once the
          calculator is wired up, this will become a fully editable financial model.
        </div>
      </div>

      {lineRates.length > 0 && (
        <div style={{ background:"#fff", border:"1px solid #d0dae8", borderRadius:10, overflow:"hidden" }}>
          <div style={{
            padding:"10px 16px", background:"#eef1f6", borderBottom:"1px solid #d0dae8",
            fontSize:10, color:"#64748b", textTransform:"uppercase", letterSpacing:1.5,
            fontFamily:"'DM Mono',monospace",
          }}>
            Idaho rate catalog — {lineRates.length} codes
          </div>
          <div style={{ maxHeight:520, overflowY:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:"'DM Mono',monospace" }}>
              <thead style={{ position:"sticky", top:0, background:"#f7f9fc" }}>
                <tr style={{ borderBottom:"1px solid #d0dae8" }}>
                  <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10, color:"#94a3b8" }}>Code</th>
                  <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10, color:"#94a3b8" }}>Modifier</th>
                  <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10, color:"#94a3b8" }}>Tier</th>
                  <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10, color:"#94a3b8" }}>Description</th>
                  <th style={{ padding:"8px 12px", textAlign:"right", fontSize:10, color:"#94a3b8" }}>Unit</th>
                  <th style={{ padding:"8px 12px", textAlign:"right", fontSize:10, color:"#94a3b8" }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {lineRates.map((r, i) => (
                  <tr key={i} style={{ borderBottom:"1px solid #f1f5f9" }}>
                    <td style={{ padding:"7px 12px", fontWeight:600, color:"#0A3D47" }}>{r.code}</td>
                    <td style={{ padding:"7px 12px", color:"#64748b" }}>{r.modifier || "—"}</td>
                    <td style={{ padding:"7px 12px", color:"#64748b", fontSize:10 }}>{r.tier || ""}</td>
                    <td style={{ padding:"7px 12px", fontSize:11, color:"#475569" }}>{r.desc}</td>
                    <td style={{ padding:"7px 12px", textAlign:"right", fontSize:10, color:"#64748b" }}>{r.unit}</td>
                    <td style={{ padding:"7px 12px", textAlign:"right", color:"#D4A520", fontWeight:700 }}>
                      {r.rate == null ? "—" : `$${r.rate.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SUB-TAB DEFINITIONS PER ACTIVE SERVICE LINE
// ════════════════════════════════════════════════════════════════════
const SUB_TABS = {
  WHOLE_COMPANY: [
    { id: "company",   label: "🏢 Company P&L" },
    { id: "budget",    label: "💰 Budget Builder" },
    { id: "faq",       label: "❓ FAQ & Help" },
    { id: "portfolio", label: "📊 Portfolio" },
  ],
  RES_HAB_DAILY: [
    { id: "mixeditor", label: "🏠 Home Mix Editor" },
    { id: "labor",     label: "🏗 Labor Efficiency" },
    { id: "reshab_pl", label: "💵 P&L" },
  ],
  RES_HAB_HOURLY: [
    { id: "hourly",    label: "⏱ Hourly Services" },
    { id: "hourly_pl", label: "💵 P&L" },
  ],
  TSC: [
    { id: "tsc_coordinators", label: "👤 Coordinators" },
    { id: "tsc_participants", label: "👥 Participants" },
    { id: "tsc_productivity", label: "📈 Productivity" },
    { id: "tsc_pl",           label: "💵 P&L" },
    { id: "tsc_staffing",     label: "🏢 Staffing" },
    { id: "tsc_scenario",     label: "🔬 Scenario" },
  ],
  CHILDRENS_DDA: [
    { id: "chdda_roster",       label: "👥 Staff Roster" },
    { id: "chdda_participants", label: "🧑‍🤝‍🧑 Participants" },
    { id: "chdda_caseload",     label: "🗂 Caseload" },
    { id: "chdda_productivity", label: "📈 Productivity" },
    { id: "chdda_pl",           label: "💵 P&L" },
    { id: "chdda_rates",        label: "📋 Rate Schedule" },
  ],
  VOC_SERVICES: [
    { id: "cse_roster",       label: "👥 Specialists & Caseload" },
    { id: "cse_productivity", label: "📈 Productivity" },
    { id: "cse_pl",           label: "💵 P&L" },
    { id: "cse_rates",        label: "📋 Billing Codes" },
  ],
  SCHOOL_BASED: [
    { id: "school_roster",        label: "👥 Roster" },
    { id: "school_participants",  label: "🏫 Participants" },
    { id: "school_productivity",  label: "📈 Productivity" },
    { id: "school_pl",            label: "💵 P&L" },
    { id: "school_rates",         label: "📋 Rate Schedule" },
    { id: "school_staffing",      label: "🏢 Staffing" },
    { id: "school_scenario",      label: "🔬 Scenario" },
  ],
};

function getSubTabsFor(slType) {
  return SUB_TABS[slType] || [];
}

// Tab IDs that require canSeeCompanyDollars / canEditServiceLines — single source of truth
const DOLLAR_GATED_TABS  = new Set(['company', 'reshab_pl', 'hourly_pl', 'portfolio', 'tsc_pl', 'cse_pl', 'chdda_pl', 'school_pl']);
const SENIOR_GATED_TABS  = new Set(['tsc_scenario', 'school_scenario']);

function getDefaultSubTab(slType) {
  const tabs = getSubTabsFor(slType);
  return tabs[0]?.id || "placeholder";
}

// Returns sub-tabs in savedOrder sequence, falling back to defaults for any unknown ids.
function applyTabOrder(defaults, savedOrder) {
  if (!savedOrder || savedOrder.length === 0) return defaults;
  const map = Object.fromEntries(defaults.map(t => [t.id, t]));
  return savedOrder.map(id => map[id]).filter(Boolean);
}

// Compute a co-shaped P&L object for a single service line.
// revShare allocates company-level mgmt salaries & overhead proportionally.
function calcSLCo({ annualRevGrossRaw, annualLaborRaw, totalHomes, totalClients,
                    occupancy, mgmtFeePct, billingFeePct, entityType, ownerRate,
                    revShare, fullMgmtTotal, fullOverheadTotal }) {
  const annualRevGross    = annualRevGrossRaw;
  const annualRevNet      = annualRevGross * (occupancy / 100);
  const annualDirectLabor = annualLaborRaw  * (occupancy / 100);
  const payrollBurden     = annualDirectLabor * 0.22;
  const totalLabor        = annualDirectLabor + payrollBurden;
  const mgmtTotal         = fullMgmtTotal    * revShare;
  const overheadTotal     = fullOverheadTotal * revShare;
  const mgmtFee           = annualRevNet * (mgmtFeePct    / 100);
  const billingFee        = annualRevNet * (billingFeePct / 100);
  const totalCosts        = totalLabor + mgmtTotal + overheadTotal + mgmtFee + billingFee;
  const ebitda            = annualRevNet - totalCosts;
  const ebitdaMargin      = annualRevNet > 0 ? ebitda / annualRevNet : 0;
  const { stateTax, federalTax, totalTax, netIncome } = calcTax(ebitda, entityType, ownerRate);
  const netMargin         = annualRevNet > 0 ? netIncome / annualRevNet : 0;
  return { totalHomes, totalClients, annualRevGross, annualRevNet, annualDirectLabor,
           payrollBurden, totalLabor, mgmtTotal, overheadTotal, mgmtFee, billingFee,
           totalCosts, ebitda, ebitdaMargin, stateTax, federalTax, totalTax,
           netIncome, netMargin };
}

// ════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════
export default function App({ initialConfig, onSave, userRole, onSignOut, companyName: legacyCompanyName }) {
  const [config, setConfig] = useState(() => migrateConfig(initialConfig));
  const [saveStatus, setSaveStatus] = useState("idle");
  const [activeKey, setActiveKey] = useState("WHOLE_COMPANY"); // "WHOLE_COMPANY" | service line id
  const [subTab, setSubTab] = useState("company");

  const company = getSelectedCompany(config);
  const isWholeCompany = activeKey === "WHOLE_COMPANY";
  const activeSL = !isWholeCompany ? company?.serviceLines.find(sl => sl.id === activeKey) : null;
  const activeSLType = isWholeCompany ? "WHOLE_COMPANY" : activeSL?.type;

  // Reset subTab when active service line or role changes — skip tabs this role can't see
  useEffect(() => {
    const slType = activeKey === "WHOLE_COMPANY" ? "WHOLE_COMPANY" : activeSLType;
    const defaults = getSubTabsFor(slType);
    const first = defaults.find(t =>
      (!DOLLAR_GATED_TABS.has(t.id) || canSeeCompanyDollars(userRole)) &&
      (!SENIOR_GATED_TABS.has(t.id) || canEditServiceLines(userRole))
    );
    setSubTab(first?.id ?? 'placeholder');
    if (activeKey !== "WHOLE_COMPANY" && activeSLType) {
      posthog.capture('service_line_viewed', { service_line_type: activeSLType });
    }
  }, [activeKey, activeSLType, userRole]);

  // ── Update helpers ──
  const updateCompany = (coId, mutator) => setConfig(prev => ({
    ...prev,
    companies: prev.companies.map(co => co.id === coId ? mutator(co) : co),
  }));

  const updateShared = (field, value) => {
    if (!company) return;
    updateCompany(company.id, co => ({ ...co, shared: { ...co.shared, [field]: value } }));
  };

  const updateServiceLineConfig = (slId, mutator) => {
    if (!company) return;
    updateCompany(company.id, co => ({
      ...co,
      serviceLines: co.serviceLines.map(sl =>
        sl.id === slId
          ? { ...sl, config: typeof mutator === 'function' ? mutator(sl.config) : { ...sl.config, ...mutator } }
          : sl
      ),
    }));
  };

  // ── Service line tab drag-to-reorder ──
  const slDragState  = useRef({ dragId:null, startX:0, didMove:false, dragTabWidth:80, originalIndex:0 });
  const slTabRefs    = useRef(new Map());
  const slRafId      = useRef(null);
  const slInsertRef  = useRef(null);
  const [slDragId,         setSlDragId]         = useState(null);
  const [slInsertionIndex, setSlInsertionIndex] = useState(null);

  const handleSLPointerDown = (e, sl, index, currentVisibleSLs) => {
    setActiveKey(sl.id);  // activate immediately on press, like Chrome
    if (currentVisibleSLs.length <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = slTabRefs.current.get(sl.id)?.getBoundingClientRect();
    slDragState.current = { dragId:sl.id, startX:e.clientX, didMove:false, dragTabWidth:rect?.width ?? 80, originalIndex:index };
  };

  const handleSLPointerMove = (e, sl, currentVisibleSLs) => {
    const ds = slDragState.current;
    if (!ds.dragId) return;
    if (!ds.didMove) {
      if (Math.abs(e.clientX - ds.startX) < 5) return;
      ds.didMove = true;
      setSlDragId(ds.dragId);
      setSlInsertionIndex(ds.originalIndex);
    }
    const node = slTabRefs.current.get(ds.dragId);
    if (node) {
      node.style.transform  = `translateX(${e.clientX - ds.startX}px) translateY(-3px)`;
      node.style.zIndex     = "200";
      node.style.boxShadow  = "0 6px 20px rgba(0,0,0,0.22)";
      node.style.transition = "box-shadow 80ms";
    }
    if (slRafId.current) cancelAnimationFrame(slRafId.current);
    const clientX = e.clientX;
    slRafId.current = requestAnimationFrame(() => {
      let idx = 0;
      currentVisibleSLs.forEach((s, i) => {
        const r = slTabRefs.current.get(s.id)?.getBoundingClientRect();
        if (r && clientX > r.left + r.width / 2) idx = i + 1;
      });
      slInsertRef.current = idx;
      setSlInsertionIndex(idx);
    });
  };

  const handleSLPointerUp = (e, sl, currentVisibleSLs) => {
    const ds = slDragState.current;
    if (!ds.dragId) return;
    const node = slTabRefs.current.get(ds.dragId);
    if (node) { node.style.transform = ""; node.style.zIndex = ""; node.style.boxShadow = ""; node.style.transition = ""; }
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (ds.didMove) {
      const fromIdx = currentVisibleSLs.findIndex(s => s.id === ds.dragId);
      let toIdx = slInsertRef.current ?? fromIdx;
      if (toIdx > fromIdx) toIdx--;
      toIdx = Math.max(0, Math.min(toIdx, currentVisibleSLs.length - 1));
      if (fromIdx !== toIdx && company) {
        const reordered = [...currentVisibleSLs];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        const archived = company.serviceLines.filter(s => s.archived);
        updateCompany(company.id, co => ({ ...co, serviceLines: [...reordered, ...archived] }));
      }
    }
    slDragState.current = { dragId:null, startX:0, didMove:false, dragTabWidth:80, originalIndex:0 };
    setSlDragId(null);
    setSlInsertionIndex(null);
    slInsertRef.current = null;
  };

  // ── Sub-tab drag-to-reorder ──
  const stDragState  = useRef({ dragId:null, startX:0, didMove:false, dragTabWidth:80, originalIndex:0 });
  const stTabRefs    = useRef(new Map());
  const stRafId      = useRef(null);
  const stInsertRef  = useRef(null);
  const [stDragId,         setStDragId]         = useState(null);
  const [stInsertionIndex, setStInsertionIndex] = useState(null);

  const handleSTPointerDown = (e, tabId, index, currentSubTabs) => {
    setSubTab(tabId);  // activate immediately on press
    if (currentSubTabs.length <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stTabRefs.current.get(tabId)?.getBoundingClientRect();
    stDragState.current = { dragId:tabId, startX:e.clientX, didMove:false, dragTabWidth:rect?.width ?? 80, originalIndex:index };
  };

  const handleSTPointerMove = (e, tabId, currentSubTabs) => {
    const ds = stDragState.current;
    if (!ds.dragId) return;
    if (!ds.didMove) {
      if (Math.abs(e.clientX - ds.startX) < 5) return;
      ds.didMove = true;
      setStDragId(ds.dragId);
      setStInsertionIndex(ds.originalIndex);
    }
    const node = stTabRefs.current.get(ds.dragId);
    if (node) {
      node.style.transform  = `translateX(${e.clientX - ds.startX}px) translateY(-2px)`;
      node.style.zIndex     = "200";
      node.style.boxShadow  = "0 4px 14px rgba(0,0,0,0.18)";
      node.style.transition = "box-shadow 80ms";
    }
    if (stRafId.current) cancelAnimationFrame(stRafId.current);
    const clientX = e.clientX;
    stRafId.current = requestAnimationFrame(() => {
      let idx = 0;
      currentSubTabs.forEach((t, i) => {
        const r = stTabRefs.current.get(t.id)?.getBoundingClientRect();
        if (r && clientX > r.left + r.width / 2) idx = i + 1;
      });
      stInsertRef.current = idx;
      setStInsertionIndex(idx);
    });
  };

  const handleSTPointerUp = (e, tabId, currentSubTabs) => {
    const ds = stDragState.current;
    if (!ds.dragId) return;
    const node = stTabRefs.current.get(ds.dragId);
    if (node) { node.style.transform = ""; node.style.zIndex = ""; node.style.boxShadow = ""; node.style.transition = ""; }
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (ds.didMove) {
      const fromIdx = currentSubTabs.findIndex(t => t.id === ds.dragId);
      let toIdx = stInsertRef.current ?? fromIdx;
      if (toIdx > fromIdx) toIdx--;
      toIdx = Math.max(0, Math.min(toIdx, currentSubTabs.length - 1));
      if (fromIdx !== toIdx && company) {
        const reordered = [...currentSubTabs];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        const reorderedIds = reordered.map(t => t.id);
        if (isWholeCompany) {
          updateShared("wholeCompanySubTabOrder", reorderedIds);
        } else {
          updateCompany(company.id, co => ({
            ...co,
            serviceLines: co.serviceLines.map(sl =>
              sl.id === activeKey ? { ...sl, subTabOrder: reorderedIds } : sl
            ),
          }));
        }
      }
    }
    stDragState.current = { dragId:null, startX:0, didMove:false, dragTabWidth:80, originalIndex:0 };
    setStDragId(null);
    setStInsertionIndex(null);
    stInsertRef.current = null;
  };

  const handleAddServiceLine = (type) => {
    if (!company || !type) return;
    let newId = null;
    setConfig(prev => {
      const newSL = createServiceLine(type);
      newId = newSL.id;
      return {
        ...prev,
        companies: prev.companies.map(co =>
          co.id === company.id
            ? { ...co, serviceLines: [...co.serviceLines, newSL] }
            : co
        ),
      };
    });
    posthog.capture('service_line_added', { service_line_type: type });
    if (newId) setActiveKey(newId);
  };

  const handleRemoveServiceLine = (slId) => {
    if (!company) return;
    if (!window.confirm("Remove this service line? Its data will be lost.")) return;
    const removedSL = company.serviceLines.find(sl => sl.id === slId);
    updateCompany(company.id, co => ({
      ...co,
      serviceLines: co.serviceLines.filter(sl => sl.id !== slId),
    }));
    posthog.capture('service_line_removed', { service_line_type: removedSL?.type });
    if (activeKey === slId) setActiveKey("WHOLE_COMPANY");
  };

  // ── Service-line accessors ──
  const dailySL       = company?.serviceLines.find(sl => sl.type === SERVICE_LINE_TYPES.RES_HAB_DAILY   && !sl.archived);
  const hourlySL      = company?.serviceLines.find(sl => sl.type === SERVICE_LINE_TYPES.RES_HAB_HOURLY  && !sl.archived);
  const tscSL         = company?.serviceLines.find(sl => sl.type === SERVICE_LINE_TYPES.TSC             && !sl.archived);
  const childrensddaSL = company?.serviceLines.find(sl => sl.type === SERVICE_LINE_TYPES.CHILDRENS_DDA  && !sl.archived);
  const cseSL          = company?.serviceLines.find(sl => sl.type === SERVICE_LINE_TYPES.VOC_SERVICES   && !sl.archived);
  const schoolSL       = company?.serviceLines.find(sl => sl.type === SERVICE_LINE_TYPES.SCHOOL_BASED   && !sl.archived);

  const indHomes = [
    ...expandHomeTypes(dailySL?.config?.homes ?? []),
    ...(dailySL?.config?.indHomes ?? []),
  ];
  const hourlyPx = hourlySL?.config?.participants ?? [];

  // ── Shared (company-level) values ──
  const shared = company?.shared ?? createSharedConfig();
  const wage          = shared.wage          ?? 16;
  const graveyardWage = shared.graveyardWage ?? 9.5;
  const occupancy     = shared.occupancy     ?? 95;
  const entityType    = shared.entityType    ?? "ccorp";
  const ownerRate     = shared.ownerRate     ?? 32;
  const rates         = shared.rates         ?? RATES_DEF;
  const mgmt          = shared.mgmt          ?? [];
  const overhead      = shared.overhead      ?? [];
  const mgmtFeePct    = shared.mgmtFeePct    ?? 5;
  const billingFeePct = shared.billingFeePct ?? 1;

  // ── Adapter setters: map existing component prop signatures onto v2 shape ──
  const setWage          = v => updateShared("wage", v);
  const setGraveyardWage = v => updateShared("graveyardWage", v);
  const setOccupancy     = v => updateShared("occupancy", v);
  const setEntityType    = v => updateShared("entityType", v);
  const setOwnerRate     = v => updateShared("ownerRate", v);
  const setRates         = v => updateShared("rates", typeof v === 'function' ? v(rates) : v);
  const setMgmtFeePct    = v => updateShared("mgmtFeePct", v);
  const setBillingFeePct = v => updateShared("billingFeePct", v);

  const setMgmt = (updater) => updateShared("mgmt",
    typeof updater === 'function' ? updater(mgmt) : updater);
  const setOverhead = (updater) => updateShared("overhead",
    typeof updater === 'function' ? updater(overhead) : updater);

  // Service-line config setters that auto-create the SL if missing
  const ensureSLAndUpdate = (type, fieldName, updater) => {
    let sl = company?.serviceLines.find(s => s.type === type && !s.archived);
    if (!sl) {
      sl = createServiceLine(type);
      const slId = sl.id;
      setConfig(prev => ({
        ...prev,
        companies: prev.companies.map(co =>
          co.id === company.id
            ? { ...co, serviceLines: [...co.serviceLines, {
                ...sl,
                config: { ...sl.config, [fieldName]: typeof updater === 'function' ? updater(sl.config[fieldName] ?? []) : updater },
              }] }
            : co
        ),
      }));
      return slId;
    }
    updateServiceLineConfig(sl.id, cfg => ({
      ...cfg,
      [fieldName]: typeof updater === 'function' ? updater(cfg[fieldName] ?? []) : updater,
    }));
    return sl.id;
  };

  const setIndHomes = (updater) => {
    const sl = company?.serviceLines.find(s => s.type === SERVICE_LINE_TYPES.RES_HAB_DAILY && !s.archived);
    if (!sl) {
      // SL doesn't exist yet — create it with the initial value
      const initial = typeof updater === 'function' ? updater([]) : updater;
      ensureSLAndUpdate(SERVICE_LINE_TYPES.RES_HAB_DAILY, "indHomes", () => initial);
      return;
    }
    // Apply updater to the full render-time list (includes legacy config.homes expansion)
    const updated = typeof updater === 'function' ? updater(indHomes) : updater;
    updateServiceLineConfig(sl.id, cfg => ({
      ...cfg,
      indHomes: updated,
      ...(cfg.homes?.length ? { homes: [] } : {}),
    }));
  };
  const setHourlyPx  = (updater) => ensureSLAndUpdate(SERVICE_LINE_TYPES.RES_HAB_HOURLY, "participants", updater);

  // ── Computations ──
  const indHomeMetrics = useMemo(
    () => indHomes.map(h => ({ ...h, metrics: calcHome(h, wage, rates, graveyardWage) })),
    [indHomes, wage, rates, graveyardWage]
  );

  const hourlyTotals = useMemo(() => {
    const ms = hourlyPx.map(p => calcHourlyParticipant(p, rates, wage));
    return {
      annualRev:   ms.reduce((a, m) => a + m.annualRev, 0),
      annualLabor: ms.reduce((a, m) => a + m.annualLabor, 0),
      annualGross: ms.reduce((a, m) => a + m.gross, 0),
      count: hourlyPx.length,
    };
  }, [hourlyPx, rates, wage]);

  const tscSummary = useMemo(
    () => tscSL ? calcTSCService(tscSL.config) : { totalAnnualRev: 0, totalAnnualLabor: 0, coordinatorCount: 0, totalCaseload: 0 },
    [tscSL]
  );

  const childrensddaSummary = useMemo(
    () => childrensddaSL ? calcChildrensDDAService(childrensddaSL.config) : { totalAnnualRev: 0, totalAnnualLabor: 0, providerCount: 0, totalCaseload: 0 },
    [childrensddaSL]
  );

  const cseSummary = useMemo(
    () => cseSL ? calcCSEService(cseSL.config) : { totalAnnualRev: 0, totalAnnualLabor: 0, specialistCount: 0, totalCaseload: 0 },
    [cseSL]
  );

  const schoolSummary = useMemo(
    () => schoolSL ? calcSchoolBasedService(schoolSL.config) : { totalAnnualRev: 0, totalAnnualLabor: 0, clinicianCount: 0, totalCaseload: 0 },
    [schoolSL]
  );

  const co = useMemo(() => {
    const totalHomes   = indHomes.length;
    const totalClients = indHomes.reduce((a, h) => a + (h.nHigh || 0) + (h.nIntense || 0), 0);
    const dailyRev     = indHomeMetrics.reduce((a, h) => a + h.metrics.rev, 0);
    const dailyLabor   = indHomeMetrics.reduce((a, h) => a + h.metrics.labor, 0);
    const annualRevGross    = dailyRev * 365 + hourlyTotals.annualRev + tscSummary.totalAnnualRev + childrensddaSummary.totalAnnualRev + cseSummary.totalAnnualRev + schoolSummary.totalAnnualRev;
    const annualRevNet      = annualRevGross * (occupancy / 100);
    const annualDirectLabor = (dailyLabor * 365 + hourlyTotals.annualLabor + tscSummary.totalAnnualLabor + childrensddaSummary.totalAnnualLabor + cseSummary.totalAnnualLabor + (schoolSummary.totalAnnualLaborRaw ?? 0)) * (occupancy / 100);
    const payrollBurden     = annualDirectLabor * 0.22;
    const totalLabor        = annualDirectLabor + payrollBurden;
    const mgmtTotal         = mgmt.reduce((a, m) => a + (m.salary || 0), 0) * 1.22;
    const overheadTotal     = overhead.reduce((a, o) => a + (o.amount || 0), 0);
    const mgmtFee           = annualRevNet * (mgmtFeePct / 100);
    const billingFee        = annualRevNet * (billingFeePct / 100);
    const totalCosts        = totalLabor + mgmtTotal + overheadTotal + mgmtFee + billingFee;
    const ebitda            = annualRevNet - totalCosts;
    const ebitdaMargin      = annualRevNet > 0 ? ebitda / annualRevNet : 0;
    const { stateTax, federalTax, totalTax, netIncome } = calcTax(ebitda, entityType, ownerRate);
    const netMargin         = annualRevNet > 0 ? netIncome / annualRevNet : 0;
    const occFactor = occupancy / 100;
    const slBreakdown = [
      ...(dailyRev > 0 ? [{
        id: 'daily', label: 'Res. Hab. Daily (24hr)',
        rev:   dailyRev * 365,
        labor: dailyLabor * 365 * occFactor,
        detail: `${totalHomes} homes · ${totalClients} clients`,
      }] : []),
      ...(hourlyTotals.annualRev > 0 ? [{
        id: 'hourly', label: 'Res. Hab. Hourly',
        rev:   hourlyTotals.annualRev,
        labor: hourlyTotals.annualLabor * occFactor,
        detail: `${hourlyTotals.count} clients`,
      }] : []),
      ...(tscSummary.totalAnnualRev > 0 ? [{
        id: 'tsc', label: 'TSC (Coordination)',
        rev:   tscSummary.totalAnnualRev,
        labor: tscSummary.totalAnnualLabor * occFactor,
        detail: `${tscSummary.coordinatorCount} coords · ${tscSummary.totalCaseload} clients`,
      }] : []),
      ...((schoolSummary.totalAnnualRev > 0 || (schoolSummary.totalAnnualLaborRaw ?? 0) > 0) ? [{
        id: 'school', label: 'School-Based Services',
        rev:   schoolSummary.totalAnnualRev,
        labor: schoolSummary.totalAnnualLabor * occFactor,
        detail: `${schoolSummary.clinicianCount} clinicians · ${schoolSummary.totalCaseload} students`,
      }] : []),
    ];
    return {
      totalHomes, totalClients,
      annualRevGross, annualRevNet, annualDirectLabor, payrollBurden, totalLabor,
      mgmtTotal, overheadTotal, mgmtFee, billingFee, totalCosts,
      ebitda, ebitdaMargin, stateTax, federalTax, totalTax, netIncome, netMargin,
      slBreakdown,
    };
  }, [indHomeMetrics, indHomes, occupancy, mgmt, overhead, entityType, ownerRate, rates, mgmtFeePct, billingFeePct, hourlyTotals, tscSummary, childrensddaSummary, cseSummary, schoolSummary]);

  // Hourly handlers
  const updateHourly = (id, f, v) => setHourlyPx(p => p.map(h => h.id === id ? { ...h, [f]: v } : h));
  const addHourly    = ()         => setHourlyPx(p => [...p, mkHourly(`Client ${p.length + 1}`)]);
  const removeHourly = id         => setHourlyPx(p => p.filter(h => h.id !== id));

  // Save (Track A: hand the v2 blob to onSave verbatim; Track B handles the schema split)
  const handleSave = async () => {
    if (!onSave) return;
    setSaveStatus("saving");
    const ok = await onSave(config);
    setSaveStatus(ok ? "saved" : "error");
    posthog.capture('model_saved', {
      success: ok,
      company_count: config.companies?.length ?? 0,
      service_line_count: company?.serviceLines?.filter(sl => !sl.archived).length ?? 0,
    });
    setTimeout(() => setSaveStatus("idle"), 2500);
  };

  // ── Empty-portfolio fallback (shouldn't happen under Model 1 but graceful if it does) ──
  if (!company) {
    return (
      <div style={{ padding:60, textAlign:"center", fontFamily:"'Sora',sans-serif" }}>
        <h2 style={{ color:"#0A3D47", fontSize:18, marginBottom:8 }}>No companies assigned</h2>
        <p style={{ color:"#64748b", fontSize:13 }}>You haven't been assigned access to any companies yet.<br/>Contact your Intrinsic administrator.</p>
      </div>
    );
  }

  // ── Service line strip data ──
  const visibleSLs = company.serviceLines.filter(sl => !sl.archived);
  const subTabs = (isWholeCompany
    ? applyTabOrder(getSubTabsFor("WHOLE_COMPANY"), company.shared.wholeCompanySubTabOrder)
    : applyTabOrder(getSubTabsFor(activeSLType), activeSL?.subTabOrder)
  ).filter(t =>
    (!DOLLAR_GATED_TABS.has(t.id) || canSeeCompanyDollars(userRole)) &&
    (!SENIOR_GATED_TABS.has(t.id) || canEditServiceLines(userRole))
  );

  return (
    <>
      <div style={{ fontFamily:"'Sora',sans-serif", background:"#f5f7fa", color:"#e4eaf2", minHeight:"100vh", display:"flex", flexDirection:"column" }}>

        {/* ── Header ── */}
        <div style={{ padding:"0 24px 0", borderBottom:"1px solid #c8d4e4", background:"linear-gradient(160deg,#e8f0fa,#f5f7fa)", flexShrink:0 }}>
          <div style={{ height:2, background:"linear-gradient(90deg,#D4A520,#0A526080,transparent)", marginBottom:0, marginLeft:-24, marginRight:-24 }}/>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, paddingTop:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <img src={LOGO} alt="Intrinsic Inc" style={{ height:52, width:"auto", objectFit:"contain", filter:"drop-shadow(0 2px 12px #D4A52035)" }}/>
              <div style={{ borderLeft:"1px solid #c8d4e4", paddingLeft:14 }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:"#0E6B78", letterSpacing:2.5, marginBottom:3 }}>Financial Model Builder</div>
                <div style={{ fontSize:9, color:"#64748b", letterSpacing:2, textTransform:"uppercase", ...M, lineHeight:1.5 }}>
                  {legacyCompanyName ? legacyCompanyName + " · " : ""}Idaho HCBS Operations
                </div>
              </div>

              {/* Company picker — Model 1: read-only list of assigned companies, no add */}
              {config.companies.filter(c => !c.archived).length > 1 && (
                <div style={{ borderLeft:"1px solid #c8d4e4", paddingLeft:14, display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:8, color:"#94a3b8", letterSpacing:2, textTransform:"uppercase", ...M, fontFamily:"'DM Mono',monospace" }}>Company</span>
                  <select value={config.selectedCompanyId || ""}
                    onChange={(e) => setConfig(prev => ({ ...prev, selectedCompanyId: e.target.value }))}
                    style={{
                      padding:"3px 8px", borderRadius:5, border:"1px solid #c8d4e4",
                      background:"#fff", fontSize:12, fontWeight:700, color:"#0A3D47",
                      fontFamily:"'Sora',sans-serif", minWidth:180,
                    }}>
                    {config.companies.filter(c => !c.archived).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              {canSeeTopNumbers(userRole) && [
                { l:"24hr Clients",   v:co.totalClients,           c:"#0E6B78" },
                { l:"Hourly Clients", v:hourlyTotals.count,        c:"#0A5260" },
                { l:"TSC Caseload",   v:tscSummary.totalCaseload,  c:"#0A5260" },
                canSeeCompanyDollars(userRole)
                  ? { l:"EBITDA",     v:$k(co.ebitda),             c:mc(Math.max(0, co.ebitdaMargin)) }
                  : { l:"EBITDA Mgn", v:pct(co.ebitdaMargin),      c:mc(Math.max(0, co.ebitdaMargin)) },
                canSeeCompanyDollars(userRole)
                  ? { l:"Net "+(entityType === "ccorp" ? "Income" : "Est."), v:$k(co.netIncome), c:nmc(Math.max(0, co.netMargin)) }
                  : { l:"Net Margin", v:pct(co.netMargin),          c:nmc(Math.max(0, co.netMargin)) },
              ].map(s => (
                <div key={s.l} style={{
                  background:"#fff", borderRadius:8, padding:"6px 13px 6px 11px",
                  border:"1px solid #d0dae8", borderLeft:`3px solid ${s.c}`,
                  boxShadow:"0 1px 3px rgba(13,26,42,0.06)",
                  display:"flex", flexDirection:"column", gap:1,
                }}>
                  <span style={{ fontSize:8, color:"#94a3b8", ...M, textTransform:"uppercase", letterSpacing:1.2, lineHeight:1.2 }}>{s.l}</span>
                  <span style={{ fontWeight:800, color:s.c, ...M, fontSize:15, lineHeight:1.2 }}>{s.v}</span>
                </div>
              ))}
              {onSave && canEditServiceLines(userRole) && (
                <button onClick={handleSave} disabled={saveStatus === "saving"} style={{
                  padding:"7px 18px", borderRadius:8, border:"none", cursor:"pointer",
                  fontWeight:700, fontSize:11, fontFamily:"'Sora',sans-serif",
                  letterSpacing:0.5, transition:"background 0.2s, box-shadow 0.2s, transform 0.1s",
                  background: saveStatus === "saved" ? "#0f4a1a" : saveStatus === "error" ? "#4a1010" : saveStatus === "saving" ? "#c8b87a" : "#0E6B78",
                  color: saveStatus === "saved" ? "#7defa8" : saveStatus === "error" ? "#fca5a5" : saveStatus === "saving" ? "#0A2C35" : "#fff",
                  boxShadow: saveStatus === "idle" ? "0 2px 8px rgba(212,165,32,0.30)" : "none",
                }}>
                  {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "✓ Saved" : saveStatus === "error" ? "✗ Error" : "Save"}
                </button>
              )}
              {onSignOut && (
                <button onClick={onSignOut} style={{
                  padding:"7px 14px", borderRadius:8, cursor:"pointer",
                  fontWeight:700, fontSize:11, fontFamily:"'Sora',sans-serif",
                  letterSpacing:0.5, border:"1px solid #c8d4e4",
                  background:"#fff", color:"#5a7498",
                }}>Sign Out</button>
              )}
            </div>
          </div>

          {/* ── Service line tab strip ── */}
          <div style={{ display:"flex", marginTop:12, alignItems:"flex-end", gap:0 }}>
            {/* Double-wrapper: outer constrains width, inner scrolls */}
            <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
              <div style={{ display:"flex", gap:2, alignItems:"flex-end", overflowX:"auto", scrollbarWidth:"none" }}>
                {/* Whole Company — pinned, no drag */}
                <ServiceLineTab label="🏢 Whole Company" active={isWholeCompany}
                  onPointerDown={() => setActiveKey("WHOLE_COMPANY")} />
                {/* Draggable service line tabs */}
                {(() => {
                  const items = [];
                  visibleSLs.forEach((sl, i) => {
                    if (slDragId && slInsertionIndex === i) {
                      items.push(<GapIndicator key="__sl_gap__" width={slDragState.current.dragTabWidth} />);
                    }
                    items.push(
                      <ServiceLineTab key={sl.id}
                        label={sl.name || getShortLabel(sl.type)}
                        active={activeKey === sl.id}
                        onRemove={() => handleRemoveServiceLine(sl.id)}
                        containerRef={node => { if (node) slTabRefs.current.set(sl.id, node); else slTabRefs.current.delete(sl.id); }}
                        isDragging={slDragId === sl.id}
                        onPointerDown={e => handleSLPointerDown(e, sl, i, visibleSLs)}
                        onPointerMove={e => handleSLPointerMove(e, sl, visibleSLs)}
                        onPointerUp={e => handleSLPointerUp(e, sl, visibleSLs)}
                      />
                    );
                  });
                  if (slDragId && slInsertionIndex === visibleSLs.length) {
                    items.push(<GapIndicator key="__sl_gap__" width={slDragState.current.dragTabWidth} />);
                  }
                  return items;
                })()}
              </div>
            </div>
            {/* Add button — outside scroll so its dropdown isn't clipped */}
            {canAddServiceLine(userRole) && (
              <div style={{ flexShrink:0, alignSelf:"flex-end", position:"relative", zIndex:200, paddingBottom:2, marginLeft:6 }}>
                <AddServiceLineButton
                  existingTypes={visibleSLs.map(sl => sl.type)}
                  onAdd={handleAddServiceLine}/>
              </div>
            )}
            <div style={{ paddingBottom:8, display:"flex", alignItems:"center", gap:8, flexShrink:0, marginLeft:8 }}>
              <div style={{ width:1, height:14, background:"#d0dae8" }}/>
              <span style={{ fontSize:8, color:"#b5c8de", letterSpacing:2, textTransform:"uppercase", ...M }}>
                Powered by <span style={{ color:"#D4A52090", letterSpacing:2 }}>Intrinsic Inc</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Body: sidebar + content ── */}
        <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", flex:1, minHeight:0 }}>
          <Sidebar
            entityType={entityType} setEntityType={setEntityType} ownerRate={ownerRate} setOwnerRate={setOwnerRate}
            mgmtFeePct={mgmtFeePct} setMgmtFeePct={setMgmtFeePct}
            billingFeePct={billingFeePct} setBillingFeePct={setBillingFeePct}
            userRole={userRole}/>

          <div style={{ display:"flex", flexDirection:"column", overflow:"hidden", background:"#f5f7fa" }}>
            {/* ── Sub-tab strip ── */}
            {subTabs.length > 0 && (
              <div style={{
                padding:"4px 24px 0", background:"#f5f7fa",
                display:"flex", gap:0, alignItems:"flex-end",
                borderBottom:"1px solid #e2e8f0", flexShrink:0,
                overflowX:"auto", scrollbarWidth:"none",
              }}>
                {(() => {
                  const items = [];
                  subTabs.forEach((t, i) => {
                    if (stDragId && stInsertionIndex === i) {
                      items.push(<GapIndicator key="__st_gap__" width={stDragState.current.dragTabWidth} />);
                    }
                    const isDraggingThis = stDragId === t.id;
                    items.push(
                      <div
                        key={t.id}
                        ref={node => { if (node) stTabRefs.current.set(t.id, node); else stTabRefs.current.delete(t.id); }}
                        onPointerDown={e => handleSTPointerDown(e, t.id, i, subTabs)}
                        onPointerMove={e => handleSTPointerMove(e, t.id, subTabs)}
                        onPointerUp={e => handleSTPointerUp(e, t.id, subTabs)}
                        style={{
                          display:"inline-flex", alignItems:"stretch",
                          cursor: "pointer", flexShrink:0,
                          userSelect:"none", touchAction:"none",
                          opacity: isDraggingThis ? 0.45 : 1,
                          transition:"opacity 80ms",
                        }}
                      >
                        <button style={{
                          padding:"7px 16px", border: "none",
                          cursor:"inherit", pointerEvents:"none",
                          fontSize:11, fontWeight:600, whiteSpace:"nowrap",
                          background: "transparent",
                          color:      subTab === t.id ? "#0A3D47" : "#94a3b8",
                          boxShadow:  subTab === t.id ? "inset 0 -2px 0 #0E6B78" : "inset 0 -2px 0 transparent",
                          transition: "color 0.15s, box-shadow 0.15s",
                        }}>{t.label}</button>
                      </div>
                    );
                  });
                  if (stDragId && stInsertionIndex === subTabs.length) {
                    items.push(<GapIndicator key="__st_gap__" width={stDragState.current.dragTabWidth} />);
                  }
                  return items;
                })()}
              </div>
            )}

            {/* ── Content ── */}
            <div style={{ padding:"20px 24px", overflowY:"auto", flex:1 }}>

              {/* WHOLE COMPANY tabs */}
              {isWholeCompany && subTab === "company" && canSeeCompanyDollars(userRole) && (
                <CompanyTab co={co} mgmt={mgmt} overhead={overhead}
                  onMgmt={(id, v) => setMgmt(p => p.map(m => m.id === id ? { ...m, salary: v } : m))}
                  onOvhd={(id, v) => setOverhead(p => p.map(o => o.id === id ? { ...o, amount: v } : o))}
                  entityType={entityType} ownerRate={ownerRate}
                  mgmtFeePct={mgmtFeePct} billingFeePct={billingFeePct}
                  hourlyCount={hourlyTotals.count} tscCaseload={tscSummary.totalCaseload}
                  slBreakdown={co.slBreakdown} userRole={userRole}/>
              )}
              {isWholeCompany && subTab === "budget"    && <BudgetBuilderTab co={co} hourlyTotals={hourlyTotals} wage={wage} userRole={userRole}/>}
              {isWholeCompany && subTab === "faq"       && <FAQTab userRole={userRole}/>}
              {isWholeCompany && subTab === "portfolio" && canSeeCompanyDollars(userRole) && <PortfolioComparison userRole={userRole}/>}

              {/* RES_HAB_DAILY tabs */}
              {activeSLType === SERVICE_LINE_TYPES.RES_HAB_DAILY && subTab === "mixeditor" && (
                <HomeMixEditor homes={indHomes}
                  onUpdate={(id, f, v) => setIndHomes(p => p.map(h => h.id === id ? { ...h, [f]: v } : h))}
                  onAdd={() => setIndHomes(p => [...p, mkHome(`Home ${p.length + 1}`, 2, 1, 12, "normal")])}
                  onRemove={id => setIndHomes(p => p.filter(h => h.id !== id))}
                  wage={wage} setWage={setWage}
                  rates={rates} setRates={setRates}
                  graveyardWage={graveyardWage} setGraveyardWage={setGraveyardWage}
                  occupancy={occupancy} setOccupancy={setOccupancy}
                  canEdit={canEditServiceLines(userRole)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.RES_HAB_DAILY && subTab === "labor" &&
                <LaborEfficiencyTab wage={wage} rates={rates} graveyardWage={graveyardWage} userRole={userRole}/>}
              {activeSLType === SERVICE_LINE_TYPES.RES_HAB_DAILY && subTab === "reshab_pl" && canSeeCompanyDollars(userRole) && (() => {
                const rawRev    = indHomeMetrics.reduce((a,h) => a + h.metrics.rev, 0) * 365;
                const rawLabor  = indHomeMetrics.reduce((a,h) => a + h.metrics.labor, 0) * 365;
                const slHomes   = indHomes.length;
                const slClients = indHomes.reduce((a,h) => a + (h.nHigh||0) + (h.nIntense||0), 0);
                const revShare  = co.annualRevGross > 0 ? rawRev / co.annualRevGross : 1;
                const slCo = calcSLCo({ annualRevGrossRaw:rawRev, annualLaborRaw:rawLabor,
                  totalHomes:slHomes, totalClients:slClients, occupancy, mgmtFeePct, billingFeePct,
                  entityType, ownerRate, revShare, fullMgmtTotal:co.mgmtTotal, fullOverheadTotal:co.overheadTotal });
                return <CompanyPL co={slCo} mgmt={mgmt} overhead={overhead}
                  onMgmt={(id,v)=>setMgmt(p=>p.map(m=>m.id===id?{...m,salary:v}:m))}
                  onOvhd={(id,v)=>setOverhead(p=>p.map(o=>o.id===id?{...o,amount:v}:o))}
                  entityType={entityType} ownerRate={ownerRate}
                  mgmtFeePct={mgmtFeePct} billingFeePct={billingFeePct}
                  title="Annual P&L — Res. Hab. Daily (24hr)" userRole={userRole}/>;
              })()}

              {/* RES_HAB_HOURLY tabs */}
              {activeSLType === SERVICE_LINE_TYPES.RES_HAB_HOURLY && subTab === "hourly" && (
                <HourlyTab participants={hourlyPx} onUpdate={updateHourly}
                  onAdd={addHourly} onRemove={removeHourly}
                  wage={wage} rates={rates} setRates={setRates} userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.RES_HAB_HOURLY && subTab === "hourly_pl" && canSeeCompanyDollars(userRole) && (() => {
                const revShare = co.annualRevGross > 0 ? hourlyTotals.annualRev / co.annualRevGross : 1;
                const slCo = calcSLCo({ annualRevGrossRaw:hourlyTotals.annualRev,
                  annualLaborRaw:hourlyTotals.annualLabor, totalHomes:0,
                  totalClients:hourlyPx.length, occupancy, mgmtFeePct, billingFeePct,
                  entityType, ownerRate, revShare, fullMgmtTotal:co.mgmtTotal, fullOverheadTotal:co.overheadTotal });
                return <CompanyPL co={slCo} mgmt={mgmt} overhead={overhead}
                  onMgmt={(id,v)=>setMgmt(p=>p.map(m=>m.id===id?{...m,salary:v}:m))}
                  onOvhd={(id,v)=>setOverhead(p=>p.map(o=>o.id===id?{...o,amount:v}:o))}
                  entityType={entityType} ownerRate={ownerRate}
                  mgmtFeePct={mgmtFeePct} billingFeePct={billingFeePct}
                  title="Annual P&L — Res. Hab. Hourly" userRole={userRole}/>;
              })()}

              {/* TSC tabs */}
              {activeSLType === SERVICE_LINE_TYPES.TSC && activeSL && subTab === "tsc_coordinators" && (
                <TSCCoordinatorsTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.TSC && activeSL && subTab === "tsc_participants" && (
                <TSCParticipantsTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.TSC && activeSL && subTab === "tsc_productivity" &&
                <TSCProductivityTab config={activeSL.config} userRole={userRole}/>}
              {activeSLType === SERVICE_LINE_TYPES.TSC && activeSL && subTab === "tsc_staffing" && (
                <TSCStaffingTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.TSC && activeSL && subTab === "tsc_scenario" && canEditServiceLines(userRole) && (
                <TSCScenarioTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}

              {/* CHILDRENS_DDA tabs */}
              {activeSLType === SERVICE_LINE_TYPES.CHILDRENS_DDA && activeSL && subTab === "chdda_roster" && (
                <ChildrensDDARosterTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.CHILDRENS_DDA && activeSL && subTab === "chdda_participants" && (
                <ChildrensDDAParticipantsTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.CHILDRENS_DDA && activeSL && subTab === "chdda_caseload" && (
                <ChildrensDDACaseloadTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.CHILDRENS_DDA && activeSL && subTab === "chdda_productivity" &&
                <ChildrensDDAProductivityTab config={activeSL.config} userRole={userRole}/>}
              {activeSLType === SERVICE_LINE_TYPES.CHILDRENS_DDA && activeSL && subTab === "chdda_pl" && canSeeCompanyDollars(userRole) &&
                <ChildrensDDAPLTab config={activeSL.config} userRole={userRole}/>}
              {activeSLType === SERVICE_LINE_TYPES.CHILDRENS_DDA && activeSL && subTab === "chdda_rates" && (
                <ChildrensDDARateScheduleTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}

              {/* VOC_SERVICES / CSE tabs */}
              {activeSLType === SERVICE_LINE_TYPES.VOC_SERVICES && activeSL && subTab === "cse_roster" && (
                <CSERosterTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.VOC_SERVICES && activeSL && subTab === "cse_productivity" &&
                <CSEProductivityTab config={activeSL.config} userRole={userRole}/>}
              {activeSLType === SERVICE_LINE_TYPES.VOC_SERVICES && activeSL && subTab === "cse_pl" && canSeeCompanyDollars(userRole) &&
                <CSEPLTab config={activeSL.config} userRole={userRole}/>}
              {activeSLType === SERVICE_LINE_TYPES.VOC_SERVICES && activeSL && subTab === "cse_rates" && (
                <CSERateScheduleTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.TSC && activeSL && subTab === "tsc_pl" && canSeeCompanyDollars(userRole) && (() => {
                const revShare = co.annualRevGross > 0 ? tscSummary.totalAnnualRev / co.annualRevGross : 1;
                const slCo = calcSLCo({ annualRevGrossRaw:tscSummary.totalAnnualRev,
                  annualLaborRaw:tscSummary.totalAnnualLabor, totalHomes:0,
                  totalClients:tscSummary.totalCaseload, occupancy, mgmtFeePct, billingFeePct,
                  entityType, ownerRate, revShare, fullMgmtTotal:co.mgmtTotal, fullOverheadTotal:co.overheadTotal });
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <CompanyPL co={slCo} mgmt={mgmt} overhead={overhead}
                      onMgmt={(id,v)=>setMgmt(p=>p.map(m=>m.id===id?{...m,salary:v}:m))}
                      onOvhd={(id,v)=>setOverhead(p=>p.map(o=>o.id===id?{...o,amount:v}:o))}
                      entityType={entityType} ownerRate={ownerRate}
                      mgmtFeePct={mgmtFeePct} billingFeePct={billingFeePct}
                      title="Annual P&L — TSC (Coordination)" userRole={userRole}/>
                    <TSCPLTab config={activeSL.config} userRole={userRole}/>
                  </div>
                );
              })()}

              {/* SCHOOL_BASED tabs */}
              {activeSLType === SERVICE_LINE_TYPES.SCHOOL_BASED && activeSL && subTab === "school_roster" && (
                <SchoolBasedRosterTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.SCHOOL_BASED && activeSL && subTab === "school_productivity" &&
                <SchoolBasedProductivityTab config={activeSL.config} userRole={userRole}/>}
              {activeSLType === SERVICE_LINE_TYPES.SCHOOL_BASED && activeSL && subTab === "school_rates" && (
                <SchoolBasedRateScheduleTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.SCHOOL_BASED && activeSL && subTab === "school_staffing" && (
                <SchoolBasedStaffingTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.SCHOOL_BASED && activeSL && subTab === "school_participants" && (
                <SchoolBasedParticipantsTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.SCHOOL_BASED && activeSL && subTab === "school_scenario" && canEditServiceLines(userRole) && (
                <SchoolBasedScenarioTab config={activeSL.config}
                  onUpdate={cfg => updateServiceLineConfig(activeSL.id, cfg)}
                  userRole={userRole}/>
              )}
              {activeSLType === SERVICE_LINE_TYPES.SCHOOL_BASED && activeSL && subTab === "school_pl" && canSeeCompanyDollars(userRole) && (() => {
                const revShare = co.annualRevGross > 0 ? schoolSummary.totalAnnualRev / co.annualRevGross : 1;
                const slCo = calcSLCo({ annualRevGrossRaw:schoolSummary.totalAnnualRev,
                  annualLaborRaw:schoolSummary.totalAnnualLaborRaw ?? 0, totalHomes:0,
                  totalClients:schoolSummary.totalCaseload, occupancy, mgmtFeePct, billingFeePct,
                  entityType, ownerRate, revShare, fullMgmtTotal:co.mgmtTotal, fullOverheadTotal:co.overheadTotal });
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <CompanyPL co={slCo} mgmt={mgmt} overhead={overhead}
                      onMgmt={(id,v)=>setMgmt(p=>p.map(m=>m.id===id?{...m,salary:v}:m))}
                      onOvhd={(id,v)=>setOverhead(p=>p.map(o=>o.id===id?{...o,amount:v}:o))}
                      entityType={entityType} ownerRate={ownerRate}
                      mgmtFeePct={mgmtFeePct} billingFeePct={billingFeePct}
                      title="Annual P&L — School-Based Services" userRole={userRole}/>
                    <SchoolBasedPLTab config={activeSL.config} userRole={userRole}/>
                  </div>
                );
              })()}

              {/* Catalog placeholder for service lines without dedicated UI */}
              {activeSL && !SUB_TABS[activeSLType] && (
                <CatalogPlaceholder type={activeSLType}/>
              )}

              <div style={{ height:30 }}/>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
