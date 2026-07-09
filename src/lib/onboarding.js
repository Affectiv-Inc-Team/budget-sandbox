// Onboarding state machine — pure logic, no React, no I/O beyond localStorage.
//
// Steps run in this canonical order. Bootstrap steps (awaiting_company,
// first_line, line_result) only ever apply to an Owner setting up a brand-new
// company; an invited teammate joining an existing company skips them
// entirely — they are REMOVED from visibleSteps(), never rendered disabled.
//
// ctx shape (all derived from live state, never trusted from storage):
//   {
//     role,                    // effectiveRole, e.g. 'OWNER'
//     provenance,              // 'owner' | 'invited' (see getProvenance in supabase.js)
//     companyCount,            // number of companies loadConfig() returned
//     selectedCompanySLCount,  // service lines on the selected company
//     multiCompany,            // companyCount > 1
//     firstLineJustCreated,    // transient: true only right after first_line runs
//   }

import { canAddServiceLine, invitableTiers, ROLE_TIERS, ROLE_LABELS } from './access.js';

export const STEPS = Object.freeze([
  'welcome',
  'awaiting_company',
  'access_granted',
  'tour',
  'first_line',
  'line_result',
  'invite_team',
  'done',
]);

const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s, i]));

// ── Predicates — a step failing its predicate is removed, never disabled ───

const PREDICATES = {
  welcome: () => true,
  awaiting_company: (ctx) => ctx.provenance === 'owner' && ctx.companyCount === 0,
  access_granted: () => true,
  tour: () => true,
  first_line: (ctx) =>
    ctx.provenance === 'owner' &&
    canAddServiceLine(ctx.role) &&
    ctx.companyCount > 0 &&
    ctx.selectedCompanySLCount === 0,
  // Transient: only reachable immediately after first_line completes in the
  // same session. Not resumable — a page reload after picking a line lands
  // back on the dashboard (the line itself is safely on the server or lost
  // like any unsaved edit, matching Save's own semantics).
  line_result: (ctx) => !!ctx.firstLineJustCreated,
  invite_team: (ctx) => invitableTiers(ctx.role).length > 0,
  done: () => true,
};

/**
 * The ordered subset of STEPS that apply to this context right now.
 */
export function visibleSteps(ctx) {
  return STEPS.filter((step) => PREDICATES[step](ctx));
}

/**
 * Where to resume: the first step, among those currently visible, whose
 * canonical position is after `lastCompletedStep`. Comparing canonical
 * positions (not literal step identity) means stale localStorage pointing at
 * a step that's since been filtered out (e.g. the company now has service
 * lines, so first_line no longer applies) still resolves correctly — we land
 * on the next visible step after that point, not back at the start.
 *
 * lastCompletedStep may be null/unknown/stale; treated as "nothing done yet".
 */
export function firstPendingStep(ctx, lastCompletedStep) {
  const visible = visibleSteps(ctx);
  if (!visible.length) return null;

  const lastIndex = STEP_INDEX[lastCompletedStep];
  if (lastIndex === undefined) return visible[0];

  const next = visible.find((step) => STEP_INDEX[step] > lastIndex);
  return next ?? visible[visible.length - 1];
}

// ── Guided tour stops ───────────────────────────────────────────────────────
// Each stop names the data-tour target it points at and copy as a function of
// role. A stop is dropped entirely when its target can't exist (single
// company); the Save stop instead SWAPS target+copy for read-only tiers
// rather than disappearing, since "there's no Save button" is itself the
// thing being taught.

function saveStopFor(role) {
  const t = ROLE_TIERS[role] ?? 99;
  if (t <= 6) {
    return {
      id: 'save',
      target: 'save-button',
      title: 'Save',
      body: "Nothing is final until you save. Your admin sees your latest saved model, not a live draft.",
    };
  }
  return {
    id: 'save',
    target: 'tab-strip',
    title: 'Save',
    body: `At ${ROLE_LABELS[role] ?? 'your'} tier you're read-only — there's no Save button because there's nothing for you to change.`,
  };
}

function sharedStopFor(role) {
  const t = ROLE_TIERS[role] ?? 99;
  const label = ROLE_LABELS[role] ?? 'your';
  let body;
  if (t <= 3) {
    body = 'Wage, occupancy, and overhead here apply company-wide — every service line\'s P&L pulls from these numbers. You see all of it in dollars.';
  } else if (t <= 6) {
    body = `You still see wage and occupancy here as ${label} — but company-wide fee controls are Owner/CEO/Finance-only, so those rows are gone at your tier.`;
  } else {
    body = `At ${label} tier this panel is mostly gone — most controls aren't visible, and there isn't much left to show.`;
  }
  return { id: 'shared', target: 'sidebar', title: 'Shared inputs', body };
}

function stripStopFor(role) {
  const base = "Each tab is one service line's own model — its own roster, productivity, and P&L.";
  const body = canAddServiceLine(role)
    ? `${base} You can also add new lines here.`
    : `${base} Adding new lines is Owner/CEO/Regional Director/Program Manager only, so you won't see that option.`;
  return { id: 'strip', target: 'tab-strip', title: 'Service line strip', body };
}

