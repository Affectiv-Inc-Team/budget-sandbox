/**
 * Company shape — data model definitions, factories, and migration helpers.
 *
 * NEW SHAPE (config blob saved to Supabase per company):
 *
 * {
 *   version: 2,
 *   selectedCompanyId: string,
 *   selectedServiceLineId: string | null,
 *   companies: [
 *     {
 *       id: string,
 *       name: string,
 *       archived: boolean,
 *       shared: {
 *         // Direct labor (used by all service lines)
 *         wage:           number,    // primary direct-care wage
 *         graveyardWage:  number,    // overnight wage (used by Res Hab)
 *         occupancy:      number,    // % company-wide occupancy / utilization
 *
 *         // Tax & entity (used for net-income calculation)
 *         entityType:     'ccorp' | 'scorp' | 'llc' | 'partnership' | 'soleprop',
 *         ownerRate:      number,    // owner's tax bracket (S-corp / pass-through)
 *
 *         // Fees applied to net revenue
 *         mgmtFeePct:     number,
 *         billingFeePct:  number,
 *
 *         // Res Hab rate overrides (mirrors legacy RATES_DEF)
 *         rates:          { intenseDaily, highDaily, iuUnit, igUnit },
 *
 *         // Cost rosters (legacy v1 lived flat; now lives here)
 *         mgmt:           [{ id, role, salary }],
 *         overhead:       [{ id, name, amount }],
 *
 *         // Cross-service-line allocation (forward-looking)
 *         sharedOverhead: { fixedAnnual, perHomePerMonth, perParticipantPerMonth, perCoordinatorPerMonth },
 *         allocationMethod: 'revenue' | 'headcount' | 'manual',
 *       },
 *       serviceLines: [
 *         {
 *           id: string,
 *           type: string,           // one of SERVICE_LINE_TYPES
 *           name: string,           // optional user-given label
 *           archived: boolean,
 *           overheadOverride: { method, value } | null,
 *           config: {...},          // type-specific config blob
 *         }
 *       ],
 *     }
 *   ],
 * }
 *
 * MIGRATION COVERAGE:
 *   - null/empty initialConfig    → one default empty company, no service lines
 *   - flat v1 (production shape)  → one company built from the flat fields,
 *                                   with RES_HAB_DAILY/HOURLY service lines
 *                                   constructed from homeTypes/hourlyPx if present
 *   - v1 with companies array     → each company migrated, flat fields promoted to shared
 *   - v2                          → returned as-is
 */

import { SERVICE_LINE_TYPES, getDefaultConfig } from '../serviceLines/types.js';

// Default Res Hab rates (mirror of legacy RATES_DEF in FinancialTool.jsx)
const DEFAULT_RES_HAB_RATES = { intenseDaily: 678.77, highDaily: 368.67, iuUnit: 7.07, igUnit: 3.61 };

// Default operating overhead (G&A) as a % of net revenue, applied on top of the
// management fee and billing fee. Covers rent/occupancy, insurance, admin
// software & billing systems, vehicles/travel, training & compliance,
// professional fees, office/supplies, recruiting, and technology.
export const DEFAULT_OVERHEAD_PCT = 12;

/**
 * Effective annual operating overhead for a company.
 * percent mode → % of net revenue; itemized mode → sum of line items.
 */
export function overheadTotalFor(shared = {}, netRevenue = 0) {
  const mode = shared.overheadMode ?? 'percent';
  if (mode === 'itemized') {
    return (shared.overhead ?? []).reduce((a, o) => a + (o.amount || 0), 0);
  }
  return Math.max(0, netRevenue) * ((shared.overheadPct ?? DEFAULT_OVERHEAD_PCT) / 100);
}

// ──────────────────────────────────────────────────────────────────────
// ID generation
// ──────────────────────────────────────────────────────────────────────
function genId(prefix = '') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + crypto.randomUUID().slice(0, 8);
  }
  return prefix + Math.random().toString(36).slice(2, 10);
}

export const idFor = {
  company:     () => genId('co_'),
  serviceLine: () => genId('sl_'),
};

