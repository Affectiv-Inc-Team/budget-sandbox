// Central access control module — all role-based visibility rules live here.
// See docs/access-levels-and-rights.md for the full specification.

export const ROLES = {
  OWNER:             'OWNER',
  CEO:               'CEO',
  FINANCE:           'FINANCE',
  REGIONAL_DIRECTOR: 'REGIONAL_DIRECTOR',
  PROGRAM_MANAGER:   'PROGRAM_MANAGER',
  HR_MANAGER:        'HR_MANAGER',
  SCHEDULER:         'SCHEDULER',
  HOUSE_LEAD:        'HOUSE_LEAD',
};

// Lower number = more privileged
export const ROLE_TIERS = {
  OWNER: 1, CEO: 2, FINANCE: 3,
  REGIONAL_DIRECTOR: 4, PROGRAM_MANAGER: 5, HR_MANAGER: 6,
  SCHEDULER: 7, HOUSE_LEAD: 8,
};

export const ROLE_LABELS = {
  OWNER:             'Owner',
  CEO:               'CEO',
  FINANCE:           'Finance',
  REGIONAL_DIRECTOR: 'Regional Director',
  PROGRAM_MANAGER:   'Program Manager',
  HR_MANAGER:        'HR Manager',
  SCHEDULER:         'Scheduler',
  HOUSE_LEAD:        'House Lead',
};

function tier(role) { return ROLE_TIERS[role] ?? 99; }

// Rule 1 — Company dollars visible to tiers 1–3 only
export function canSeeCompanyDollars(role) { return tier(role) <= 3; }

// Rule 1a — Margin & revenue percentages visible to tiers 1–4 only
// (Program Managers and below do NOT see revenue or margin figures — dollars or %)
export function canSeeMargin(role)  { return tier(role) <= 4; }
export function canSeeRevenue(role) { return tier(role) <= 4; }

// Rule 2 — Wage display mode
// 'dollars' = tiers 1–6  |  'percent' = tier 7  |  'hidden' = tier 8
export function wageDisplayMode(role) {
  const t = tier(role);
  if (t <= 6) return 'dollars';
  if (t === 7) return 'percent';
  return 'hidden';
}

// Rule 3 — All tiers see percentages/ratios
export function canSeePercentages() { return true; }

// Rule 4 — Budget Builder row visibility
// rowOwnerTier: the tier number that "owns" that budget line
// Returns 'dollars' | 'percent' | 'hidden'
export function budgetRowVisibility(role, rowOwnerTier) {
  const userTier = tier(role);
  if (userTier <= 3) return 'dollars';
  if (userTier === 8) return rowOwnerTier === 8 ? 'dollars' : 'hidden';
  // tiers 4–7: own row in $, below in %, above hidden
  if (rowOwnerTier === userTier) return 'dollars';
  if (rowOwnerTier > userTier)   return 'percent';
  return 'hidden';
}

// Rule 5 — Sidebar control visibility
// controlId: 'wage' | 'graveyardWage' | 'occupancy' | 'entityType' |
//            'ownerRate' | 'resHabRates' | 'mgmtFee' | 'billingFee'
const CONTROL_MAX_TIER = {
  wage:          6,
  graveyardWage: 6,
  occupancy:     7,
  entityType:    3,
  ownerRate:     3,
  resHabRates:   5,
  tscRates:      5,
  mgmtFee:       3,
  billingFee:    3,
};
export function canSeeControl(role, controlId) {
  return tier(role) <= (CONTROL_MAX_TIER[controlId] ?? 3);
}

// Rule 6 — Edit permission level
// 'full' = tiers 1–3  |  'operational' = tiers 4–6  |  'readonly' = tiers 7–8
export function editMode(role) {
  const t = tier(role);
  if (t <= 3) return 'full';
  if (t <= 6) return 'operational';
  return 'readonly';
}

// Rule 7 — Top-level KPI chips (header bar) visible to tiers 1–4
export function canSeeTopNumbers(role) { return tier(role) <= 4; }

// Rule 8 — Service-line editing (Home Mix Editor interactive controls) allowed for tiers 1–4
export function canEditServiceLines(role) { return tier(role) <= 4; }

// Rule 9 — Add Service Line button visible to tiers 1–4
export function canAddServiceLine(role) { return tier(role) <= 4; }

// Rule 10 — Referral & Intake Tracker
// Module visible from the access floor upward; SSN unmask restricted further.
// (The DB enforces the SSN floor server-side in referral_reveal_ssn; this gates the UI.)
export const REFERRAL_ACCESS_FLOOR_TIER = 5; // PROGRAM_MANAGER and up
export const SSN_UNMASK_FLOOR_TIER     = 3; // FINANCE and up

export function canSeeReferrals(role) { return tier(role) <= REFERRAL_ACCESS_FLOOR_TIER; }
export function canUnmaskSSN(role)    { return tier(role) <= SSN_UNMASK_FLOOR_TIER; }