/**
 * Ordered tour stops for this role/company shape. The switcher stop is
 * dropped when there's only one company — there's nothing to switch between.
 */
export function getTourStops({ role, multiCompany }) {
  const stops = [];
  if (multiCompany) {
    stops.push({
      id: 'switcher',
      target: 'company-switcher',
      title: 'Company switcher',
      body: "If you're ever assigned more than one company, switch between them here. You'll never see one you haven't been granted access to.",
    });
  }
  stops.push(sharedStopFor(role));
  stops.push(stripStopFor(role));
  stops.push(saveStopFor(role));
  return stops;
}

// ── Tier-aware copy ──────────────────────────────────────────────────────────

/**
 * The Welcome screen's headline value bullet — varies by what this tier can
 * actually see, so the promise made on screen 1 matches reality everywhere
 * else in the tool.
 */
export function welcomeBullet(role) {
  const t = ROLE_TIERS[role] ?? 99;
  if (t === 1) {
    return {
      title: 'You see everything, unfiltered',
      body: 'Owner is the top access tier — every wage, overhead line, and margin, shown in dollars.',
    };
  }
  if (t <= 3) {
    return {
      title: 'You see full dollar figures',
      body: `${ROLE_LABELS[role]} has full dollar visibility and edit rights across the whole company.`,
    };
  }
  if (t <= 6) {
    return {
      title: 'You see day-to-day dollars, not company totals',
      body: `As ${ROLE_LABELS[role]}, wages and budgets in your area show in dollars — but company-wide totals are Owner, CEO, and Finance only.`,
    };
  }
  if (t === 7) {
    return {
      title: 'Budgets show as percentages, not dollars',
      body: 'At Scheduler tier, dollar figures are replaced with percentages, and the tool is view-only — no edit rights.',
    };
  }
  return {
    title: "You see your own home's numbers only",
    body: 'At House Lead tier, company-wide data is hidden — everything is view-only.',
  };
}

/**
 * Access-granted screen: who granted access and what it means, in one line.
 */
export function accessBlurb(role, provenance) {
  const t = ROLE_TIERS[role] ?? 99;
  const grantedBy = provenance === 'owner' ? 'Intrinsic' : 'the Owner who invited you';
  let means;
  if (t === 1) means = 'the top tier: every dollar visible, every control editable';
  else if (t <= 3) means = 'full dollar visibility and edit rights, one step below Owner';
  else if (t <= 6) means = 'day-to-day dollar figures and edit rights, but company-wide totals are hidden';
  else if (t === 7) means = 'budgets shown as percentages, not dollars — view only, no edit rights';
  else means = "your own home's numbers only — everything else is hidden, view only";
  return `${grantedBy} granted you ${ROLE_LABELS[role] ?? 'this'} access — ${means}.`;
}

/**
 * Done screen: checklist + "what's next", branched on provenance and tier.
 */
export function doneSummary(ctx) {
  const { role, provenance } = ctx;
  if (provenance === 'owner') {
    return {
      checklist: [
        'Account activated',
        'Assigned Owner access to one company — full visibility, full edit rights',
        'Configured your first service line',
      ],
      nextSteps: [
        'Add your remaining service lines from the Whole Company tab.',
        "Save after every change — Intrinsic doesn't assume you want it kept.",
        "Need a second company? Ask your Intrinsic administrator to assign it — licensees can't create companies directly.",
        'Invite your team when you\'re ready — tier controls what they see, not just what they can click.',
      ],
    };
  }

  const checklist = [
    `Account activated as ${ROLE_LABELS[role] ?? 'your role'}`,
    'Joined a company that\'s already modeled — nothing to set up',
  ];

  if (canAddServiceLine(role)) {
    return {
      checklist,
      nextSteps: [
        "Add a new service line from the Whole Company tab if this business needs one — that's available at your tier.",
        "Save after every change — Intrinsic doesn't assume you want it kept.",
        'Need access to a different company? Only the Owner can invite you to one.',
      ],
    };
  }

  const t = ROLE_TIERS[role] ?? 99;
  return {
    checklist,
    nextSteps: [
      `Explore what you have access to — dollars, edit rights, and visible tabs are all set by your ${ROLE_LABELS[role] ?? ''} tier.`,
      t <= 6
        ? "Save after every change — Intrinsic doesn't assume you want it kept."
        : "Everything here is view-only at your tier — there's nothing to save.",
      'Need broader access? Only the Owner can invite you at a higher tier.',
    ],
  };
}

// ── localStorage progress (per-user step pointer; server flag is authoritative) ──

const STORAGE_PREFIX = 'intrinsic_onboarding_v1:';

export function loadLocalProgress(uid) {
  if (!uid || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_PREFIX + uid);
  } catch {
    return null;
  }
}

export function saveLocalProgress(uid, step) {
  if (!uid || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + uid, step);
  } catch {
    // Storage unavailable (private mode, quota) — resume falls back to
    // the server's onboarding_completed_at flag only. Non-fatal.
  }
}

export function clearLocalProgress(uid) {
  if (!uid || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_PREFIX + uid);
  } catch {
    // no-op
  }
}