// ──────────────────────────────────────────────────────────────────────
// Factories
// ──────────────────────────────────────────────────────────────────────

export function createSharedConfig(overrides = {}) {
  return {
    // Direct labor
    wage: 16,
    graveyardWage: 9.5,
    occupancy: 95,

    // Tax & entity
    entityType: 'ccorp',
    ownerRate: 32,

    // Fees
    mgmtFeePct: 5,
    billingFeePct: 1,

    // Res Hab rates (override of catalog defaults)
    rates: { ...DEFAULT_RES_HAB_RATES },

    // Cost rosters
    mgmt: [],
    overhead: [],

    // Operating overhead model:
    //   'percent'  → overhead = overheadPct % of net revenue (default standard)
    //   'itemized' → overhead = sum of the `overhead` line items
    overheadMode: 'percent',
    overheadPct: DEFAULT_OVERHEAD_PCT,


    // Forward-looking allocation
    sharedOverhead: {
      fixedAnnual: 0,
      perHomePerMonth: 0,
      perParticipantPerMonth: 0,
      perCoordinatorPerMonth: 0,
    },
    allocationMethod: 'revenue',

    // User-defined tab order for the Whole Company sub-tab strip (null = default SUB_TABS order)
    wholeCompanySubTabOrder: null,

    // Per-agency client census log — array of { id, month, serviceLineId, clientCount, notes }
    volumeLog: [],

    ...overrides,
  };
}

export function createServiceLine(type, overrides = {}) {
  return {
    id: idFor.serviceLine(),
    type,
    name: '',
    archived: false,
    overheadOverride: null,
    config: getDefaultConfig(type),
    subTabOrder: null,  // null = use SUB_TABS[type] default order
    ...overrides,
  };
}

export function createCompany(name, overrides = {}) {
  return {
    id: idFor.company(),
    name: name || 'New Company',
    archived: false,
    shared: createSharedConfig(),
    serviceLines: [],
    ...overrides,
  };
}

export function createEmptyConfig() {
  // Used when initialConfig is null — gives the licensee one company to work in.
  // Under Model 1 (SuperAdmin assignment) this branch only fires for unassigned
  // licensees; in practice a real licensee always has at least one assigned company.
  const c = createCompany('My Company');
  return {
    version: 2,
    selectedCompanyId: c.id,
    selectedServiceLineId: null,
    companies: [c],
  };
}

// ──────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────

export function isNewShape(config) {
  return config && typeof config === 'object' && config.version === 2;
}

export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    errors.push('Config is not an object');
    return errors;
  }
  if (!Array.isArray(config.companies)) {
    errors.push('config.companies must be an array');
    return errors;
  }
  for (const co of config.companies) {
    if (!co.id) errors.push(`Company ${co.name || '(unnamed)'} missing id`);
    if (!co.shared) errors.push(`Company ${co.name} missing shared config`);
    if (!Array.isArray(co.serviceLines)) {
      errors.push(`Company ${co.name} serviceLines must be an array`);
      continue;
    }
    for (const sl of co.serviceLines) {
      if (!sl.id) errors.push(`Service line in ${co.name} missing id`);
      if (!sl.type) errors.push(`Service line in ${co.name} missing type`);
      if (!sl.config) errors.push(`Service line ${sl.id} in ${co.name} missing config`);
    }
  }
  return errors;
}

// ──────────────────────────────────────────────────────────────────────
// Migration helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Expand legacy home-type entries (each with a numHomes multiplier) into
 * individual home objects (one entry = one physical home). Used when
 * migrating old saves that stored typed home groups in config.homes.
 */
function expandHomeTypes(homeTypes = []) {
  return homeTypes.flatMap(ht => {
    const count = ht.numHomes || 1;
    return Array.from({ length: count }, (_, i) => ({
      id: genId(),
      label: count > 1 ? `${ht.label} ${i + 1}` : ht.label,
      nHigh:             ht.nHigh,
      nIntense:          ht.nIntense,
      groupHrs:          ht.groupHrs,
      billingType:       ht.billingType,
      hhrsPerWeek:       ht.hhrsPerWeek       ?? 0,
      graveyardSleepHrs: ht.graveyardSleepHrs ?? 0,
    }));
  });
}

