/**
 * Service Line Type Registry
 *
 * Each service line type represents a distinct billing/operating model
 * available to a portfolio company. Types are grouped into "archetypes" —
 * sets of service lines that share a financial model (per-diem residential,
 * hourly direct service, etc.). Calculators in serviceLines/<type>/calc.js
 * are keyed by the type ID.
 *
 * Status values:
 *   - 'active'  → UI tabs and calculator implemented
 *   - 'catalog' → rate data and type metadata exist; UI stubbed (placeholder tab)
 *   - 'planned' → reserved for future; not yet pickable
 */

// ──────────────────────────────────────────────────────────────────────
// Type IDs (stable strings used as keys throughout the app)
// ──────────────────────────────────────────────────────────────────────
export const SERVICE_LINE_TYPES = {
  // Per-diem residential
  RES_HAB_DAILY:            'RES_HAB_DAILY',
  ICF:                      'ICF',
  SNF:                      'SNF',
  // Per-diem A&D residential
  CFH:                      'CFH',
  RALF:                     'RALF',
  ADULT_DAY_HEALTH:         'ADULT_DAY_HEALTH',
  // Hourly residential
  RES_HAB_HOURLY:           'RES_HAB_HOURLY',
  // Caseload coordinator
  TSC:                      'TSC',
  AD_CASE_MGMT:             'AD_CASE_MGMT',
  SUPPORT_BROKER:           'SUPPORT_BROKER',
  // Hourly direct service — agency tier
  VOC_SERVICES:             'VOC_SERVICES',
  ADULT_DDA:                'ADULT_DDA',
  CHILDRENS_DDA:            'CHILDRENS_DDA',
  PAA:                      'PAA',
  // Hourly direct service — independent tier
  CHILDRENS_DD_INDEPENDENT: 'CHILDRENS_DD_INDEPENDENT',
  // Per-visit episodic
  HOME_HEALTH:              'HOME_HEALTH',
  PDN:                      'PDN',
  // Per-day hospice / BH programs
  HOSPICE:                  'HOSPICE',
  BH_DAY_TREATMENT:         'BH_DAY_TREATMENT',
  BH_SSH:                   'BH_SSH',
  // Specialized BH
  BH_OUTPATIENT:            'BH_OUTPATIENT',
  BH_CBRS:                  'BH_CBRS',
  BH_CRISIS:                'BH_CRISIS',
  BH_CHILDRENS_IHCBS:       'BH_CHILDRENS_IHCBS',
  BH_SUD:                   'BH_SUD',
  // Mixed-modality
  SCHOOL_BASED:             'SCHOOL_BASED',
  // Self-direct fiscal intermediary
  SELF_DIRECT:              'SELF_DIRECT',
};

// ──────────────────────────────────────────────────────────────────────
// Archetypes (financial model families)
// ──────────────────────────────────────────────────────────────────────
export const ARCHETYPES = {
  PER_DIEM_RESIDENTIAL:      'PER_DIEM_RESIDENTIAL',
  PER_DIEM_AD:               'PER_DIEM_AD',
  HOURLY_RESIDENTIAL:        'HOURLY_RESIDENTIAL',
  CASELOAD_COORDINATOR:      'CASELOAD_COORDINATOR',
  HOURLY_DIRECT_AGENCY:      'HOURLY_DIRECT_AGENCY',
  HOURLY_DIRECT_INDEPENDENT: 'HOURLY_DIRECT_INDEPENDENT',
  PER_VISIT_EPISODIC:        'PER_VISIT_EPISODIC',
  PER_DAY_PROGRAM:           'PER_DAY_PROGRAM',
  SPECIALIZED_BH:            'SPECIALIZED_BH',
  MIXED_MODALITY:            'MIXED_MODALITY',
  SELF_DIRECT_FI:            'SELF_DIRECT_FI',
};

export const ARCHETYPE_LABELS = {
  [ARCHETYPES.PER_DIEM_RESIDENTIAL]:      'Residential — per diem',
  [ARCHETYPES.PER_DIEM_AD]:               'A&D residential — per diem',
  [ARCHETYPES.HOURLY_RESIDENTIAL]:        'Residential — hourly',
  [ARCHETYPES.CASELOAD_COORDINATOR]:      'Caseload coordinator',
  [ARCHETYPES.HOURLY_DIRECT_AGENCY]:      'Hourly direct service — agency',
  [ARCHETYPES.HOURLY_DIRECT_INDEPENDENT]: 'Hourly direct service — independent',
  [ARCHETYPES.PER_VISIT_EPISODIC]:        'Per-visit episodic',
  [ARCHETYPES.PER_DAY_PROGRAM]:           'Per-day program',
  [ARCHETYPES.SPECIALIZED_BH]:            'Behavioral health — specialized',
  [ARCHETYPES.MIXED_MODALITY]:            'Mixed modality',
  [ARCHETYPES.SELF_DIRECT_FI]:            'Self-direct fiscal intermediary',
};

