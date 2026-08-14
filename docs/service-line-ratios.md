# Service-Line Ratio Reference

A single reference for every **ratio** used in Intrinsic's financial-modeling calculators —
staffing ratios, productivity/realization percentages, occupancy, fee percentages, allocation
methods, tax rates, derived margins, and the implicit unit-conversion constants.

## Scope & conventions

- **Covers the six implemented-calculator service lines only:** `RES_HAB_DAILY`,
  `RES_HAB_HOURLY`, `TSC`, `CHILDRENS_DDA`, `VOC_SERVICES` (CSE), `SCHOOL_BASED`. The other 19
  registered types are `catalog` status (rate data only, no ratio-driven calculator) and are
  intentionally excluded.
- **Values are documented as-is at their source location** — not reconciled. Where the same
  concept appears in more than one place, both are cited (see the [Cross-source discrepancies](#cross-source-discrepancies)
  appendix). No value has been changed.
- All rates are **post-9/1/2025** (4% reduction already applied); BH rates would be Magellan
  IBHP eff. 4/13/2026 (not in scope here).
- Line numbers reflect the source at the time of writing — see the
  [Maintenance](#maintenance) note for the files to re-check when ratios change.
- **Input ratio** = a configurable/default field. **Derived ratio** = computed at calc time.

---

## 1. Company-wide shared ratios

These live in `createSharedConfig()` and apply to **every** service line in a company.
Source: [companyShape.js:87](../src/lib/companyShape.js).

| Ratio / field | Default | Meaning | Source |
|---|---|---|---|
| `wage` | `16` ($/hr) | Primary direct-care hourly wage | companyShape.js:90 |
| `graveyardWage` | `9.5` ($/hr) | Overnight / sleep-shift wage (Res Hab) | companyShape.js:91 |
| `occupancy` | `95` (%) | Company-wide occupancy / utilization; scales both gross revenue and direct labor | companyShape.js:92 |
| `entityType` | `'ccorp'` | Tax entity (`ccorp` \| `scorp` \| `llc` \| `partnership` \| `soleprop`) | companyShape.js:95 |
| `ownerRate` | `32` (%) | Owner blended tax bracket (pass-through / S-corp net-income calc) | companyShape.js:96 |
| `mgmtFeePct` | `5` (%) | Management fee as % of net revenue | companyShape.js:99 |
| `billingFeePct` | `1` (%) | Billing fee as % of net revenue | companyShape.js:100 |
| `allocationMethod` | `'revenue'` | Cross-service-line overhead allocation (`revenue` \| `headcount` \| `manual`) | companyShape.js:116 |
| `sharedOverhead.fixedAnnual` | `0` ($) | Fixed annual overhead pool to allocate | companyShape.js:111 |
| `sharedOverhead.perHomePerMonth` | `0` ($) | Overhead per residential home / month | companyShape.js:112 |
| `sharedOverhead.perParticipantPerMonth` | `0` ($) | Overhead per participant / month | companyShape.js:113 |
| `sharedOverhead.perCoordinatorPerMonth` | `0` ($) | Overhead per coordinator / month | companyShape.js:114 |

The default Res Hab rate set (overridable per company) lives alongside:
`DEFAULT_RES_HAB_RATES = { intenseDaily: 678.77, highDaily: 368.67, iuUnit: 7.07, igUnit: 3.61 }`
— [companyShape.js:66](../src/lib/companyShape.js).

---

## 2. Company-level financial ratios & thresholds

Computed in the company P&L (`calcSLCo`) and the home-approval helpers in
[FinancialTool.jsx](../src/pages/FinancialTool.jsx).

| Ratio | Value / formula | Meaning | Source |
|---|---|---|---|
| Payroll burden (Res Hab) | `× 0.22` (hardcoded) | Employer burden on direct labor — **not configurable** for Res Hab | FinancialTool.jsx:2461, 2850 |
| Idaho state corporate tax | `ebitda × 0.058` | 5.8% state tax (C-corp path) | FinancialTool.jsx:38, 44 |
| Federal corporate tax | `(ebitda − stateTax) × 0.21` | 21% federal (C-corp); pass-through uses `ownerRate − 5.8%` | FinancialTool.jsx:39, 45 |
| `ebitdaMargin` | `ebitda / annualRevNet` | EBITDA as % of net revenue | FinancialTool.jsx:2469, 2858 |
| `netMargin` | `netIncome / annualRevNet` | Net income as % of net revenue | FinancialTool.jsx:2471 |
| `revShare` | proportional to SL net revenue | Allocates company mgmt salaries & overhead across service lines | FinancialTool.jsx:2454–2464 |
| `mgmtFee` | `annualRevNet × mgmtFeePct/100` | Management fee (uses shared `mgmtFeePct`) | calcSLCo |
| `billingFee` | `annualRevNet × billingFeePct/100` | Billing fee (uses shared `billingFeePct`) | calcSLCo |

**Home gross-margin approval bands** — `APPROVAL_THRESHOLDS` ([FinancialTool.jsx:470](../src/pages/FinancialTool.jsx)):

| Band | Rule | Label |
|---|---|---|
| `approved` | gross margin ≥ `0.45` | Approved |
| `marginal` | `0.30` ≤ margin < `0.45` | Needs Review |
| (below) | margin < `0.30` | Not Viable |

**Labor-ratio approval bands** — `LABOR_APPROVAL_THRESHOLDS` ([FinancialTool.jsx:485](../src/pages/FinancialTool.jsx)):

| Band | Rule | Label |
|---|---|---|
| `approved` | labor ratio < `0.47` | Approved |
| `marginal` | `0.47`–`0.58` | Needs Review |
| `concerning` | `0.58`–`0.68` | Concerning |
| (above) | > `0.68` | Not Viable |

> Per-coordinator/provider cards also use lighter "color band" thresholds for at-a-glance
> status (e.g. TSC: margin > 0.40 green / > 0.20 amber, utilization > 0.85 green; DDA/CSE/School:
> margin > 0.35 green / > 0.15 amber). These are display cues, not approval gates —
> see e.g. tsc.jsx:452–458, childrens_dda.jsx:547–548.

---

## 3. RES_HAB_DAILY — per-diem residential

Per-diem supported living (intense / high). Staffing is modeled by client mix per home (max 3),
split into a night "group" window and a fully-staffed day window.
Calc: `calcHome` ([FinancialTool.jsx:62](../src/pages/FinancialTool.jsx)).
Defaults: `defaultConfig` ([types.js:110](../src/serviceLines/types.js)).

### Input ratios

| Ratio / field | Default | Range | Meaning | Source |
|---|---|---|---|---|
| `defaultWage` | `16` ($/hr) | — | Direct-care wage seed | types.js:112 |
| `graveyardWage` (SL) | `14` ($/hr) | — | Overnight wage seed (⚠ differs from shared 9.5 — see appendix) | types.js:113 |
| `nHigh` | per home | 0–3 | High-support clients in a home | calcHome / FinancialTool.jsx:62 |
| `nIntense` | per home | 0–3 | Intense clients (1:1 day coverage) | calcHome |
| `total` (= `nHigh + nIntense`) | — | ≤ 3 | Clients per home cap | FinancialTool.jsx:66 |
| `groupHrs` (`gHrs`) | per home | 0–20 | Night group window where 1 staff covers all | FinancialTool.jsx:70 |
| `graveyardSleepHrs` | `0` | 0–`maxSleepHrs` | Sleep hours billed at graveyard wage | FinancialTool.jsx:77 |
| `hhrsPerWeek` | `0` | 0–40 | Weekly 1:1 individual add-on hours for high clients (billed U2) | FinancialTool.jsx:113 |
| `billingType` | `normal` | normal/blended | Daily flat rate vs. hourly-unit blended billing | FinancialTool.jsx:92–95 |

### Derived ratios & staffing rules

| Name | Formula | Meaning | Source |
|---|---|---|---|
| Day hours | `dHrs = 24 − gHrs` | Daytime fully-staffed window | FinancialTool.jsx:71 |
| High day-staff pairing | `ceil(nHigh / 2)` | 1 staff per 2 high clients during day | FinancialTool.jsx:87, 101 |
| Max sleep hours | grouped: `max(gHrs, nHigh>0 ? 12 : 0)`; else `12` | Cap on sleep-wage hours — a grouped home with 0 night-group hours can still sleep a high-support staff up to 12hr | FinancialTool.jsx:85 |
| Awake-night hours | `gHrs − sleepHrs` (grouped) | Night hours at full wage | FinancialTool.jsx:78 |
| 1:1 add-on daily hrs | `hhrsPerWeek × 52 / 365` | Weekly 1:1 hours → daily | FinancialTool.jsx:113 |
| `margin` | `gross / rev` | Per-home gross margin | FinancialTool.jsx:125 |
| `plHr` | `gross / totalLaborHrs` | Gross profit per labor hour | FinancialTool.jsx:126 |
| Occupancy adj | `× occupancy/100` | Applied to both revenue and labor | FinancialTool.jsx (calcSLCo) |

**Billing rates** (from shared `rates`, default `RATES_DEF` [FinancialTool.jsx:21](../src/pages/FinancialTool.jsx)):
`intenseDaily 678.77`, `highDaily 368.67`, plus hourly equivalents `IU_HR = iuUnit×4 = 28.28`,
`IG_HR = igUnit×4 = 14.44` (FinancialTool.jsx:63–64).

---

## 4. RES_HAB_HOURLY — hourly residential

DD waiver hourly supported living (individual / group, H2015).
Calc: `calcHourlyParticipant` ([FinancialTool.jsx:202](../src/pages/FinancialTool.jsx)).
Per-participant defaults at [FinancialTool.jsx:190–194](../src/pages/FinancialTool.jsx).

### Input ratios

| Ratio / field | Default | Meaning | Source |
|---|---|---|---|
| `indHrsPerWeek` | `10` | Individual authorized hrs/week | FinancialTool.jsx:190 |
| `weeklyCapHrs` | `15` | Total weekly cap (individual + group) | FinancialTool.jsx:192 |
| `weeksPerYear` | `52` | Annual authorization weeks | FinancialTool.jsx:193 |
| `groupSize` | `2` | Participants sharing group time (labor split divisor) | FinancialTool.jsx:194 |
| `defaultWage` | `16` ($/hr) | Direct-care wage seed | types.js:124 |

### Derived ratios

| Name | Formula | Meaning | Source |
|---|---|---|---|
| Individual hrs | `min(indHrsPerWeek, weeklyCapHrs)` | Individual hrs capped by weekly total | FinancialTool.jsx:205 |
| Group hrs | `max(0, weeklyCapHrs − indHrs)` | Remainder of cap goes to group | FinancialTool.jsx:206 |
| Individual revenue | `annualIndHrs × IU_HR` (28.28/hr) | U2 individual billing | FinancialTool.jsx:211 |
| Group revenue | `annualGroupHrs × IG_HR` (14.44/hr) | U3 group billing (½ of U2) | FinancialTool.jsx:212 |
| Group labor split | `(annualGroupHrs × wage) / max(1, groupSize)` | Group labor shared across participants | FinancialTool.jsx:216 |

---

## 5. TSC — Targeted Service Coordination

Caseload-coordinator model (G9002 coordination, G9007 plan dev, H2011 crisis).
Calcs in [tsc.jsx](../src/serviceLines/tsc.jsx); type defaults at [types.js:135](../src/serviceLines/types.js).

### Input ratios

| Ratio / field | Default | Meaning | Source |
|---|---|---|---|
| `defaultUnitsPerParticipantPerMonth` | `16` | Seed monthly 15-min units / participant | types.js:137 |
| `defaultParaproRatio` | `0` | Default paraprofessional ratio | types.js:138 |
| `payrollBurdenPct` | `22` (%) | Employer burden (configurable) | tsc.jsx:122 |
| `adminHrsPerWeek` | `5` | Non-billable admin/drive/doc hours / week | tsc.jsx:101 |
| `billableHoursPerDay` | `6` | Target billable hrs/day | tsc.jsx:128 |
| `documentationTimePct` | `15` (%) | Non-billable documentation | tsc.jsx:129 |
| `travelTimePct` | `10` (%) | Non-billable travel | tsc.jsx:130 |
| `noShowPct` | `8` (%) | No-show / missed appointments | tsc.jsx:131 |
| `qaReworkPct` | `3` (%) | QA rework | tsc.jsx:132 |
| `completionRate` | `92` (%) | Authorized units actually rendered | tsc.jsx:135 |
| `billingSuccessRate` | `97` (%) | Rendered units actually billed | tsc.jsx:136 |
| `collectionRate` | `99` (%) | Billed claims collected | tsc.jsx:137 |
| `faceToFaceComplianceRate` | `90` (%) | Contacts meeting face-to-face requirement | tsc.jsx:139 |
| `planDevCompletionRate` | `95` (%) | ISP plan dev completed on time | tsc.jsx:140 |
| `caseloadChurnRate` | `15` (%) | Annual caseload turnover | tsc.jsx:141 |
| `denialWriteOffRate` | `3` (%) | Billed claims written off after denial | tsc.jsx:142 |
| `scenario.rateAdjPct` | `0` (%) | Scenario rate adjustment | tsc.jsx:145 |
| `scenario.productivityAdjPct` | `0` (%) | Scenario productivity adjustment | tsc.jsx:147 |

### Derived ratios

| Name | Formula | Meaning | Source |
|---|---|---|---|
| `effectiveBillablePct` | `1 − doc − travel − noShow − qa` | Net billable fraction after losses | tsc.jsx:264 |
| `netBillableHrsPerDay` | `billableHoursPerDay × effectiveBillablePct` | Realized billable hrs/day | tsc.jsx:265 |
| `utilization` | `totalMonthlyHrs / 160` | vs. 160-hr/mo FTE | tsc.jsx:193–194 |
| `billableShare` | `monthlyBillable / totalMonthlyHrs` | Billable fraction of worked hrs | tsc.jsx:195 |
| `grossMargin` | `gross / annualRev` | Coordinator gross margin | tsc.jsx:208 |
| `leakagePct` | `(authorized − collected) / authorized` | Total revenue leakage | tsc.jsx:255 |
| `breakEvenCaseload` | `fixedMonthly / revenuePerParticipant` | Min caseload to break even | tsc.jsx:281 |
| `safetyMarginPct` | `(totalPx − breakEvenCaseload) / totalPx` | Caseload safety buffer | tsc.jsx:285 |

---

## 6. CHILDRENS_DDA — Children's DD Agency (CHIS)

Children's habilitation with credential tiers, supervision load, seasonality, and group dilution.
Calcs in [childrens_dda.jsx](../src/serviceLines/childrens_dda.jsx); defaults at [types.js:237](../src/serviceLines/types.js).

### Input ratios

| Ratio / field | Default | Meaning | Source |
|---|---|---|---|
| `supervision.providersPerSupervisor` | `8` | Providers managed per supervisor | types.js:240 / childrens_dda.jsx:156 |
| `supervision.count` | `1` | Number of supervisors | childrens_dda.jsx:156 |
| `supervision.salary` | `65000` ($) | Annual salary / supervisor | childrens_dda.jsx:156 |
| `seasonality.enabled` | `false` | Toggle seasonal multiplier | childrens_dda.jsx:157 |
| `seasonality.summerMultiplier` | `0.7` | Summer revenue factor (70%) | childrens_dda.jsx:157 |
| `seasonality.holidayReductionPct` | `10` (%) | Holiday-period hour reduction | childrens_dda.jsx:157 |
| `productivity.billableHrsPerDay` | `5.5` | Target billable hrs/day | childrens_dda.jsx:158 |
| `productivity.cancellationRate` | `12` (%) | Appointment cancellations | childrens_dda.jsx:158 |
| `productivity.driveTimePct` | `15` (%) | Non-billable drive time | childrens_dda.jsx:158 |
| `productivity.documentationTimePct` | `20` (%) | Non-billable documentation | childrens_dda.jsx:158 |
| `payrollBurdenPct` | `22` (%) | Employer burden | childrens_dda.jsx:159 |
| `defaultHourlyWage` | `22` ($/hr) | Direct-care wage seed | types.js:244 |
| `<service>.groupSize` | `4` | Participants per group (bi/skill/family/comm/respite) | childrens_dda.jsx:117–125 |

### Derived ratios

| Name | Formula | Meaning | Source |
|---|---|---|---|
| `utilization` | `totalMonthlyHrs / 160` | vs. 160-hr/mo FTE | childrens_dda.jsx:282, 297 |
| `billableShare` | `monthlyProvHrs / totalMonthlyHrs` | Billable fraction | childrens_dda.jsx:298 |
| `grossMargin` | `gross / annualRev` | Provider gross margin | childrens_dda.jsx:296 |
| `totalMargin` | `totalGross / totalAnnualRev` | Service-level margin (after supervision) | childrens_dda.jsx:336 |
| Group hours / participant | `grpHrMo / groupSize` | Group labor diluted across group | childrens_dda.jsx:214–223 |
| Supervision cost | `salaryTotal × (1 + burden/100)` | Loaded supervision cost | childrens_dda.jsx:324 |

---

## 7. VOC_SERVICES (CSE) — Vocational / Supported Employment

Supported employment (H2023) with a job-development engine and revenue-realization waterfall.
Calcs in [cse.jsx](../src/serviceLines/cse.jsx); defaults at [types.js:211](../src/serviceLines/types.js).

### Input ratios

| Ratio / field | Default | Meaning | Source |
|---|---|---|---|
| `jobDevelopment.fteCount` | `1` | Job developers (FTE) | types.js:214 / cse.jsx:486 |
| `jobDevelopment.salary` | `52000` ($) | Salary / job developer | types.js:214 |
| `jobDevelopment.outreachHoursPerWeek` | `20` | Outreach hrs/week (non-billable) | cse.jsx:86 |
| `jobDevelopment.conversionRate` | `15` (%) | Outreach contacts → placements | cse.jsx:87 |
| `productivity.billableHrsPerDay` | `5` | Target billable hrs/day | cse.jsx:90 |
| `productivity.driveTimePct` | `25` (%) | Non-billable drive time | cse.jsx:91 |
| `productivity.documentationTimePct` | `15` (%) | Non-billable documentation | cse.jsx:92 |
| `productivity.noShowPct` | `10` (%) | No-shows | cse.jsx:93 |
| `revenue.completionRate` | `90` (%) | Units rendered | cse.jsx:96 |
| `revenue.billingSuccessRate` | `95` (%) | Rendered units billed | cse.jsx:97 |
| `revenue.collectionRate` | `99` (%) | Billed claims collected | cse.jsx:98 |
| `payrollBurdenPct` | `22` (%) | Employer burden | cse.jsx:100 |
| `defaultHourlyWage` | `20` ($/hr) | Direct-care wage seed | types.js:218 |

### Derived ratios

| Name | Formula | Meaning | Source |
|---|---|---|---|
| `effectivePct` | `100 − driveTimePct − documentationTimePct − noShowPct` | Net billable % | cse.jsx:703 |
| `utilization` | `totalMonthlyHrs / 160` | vs. 160-hr/mo FTE | cse.jsx:152, 166 |
| `grossMargin` | `gross / annualRev` | Specialist gross margin | cse.jsx:165 |
| Revenue waterfall | `rev × completion × billingSuccess × collection` | Earned → billed → collected | cse.jsx:706–708 |
| Job-dev cost | `fteCount × salary × (1 + burden/100)` | Loaded job-dev overhead | cse.jsx:185 |

---

## 8. SCHOOL_BASED — School-Based Services

Multi-discipline (PT/OT/speech/behavioral), annualized over the school year with a scenario layer.
Calcs in [school_based.jsx](../src/serviceLines/school_based.jsx); defaults at [types.js:363](../src/serviceLines/types.js).

### Input ratios

| Ratio / field | Default | Meaning | Source |
|---|---|---|---|
| `schoolYear.weeksPerYear` | `36` | School weeks / year | school_based.jsx:176 |
| `schoolYear.esyWeeks` | `0` | Extended-school-year weeks (added) | school_based.jsx:176 |
| `productivity.billableHrsPerDay` | `5` | Target billable hrs/day (display-only) | school_based.jsx:178 |
| `productivity.absenceRate` | `10` (%) | Absence — **applied** to revenue & service hours | school_based.jsx:179 |
| `productivity.documentationTimePct` | `15` (%) | Documentation (display-only) | school_based.jsx:180 |
| `productivity.travelBetweenSchoolsPct` | `10` (%) | Travel between schools (display-only) | school_based.jsx:181 |
| `supervision.count` | `0` | Supervisors | types.js:373 |
| `supervision.salary` | `70000` ($) | Salary / supervisor | types.js:373 |
| `scenario.rateAdjPct` | `0` (%) | Scenario rate adjustment | school_based.jsx:185 |
| `scenario.caseloadCount` | `null` | Scenario caseload override | school_based.jsx:185 |
| `scenario.productivityAdjPct` | `0` (%) | Scenario productivity adjustment | school_based.jsx:185 |
| `scenario.weeksPerYear` | `null` | Scenario total-weeks override (zeroes ESY) | school_based.jsx:185, 430 |
| `payrollBurdenPct` | `22` (%) | Employer burden | school_based.jsx:186 |
| `defaultHourlyWage` | `30` ($/hr) | Direct-care wage seed | types.js:377 |
| `<service>.groupSize` | `4` | Participants per group (e.g. cbrsGrp) | school_based.jsx:129 |

### Derived ratios

| Name | Formula | Meaning | Source |
|---|---|---|---|
| Annual weeks | `weeksPerYear + esyWeeks` | School + ESY weeks for annualization | school_based.jsx:237 |
| `attendance` | `1 − absenceRate/100` | Attendance factor on revenue & hours | school_based.jsx:243 |
| `effBillable` | `100 − absenceRate − documentationTimePct − travelBetweenSchoolsPct` | Net billable % (display) | school_based.jsx:1089 |
| `utilization` | `weeklyHrs / 40` | **vs. 40-hr week** (not 160/mo — see appendix) | school_based.jsx:333 |
| `grossMargin` | `gross / annualRev` | Clinician gross margin | school_based.jsx:332 |
| Scenario caseload adj | `caseloadCount / base.totalCaseload` | Scales modeled caseload | school_based.jsx:405 |

---

## 9. Implicit unit-conversion constants

Recurring constants embedded in the calculators (not configurable):

| Constant | Value | Used for | Example source |
|---|---|---|---|
| Units per hour | `4` (15-min units = 1 hr) | All 15-min billing → hourly rate (`iuUnit × 4`) | FinancialTool.jsx:63 |
| Weeks per month | `4.33` | Weekly → monthly hours | tsc.jsx:183, childrens_dda.jsx:205, cse.jsx:118 |
| FTE hours / month | `160` | Monthly utilization baseline | tsc.jsx:193, childrens_dda.jsx:282, cse.jsx:152 |
| FTE hours / week | `40` | School-based utilization baseline | school_based.jsx:333 |
| Days per year | `365` | Weekly 1:1 add-on → daily (Res Hab) | FinancialTool.jsx:113 |
| Plan-dev annual→monthly | `/ 12` | G9007 prorated monthly | tsc.jsx:164, 168 |

---

## Cross-source discrepancies

Documented **as-is** — no values changed. These are concepts that appear in more than one
place with differing values or treatment.

| Concept | Value A | Value B | Note |
|---|---|---|---|
| `graveyardWage` | `9.5` (shared) — companyShape.js:91 | `14` (RES_HAB_DAILY SL config) — types.js:113 | Two seed defaults at different layers; the value actually used flows from whichever the calc is passed. ⚠ unreconciled |
| Payroll burden | hardcoded `0.22` for Res Hab — FinancialTool.jsx:2461, 2850 | configurable `payrollBurdenPct` (default `22`) — tsc/cse/childrens_dda/school_based | Res Hab burden is **not** user-editable; the hourly-direct lines expose it as a field |
| Utilization baseline | `/160` per month (TSC, DDA, CSE) | `/40` per week (School-Based) | Same metric name, different FTE basis — both are "as designed," noted for clarity |

> Note: an earlier review hypothesized a Res Hab daily-rate conflict (e.g. $726.22 / $394.44).
> That did **not** materialize — `RATES_DEF` (FinancialTool.jsx:21), the rate-tab baselines
> (FinancialTool.jsx:1172–1175), and `DEFAULT_RES_HAB_RATES` (companyShape.js:66) all agree at
> **678.77 / 368.67 / 7.07 / 3.61**.

---

## Maintenance

This document is the canonical ratio reference and **drifts silently** when calculator logic
changes. When you edit ratio defaults, formulas, or thresholds, update the matching section here.
Source files to re-check:

- `src/lib/companyShape.js` — shared ratios, `DEFAULT_RES_HAB_RATES`
- `src/serviceLines/types.js` — per-type `defaultConfig()` seeds
- `src/pages/FinancialTool.jsx` — RES_HAB calcs (`calcHome`, `calcHourlyParticipant`),
  `calcSLCo`, tax rates, `RATES_DEF`, `APPROVAL_THRESHOLDS`, `LABOR_APPROVAL_THRESHOLDS`
- `src/serviceLines/{tsc,childrens_dda,cse,school_based}.jsx` — per-line input & derived ratios

When a `catalog` service line gains a real calculator (status → `active` in `types.js`), add a
new section for it here.