// ──────────────────────────────────────────────────────────────────────
// Migration
// ──────────────────────────────────────────────────────────────────────

/**
 * Convert any legacy config blob to v2.
 *
 * Production has FLAT v1 shape (no `companies` array): all data sits at
 * the top level (homeTypes, hourlyPx, wage, etc.). The dev branch had a
 * `companies` array variant. Both are handled here.
 */
/**
 * Forward-compat fixes applied to already-v2 configs on load.
 * Returns the same object when nothing changed (cheap no-op for the common case).
 *
 * - TSC rate edits: legacy blobs stored them under `config.rates`; the unified
 *   cross-module key is `config.rateOverrides`. Rename in place so prior user
 *   edits survive (the old value was the full merged set — copying it verbatim
 *   into rateOverrides yields an identical effective rate after the defaults merge).
 */
function normalizeV2(config) {
  let changed = false;
  const companies = (config.companies ?? []).map(co => {
    if (!Array.isArray(co.serviceLines)) return co;
    const serviceLines = co.serviceLines.map(sl => {
      if (sl?.type === SERVICE_LINE_TYPES.TSC &&
          sl.config && sl.config.rates && !sl.config.rateOverrides) {
        changed = true;
        const { rates, ...rest } = sl.config;
        return { ...sl, config: { ...rest, rateOverrides: rates } };
      }
      return sl;
    });
    // Seed volumeLog on companies that predate the feature
    let shared = co.shared && !co.shared.volumeLog
      ? (changed = true, { ...co.shared, volumeLog: [] })
      : co.shared;
    // Seed the overhead model. Companies that already itemized keep itemized;
    // everyone else picks up the percent-of-revenue standard.
    if (shared && !shared.overheadMode) {
      changed = true;
      shared = {
        ...shared,
        overheadMode: (shared.overhead ?? []).length > 0 ? 'itemized' : 'percent',
        overheadPct: shared.overheadPct ?? DEFAULT_OVERHEAD_PCT,
      };
    }
    return { ...co, serviceLines, shared };

  });
  return changed ? { ...config, companies } : config;
}

export function migrateConfig(oldConfig) {
  // No initial config → seed with one default empty company
  if (!oldConfig) return createEmptyConfig();

  // Already migrated — still run forward-compat normalizations on v2 blobs.
  if (isNewShape(oldConfig)) return normalizeV2(oldConfig);

  // Multi-company v1 (dev shape with `companies` array)
  if (Array.isArray(oldConfig.companies)) {
    const companies = oldConfig.companies.map(migrateOldCompany);
    return {
      version: 2,
      selectedCompanyId: oldConfig.selectedCompanyId || (companies[0]?.id ?? null),
      selectedServiceLineId: null,
      companies,
    };
  }

  // Flat v1 (production shape)
  const onlyCompany = migrateFlatV1(oldConfig);
  return {
    version: 2,
    selectedCompanyId: onlyCompany.id,
    selectedServiceLineId: null,
    companies: [onlyCompany],
  };
}

function migrateFlatV1(flat) {
  const id = idFor.company();

  const shared = createSharedConfig({
    wage:          flat.wage          ?? 16,
    graveyardWage: flat.graveyardWage  ?? 9.5,
    occupancy:     flat.occupancy      ?? 95,
    entityType:    flat.entityType     ?? 'ccorp',
    ownerRate:     flat.ownerRate      ?? 32,
    mgmtFeePct:    flat.mgmtFeePct     ?? 5,
    billingFeePct: flat.billingFeePct  ?? 1,
    rates:         flat.rates          ?? { ...DEFAULT_RES_HAB_RATES },
    mgmt:          flat.mgmt           ?? [],
    overhead:      flat.overhead       ?? [],
  });

  const serviceLines = [];

  // Daily homes → RES_HAB_DAILY (expand legacy home types into individual homes)
  if (Array.isArray(flat.homeTypes) && flat.homeTypes.length > 0) {
    serviceLines.push(createServiceLine(SERVICE_LINE_TYPES.RES_HAB_DAILY, {
      config: {
        indHomes: [
          ...expandHomeTypes(flat.homeTypes),
          ...(flat.indHomes ?? []),
        ],
      },
    }));
  }

  // Hourly participants → RES_HAB_HOURLY
  if (Array.isArray(flat.hourlyPx) && flat.hourlyPx.length > 0) {
    serviceLines.push(createServiceLine(SERVICE_LINE_TYPES.RES_HAB_HOURLY, {
      config: { participants: flat.hourlyPx },
    }));
  }

  return {
    id,
    name: 'My Company',
    archived: false,
    shared,
    serviceLines,
  };
}