// ──────────────────────────────────────────────────────────────────────
// Service line definitions
// ──────────────────────────────────────────────────────────────────────
const T = SERVICE_LINE_TYPES;
const A = ARCHETYPES;

// Common default factories used by multiple types
const emptyConfig    = () => ({});
const rosterConfig   = () => ({ roster: [], defaultWage: 18 });
const facilityConfig = () => ({ facilities: [], defaultWage: 18 });

export const SERVICE_LINE_DEFS = {
  [T.RES_HAB_DAILY]: {
    label: 'Residential Habilitation — Daily',
    shortLabel: 'Res Hab Daily',
    archetype: A.PER_DIEM_RESIDENTIAL,
    description: 'DD waiver per-diem supported living (intense / high)',
    billingUnit: 'day',
    status: 'active',
    defaultConfig: () => ({
      indHomes: [],
      defaultWage: 16,
      graveyardWage: 14,
    }),
  },
  [T.RES_HAB_HOURLY]: {
    label: 'Residential Habilitation — Hourly',
    shortLabel: 'Res Hab Hourly',
    archetype: A.HOURLY_RESIDENTIAL,
    description: 'DD waiver hourly supported living (individual / group, H2015)',
    billingUnit: '15min',
    status: 'active',
    defaultConfig: () => ({
      participants: [],
      defaultWage: 16,
    }),
  },
  [T.TSC]: {
    label: 'Targeted Service Coordination',
    shortLabel: 'TSC',
    archetype: A.CASELOAD_COORDINATOR,
    description: 'DD / Children\'s service coordination, plan development, crisis (G9002, G9007, H2011)',
    billingUnit: '15min',
    status: 'active',
    defaultConfig: () => ({
      coordinators: [],
      defaultUnitsPerParticipantPerMonth: 16,
      defaultParaproRatio: 0,
    }),
  },
  [T.ICF]: {
    label: 'Intermediate Care Facility (ICF/IID)',
    shortLabel: 'ICF',
    archetype: A.PER_DIEM_RESIDENTIAL,
    description: 'Per-facility per-diem (NPI-keyed, RC 100/189)',
    billingUnit: 'day',
    status: 'catalog',
    defaultConfig: facilityConfig,
  },
  [T.SNF]: {
    label: 'Skilled Nursing Facility',
    shortLabel: 'SNF',
    archetype: A.PER_DIEM_RESIDENTIAL,
    description: 'Per-facility per-diem (NPI-keyed, RC 100/183)',
    billingUnit: 'day',
    status: 'catalog',
    defaultConfig: facilityConfig,
  },
  [T.CFH]: {
    label: 'Certified Family Home',
    shortLabel: 'CFH',
    archetype: A.PER_DIEM_AD,
    description: 'A&D waiver in-home (S5140 day, T1019 PCS, T1005 respite)',
    billingUnit: 'day',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.RALF]: {
    label: 'Residential Assisted Living Facility',
    shortLabel: 'RALF',
    archetype: A.PER_DIEM_AD,
    description: 'A&D waiver assisted living (S5140 day + T1019 HE milieu mgmt)',
    billingUnit: 'day',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.ADULT_DAY_HEALTH]: {
    label: 'Adult Day Health',
    shortLabel: 'Adult Day Health',
    archetype: A.HOURLY_DIRECT_AGENCY,
    description: 'Standalone Adult Day Health (S5100)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.AD_CASE_MGMT]: {
    label: 'A&D Case Management',
    shortLabel: 'A&D Case Mgmt',
    archetype: A.CASELOAD_COORDINATOR,
    description: 'Aged & Disabled waiver case management (G9002 CC)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: rosterConfig,
  },
  [T.SUPPORT_BROKER]: {
    label: 'Support Broker (Self-Direct)',
    shortLabel: 'Support Broker',
    archetype: A.CASELOAD_COORDINATOR,
    description: 'Family Directed support broker services (T2041, manually priced)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: rosterConfig,
  },
  [T.VOC_SERVICES]: {
    label: 'Vocational / Supported Employment',
    shortLabel: 'Voc Services',
    archetype: A.HOURLY_DIRECT_AGENCY,
    description: 'DD waiver supported employment (H2023)',
    billingUnit: '15min',
    status: 'active',
    defaultConfig: () => ({
      specialists: [],
      rateOverrides: {},
      jobDevelopment: { fteCount: 1, salary: 52000, outreachHoursPerWeek: 20, conversionRate: 15 },
      productivity: { billableHrsPerDay: 5, driveTimePct: 25, documentationTimePct: 15, noShowPct: 10 },
      revenue: { completionRate: 90, billingSuccessRate: 95, collectionRate: 99 },
      payrollBurdenPct: 22,
      defaultHourlyWage: 20,
    }),
  },
  [T.ADULT_DDA]: {
    label: 'Adult DD Agency (State Plan HCBS)',
    shortLabel: 'Adult DDA',
    archetype: A.HOURLY_DIRECT_AGENCY,
    description: 'Adult DT center-based and community (97537, H2032, H2000, H2011)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.CHILDRENS_DDA]: {
    label: 'Children\'s DD Agency (CHIS)',
    shortLabel: 'Children\'s DDA',
    archetype: A.HOURLY_DIRECT_AGENCY,
    description: 'Children\'s habilitation intervention services with credential tiers',
    billingUnit: '15min',
    status: 'active',
    defaultConfig: () => ({
      providers: [],
      supervisors: [],
      supervision: { count: 1, salary: 65000, providersPerSupervisor: 8 },
      seasonality: { enabled: false, summerMultiplier: 0.7, holidayReductionPct: 10 },
      productivity: { billableHrsPerDay: 5.5, cancellationRate: 12, driveTimePct: 15, documentationTimePct: 20 },
      payrollBurdenPct: 22,
      defaultHourlyWage: 22,
      defaultTier: 'SPECIALIST',
    }),
  },
  [T.CHILDRENS_DD_INDEPENDENT]: {
    label: 'Children\'s DD Independent Provider',
    shortLabel: 'Children\'s DD Indep',
    archetype: A.HOURLY_DIRECT_INDEPENDENT,
    description: 'CHIS at independent provider rates (lower tier)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.PAA]: {
    label: 'Personal Assistance Agency',
    shortLabel: 'PAA',
    archetype: A.HOURLY_DIRECT_AGENCY,
    description: 'A&D waiver attendant care, homemaker, companion, chore (S5125 etc.)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.HOME_HEALTH]: {
    label: 'Home Health',
    shortLabel: 'Home Health',
    archetype: A.PER_VISIT_EPISODIC,
    description: 'Per-visit PT, OT, Speech, Skilled Nursing, HHA (RC 421-571)',
    billingUnit: 'visit',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.PDN]: {
    label: 'Private Duty Nursing',
    shortLabel: 'PDN',
    archetype: A.PER_VISIT_EPISODIC,
    description: 'Nursing agency PDN (T1001 visit, T1002 RN, T1003 LPN)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.HOSPICE]: {
    label: 'Hospice',
    shortLabel: 'Hospice',
    archetype: A.PER_DAY_PROGRAM,
    description: 'County-keyed per-diem (RC 0651/0652/0655/0656 + SIA add-on)',
    billingUnit: 'day',
    status: 'catalog',
    defaultConfig: () => ({ county: '', qualityDataSubmitted: true }),
  },
  [T.BH_OUTPATIENT]: {
    label: 'Behavioral Health — Outpatient',
    shortLabel: 'BH Outpatient',
    archetype: A.SPECIALIZED_BH,
    description: 'Psychotherapy, eval, office visits with credential tiers (Magellan)',
    billingUnit: 'visit',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.BH_CBRS]: {
    label: 'BH Community-Based / CBRS',
    shortLabel: 'BH CBRS',
    archetype: A.SPECIALIZED_BH,
    description: 'Skills building, case mgmt, recovery coaching, peer support',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.BH_CRISIS]: {
    label: 'BH Crisis Services',
    shortLabel: 'BH Crisis',
    archetype: A.SPECIALIZED_BH,
    description: 'Mobile crisis and telephonic crisis (H2011, H0030)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.BH_CHILDRENS_IHCBS]: {
    label: 'BH Children\'s IHCBS / TASSP',
    shortLabel: 'BH Childrens IHCBS',
    archetype: A.SPECIALIZED_BH,
    description: 'TBS, FFT, MDFT, MST, CFT, CANS, TASSP (H0036 + U5/U7/U8/U9)',
    billingUnit: '15min',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.BH_SUD]: {
    label: 'BH Substance Use Disorder',
    shortLabel: 'BH SUD',
    archetype: A.SPECIALIZED_BH,
    description: 'SUD outpatient + MAT + residential ASAM levels',
    billingUnit: 'mixed',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.BH_DAY_TREATMENT]: {
    label: 'BH Day Treatment / IOP / PHP',
    shortLabel: 'BH Day Tx',
    archetype: A.PER_DAY_PROGRAM,
    description: 'Per-day intensive programs (H2012, H0017, H0035, S9480)',
    billingUnit: 'day',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.BH_SSH]: {
    label: 'BH Safe and Sober Housing',
    shortLabel: 'BH SSH',
    archetype: A.PER_DAY_PROGRAM,
    description: 'Adult SSH per-diem (H0044 + SE/HF modifiers)',
    billingUnit: 'day',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
  [T.SCHOOL_BASED]: {
    label: 'School-Based Services',
    shortLabel: 'School Based',
    archetype: A.MIXED_MODALITY,
    description: 'Multi-discipline school services (PT, OT, speech, behavioral)',
    billingUnit: 'mixed',
    status: 'active',
    defaultConfig: () => ({
      clinicians: [],
      districts: [
        { id: 'dist_bonneville',  name: 'Bonneville',      rateOverrides: {} },
        { id: 'dist_jefferson',   name: 'Jefferson County', rateOverrides: {} },
        { id: 'dist_madison',     name: 'Madison',          rateOverrides: {} },
      ],
      schools: [],
      schoolYear: { weeksPerYear: 36, esyWeeks: 0 },
      productivity: { billableHrsPerDay: 5, absenceRate: 10, documentationTimePct: 15, travelBetweenSchoolsPct: 10 },
      supervision: { count: 0, salary: 70000 },
      adminStaff: [],
      scenario: { rateAdjPct: 0, caseloadCount: null, productivityAdjPct: 0, weeksPerYear: null },
      payrollBurdenPct: 22,
      defaultHourlyWage: 30,
      defaultDiscipline: 'SPEECH',
      defaultTier: 'PROFESSIONAL',
      rateOverrides: {},
    }),
  },
  [T.SELF_DIRECT]: {
    label: 'Self-Direct Fiscal Intermediary',
    shortLabel: 'Self-Direct',
    archetype: A.SELF_DIRECT_FI,
    description: 'Family Directed services + Fiscal Employer Agent (T2025, T2040)',
    billingUnit: 'pmpm',
    status: 'catalog',
    defaultConfig: emptyConfig,
  },
};

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
export const TYPE_LIST = Object.keys(SERVICE_LINE_DEFS);

export function getDef(type) {
  return SERVICE_LINE_DEFS[type] || null;
}

export function getLabel(type) {
  return SERVICE_LINE_DEFS[type]?.label || type;
}

export function getShortLabel(type) {
  return SERVICE_LINE_DEFS[type]?.shortLabel || type;
}

export function getDefaultConfig(type) {
  const def = SERVICE_LINE_DEFS[type];
  return def ? def.defaultConfig() : {};
}

export function getTypesByArchetype(archetype) {
  return TYPE_LIST.filter(t => SERVICE_LINE_DEFS[t].archetype === archetype);
}

export function getActiveTypes() {
  return TYPE_LIST.filter(t => SERVICE_LINE_DEFS[t].status === 'active');
}

export function getPickableTypes() {
  // Types the user can add via the picker — active + catalog (not 'planned')
  return TYPE_LIST.filter(t => SERVICE_LINE_DEFS[t].status !== 'planned');
}

/**
 * Group types by archetype for use in a picker dropdown.
 * Returns: [{ archetype, label, types: [{type, label, status}, ...] }, ...]
 */
export function getGroupedPickerOptions() {
  const groups = {};
  for (const type of getPickableTypes()) {
    const def = SERVICE_LINE_DEFS[type];
    if (!groups[def.archetype]) {
      groups[def.archetype] = {
        archetype: def.archetype,
        label: ARCHETYPE_LABELS[def.archetype],
        types: [],
      };
    }
    groups[def.archetype].types.push({
      type,
      label: def.label,
      shortLabel: def.shortLabel,
      description: def.description,
      status: def.status,
    });
  }
  return Object.values(groups);
}
