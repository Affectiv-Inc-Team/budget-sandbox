/**
 * Referral shape — pure helpers and enum constants for the Referral & Intake
 * Tracker. No Supabase imports here (so this stays unit-testable in isolation;
 * the data layer lives in src/lib/referrals.js).
 *
 * The two load-bearing rules from the build spec live here:
 *   - isSaveable():        a referral saves as long as it is not entirely empty.
 *   - buildDisplayLabel(): every record gets a findable label, even unnamed ones.
 */

// ─── Enums (value = stored, label = displayed) ──────────────────────────────

export const PIPELINE_STAGES = [
  { value: 'NEW_INQUIRY',               label: 'New / Inquiry' },
  { value: 'UNDER_REVIEW',              label: 'Under Review' },
  { value: 'INFO_GATHERING',            label: 'Information Gathering' },
  { value: 'ASSESSMENT',               label: 'Assessment / Meet & Greet' },
  { value: 'PENDING_AUTH',              label: 'Pending Authorization' },
  { value: 'ACCEPTED_PENDING_PLACEMENT', label: 'Accepted (Pending Placement)' },
  { value: 'ENROLLED',                  label: 'Enrolled' },
];

export const SIDE_EXITS = [
  { value: 'WAITLIST',     label: 'Waitlist' },
  { value: 'DECLINED',     label: 'Declined' },
  { value: 'WITHDRAWN',    label: 'Withdrawn' },
  { value: 'REFERRED_OUT', label: 'Referred Out' },
];

export const ALL_STAGES = [...PIPELINE_STAGES, ...SIDE_EXITS];

export const SOURCE_TYPES = [
  { value: 'tsc',             label: 'TSC' },
  { value: 'hospital',        label: 'Hospital' },
  { value: 'school',          label: 'School' },
  { value: 'family_self',     label: 'Family / Self' },
  { value: 'state_agency',    label: 'State Agency' },
  { value: 'another_provider', label: 'Another Provider' },
  { value: 'crisis_services', label: 'Crisis Services' },
  { value: 'other',           label: 'Other' },
];

export const INTAKE_METHODS = [
  { value: 'phone',     label: 'Phone' },
  { value: 'email',     label: 'Email' },
  { value: 'fax',       label: 'Fax' },
  { value: 'portal',    label: 'Portal' },
  { value: 'in_person', label: 'In-person' },
  { value: 'text',      label: 'Text' },
];

export const PRIORITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'High' },
  { value: 'crisis', label: 'Crisis' },
];

export const LIVING_SITUATIONS = [
  { value: 'family_home',      label: 'Family home' },
  { value: 'icf',              label: 'ICF' },
  { value: 'hospital',         label: 'Hospital' },
  { value: 'nursing_facility', label: 'Nursing facility' },
  { value: 'homeless',         label: 'Homeless' },
  { value: 'another_provider', label: 'Another provider' },
  { value: 'independent',      label: 'Independent' },
  { value: 'other',            label: 'Other' },
];

export const SERVICES = [
  { value: 'res_hab',              label: 'Res Hab' },
  { value: 'supported_living',     label: 'Supported Living' },
  { value: 'supported_employment', label: 'Supported Employment' },
  { value: 'day_hab',              label: 'Day Hab' },
  { value: 'respite',              label: 'Respite' },
  { value: 'personal_care',        label: 'Personal Care' },
  { value: 'pdn',                  label: 'PDN' },
  { value: 'other',                label: 'Other' },
];

// Matches internal terminology used elsewhere in the platform.
export const SERVICE_LEVELS = [
  { value: 'traditional', label: 'Traditional' },
  { value: 'blended',     label: 'Blended' },
  { value: 'intense',     label: 'Intense' },
];

export const PAY_SOURCES = [
  { value: 'medicaid_waiver',     label: 'Medicaid waiver' },
  { value: 'medicaid_state_plan', label: 'Medicaid state plan' },
  { value: 'private_pay',         label: 'Private pay' },
  { value: 'dual',                label: 'Dual' },
  { value: 'pending_eligibility', label: 'Pending eligibility' },
];

export const RISK_INDICATORS = [
  { value: 'elopement',           label: 'Elopement' },
  { value: 'aggression',          label: 'Aggression toward others' },
  { value: 'self_injury',         label: 'Self-injury' },
  { value: 'property_destruction', label: 'Property destruction' },
  { value: 'sexualized_behavior', label: 'Sexualized behaviors' },
  { value: 'fire_setting',        label: 'Fire-setting' },
  { value: 'law_enforcement',     label: 'Prior law-enforcement involvement' },
];