function migrateOldCompany(oldCo) {
  const id = oldCo.id || idFor.company();

  const shared = createSharedConfig({
    wage:          oldCo.wage          ?? 16,
    graveyardWage: oldCo.graveyardWage ?? 9.5,
    occupancy:     oldCo.occupancy     ?? 95,
    entityType:    oldCo.entityType    ?? 'ccorp',
    ownerRate:     oldCo.ownerRate     ?? 32,
    mgmtFeePct:    oldCo.mgmtFeePct    ?? 5,
    billingFeePct: oldCo.billingFeePct ?? 1,
    rates:         oldCo.rates         ?? { ...DEFAULT_RES_HAB_RATES },
    mgmt:          oldCo.mgmt          ?? [],
    overhead:      oldCo.overhead      ?? [],
    sharedOverhead: oldCo.sharedOverhead ?? createSharedConfig().sharedOverhead,
    allocationMethod: oldCo.allocationMethod ?? 'revenue',
  });

  const serviceLines = [];

  if (Array.isArray(oldCo.indHomes) && oldCo.indHomes.length > 0) {
    // Already individual homes — use as-is, also expand any legacy typed homes
    serviceLines.push(createServiceLine(SERVICE_LINE_TYPES.RES_HAB_DAILY, {
      config: { indHomes: [
        ...expandHomeTypes(oldCo.homes ?? []),
        ...oldCo.indHomes,
      ]},
    }));
  } else if (Array.isArray(oldCo.homes) && oldCo.homes.length > 0) {
    serviceLines.push(createServiceLine(SERVICE_LINE_TYPES.RES_HAB_DAILY, {
      config: { indHomes: expandHomeTypes(oldCo.homes) },
    }));
  } else if (Array.isArray(oldCo.homeTypes) && oldCo.homeTypes.length > 0) {
    serviceLines.push(createServiceLine(SERVICE_LINE_TYPES.RES_HAB_DAILY, {
      config: { indHomes: expandHomeTypes(oldCo.homeTypes) },
    }));
  }

  if (Array.isArray(oldCo.hourlyParticipants) && oldCo.hourlyParticipants.length > 0) {
    serviceLines.push(createServiceLine(SERVICE_LINE_TYPES.RES_HAB_HOURLY, {
      config: { participants: oldCo.hourlyParticipants },
    }));
  } else if (Array.isArray(oldCo.hourlyPx) && oldCo.hourlyPx.length > 0) {
    serviceLines.push(createServiceLine(SERVICE_LINE_TYPES.RES_HAB_HOURLY, {
      config: { participants: oldCo.hourlyPx },
    }));
  }

  return {
    id,
    name: oldCo.name || 'Unnamed Company',
    archived: oldCo.archived ?? false,
    shared,
    serviceLines,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Convenience selectors
// ──────────────────────────────────────────────────────────────────────

export function getSelectedCompany(config) {
  if (!config?.companies) return null;
  return config.companies.find(c => c.id === config.selectedCompanyId) || null;
}

export function getSelectedServiceLine(config) {
  const co = getSelectedCompany(config);
  if (!co) return null;
  return co.serviceLines.find(sl => sl.id === config.selectedServiceLineId) || null;
}

export function getServiceLineByType(config, companyId, type) {
  const co = config?.companies?.find(c => c.id === companyId);
  if (!co) return null;
  return co.serviceLines.find(sl => sl.type === type && !sl.archived) || null;
}