export const DOCUMENT_TYPES = [
  { value: 'referral_packet', label: 'Referral packet' },
  { value: 'eligibility',     label: 'Eligibility docs' },
  { value: 'assessment',      label: 'Assessment (ICAP / SIB-R)' },
  { value: 'isp',             label: 'ISP / plan' },
  { value: 'behavior_plan',   label: 'Behavior plan' },
  { value: 'medical',         label: 'Medical records' },
  { value: 'consent_roi',     label: 'Consent / ROI' },
  { value: 'guardianship',    label: 'Guardianship paperwork' },
  { value: 'other',           label: 'Other' },
];

export const CONTACT_KINDS = [
  { value: 'family',    label: 'Family' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'guardian',  label: 'Legal guardian / conservator' },
  { value: 'poa',       label: 'Power of attorney' },
];

export const REPEATABLE_CONTACT_KINDS = [
  { value: 'family',    label: 'Family' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'guardian',  label: 'Legal guardian' },
  { value: 'poa',       label: 'Power of attorney' },
  { value: 'other',     label: 'Other' },
];

export const OUTCOMES = [
  { value: 'enrolled',     label: 'Enrolled' },
  { value: 'declined',     label: 'Declined' },
  { value: 'waitlisted',   label: 'Waitlisted' },
  { value: 'withdrawn',    label: 'Withdrawn' },
  { value: 'referred_out', label: 'Referred out' },
];

const LABEL_MAPS = {
  stage: ALL_STAGES, source_type: SOURCE_TYPES, intake_method: INTAKE_METHODS,
  priority: PRIORITIES, service_level: SERVICE_LEVELS, pay_source: PAY_SOURCES,
  outcome: OUTCOMES, living_situation: LIVING_SITUATIONS,
};

/** Human label for a stored enum value (falls back to the raw value). */
export function labelFor(field, value) {
  const opt = (LABEL_MAPS[field] ?? []).find(o => o.value === value);
  return opt ? opt.label : (value ?? '');
}

// ─── Save / label logic ─────────────────────────────────────────────────────

// Top-level keys that carry defaults or are system-managed — they do NOT count
// as "content" when deciding whether a record is empty.
const NON_CONTENT_KEYS = new Set(['stage', 'priority', 'display_label']);

function hasContent(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;            // a set flag is a data point
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === 'object') return Object.values(value).some(hasContent);
  return false;
}

/**
 * A referral is saveable as long as it is not entirely empty — a single data
 * point (a referring party's name, a phone number, anything) is enough.
 * Stage/priority defaults and the system label do not count.
 */
export function isSaveable(draft) {
  if (!draft || typeof draft !== 'object') return false;
  return Object.entries(draft).some(
    ([key, value]) => !NON_CONTENT_KEYS.has(key) && hasContent(value)
  );
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, m - 1, day);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

/**
 * Auto-generated, always-findable label.
 * Priority: client name → referring party + date → "Unnamed referral · {source} · {date}".
 */
export function buildDisplayLabel(r = {}) {
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
    || (r.preferred_name ?? '').trim();
  if (name) return name;

  const rpName = (r.referring_party?.name ?? '').trim();
  const date = fmtDate(r.date_received);
  if (rpName) return date ? `${rpName} · ${date}` : rpName;

  const source = r.source_type ? labelFor('source_type', r.source_type) : 'unknown source';
  return `Unnamed referral · ${source}${date ? ` · ${date}` : ''}`;
}

/** Non-blocking hints about useful-but-missing info. Never gate saving on these. */
export function softWarnings(r = {}) {
  const out = [];
  const hasName = [r.first_name, r.last_name, r.preferred_name].some(v => (v ?? '').trim());
  const hasContact = (r.referring_party?.phone ?? '').trim()
    || (r.referring_party?.email ?? '').trim()
    || (r.referring_party?.name ?? '').trim();
  if (!hasName && !hasContact) out.push('No client name or referring-party contact yet.');
  if (!r.source_type) out.push('No referral source type set.');
  if (!r.date_received) out.push('No date received recorded.');
  return out;
}

/** Days the referral has sat in its current stage (for the aging indicator). */
export function daysInStage(stageEnteredAt) {
  if (!stageEnteredAt) return null;
  const then = new Date(stageEnteredAt);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}
