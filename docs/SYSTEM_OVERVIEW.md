# Intrinsic — System Overview

> **Live URL (decided):** `finance.intrinsic.agency`
> **Next step:** Publish through [Lovable](https://lovable.dev) — see [Deployment](#deployment) below.

---

## Table of Contents

1. [What Intrinsic Is](#what-intrinsic-is)
2. [Users & Access Model](#users--access-model)
3. [Tech Stack](#tech-stack)
4. [Repository Layout](#repository-layout)
5. [Core Data Model](#core-data-model)
6. [Service Lines](#service-lines)
7. [Rate Catalog](#rate-catalog)
8. [Financial Calculators](#financial-calculators)
9. [Authentication & Database](#authentication--database)
10. [Test Suite](#test-suite)
11. [Deployment](#deployment)
12. [Build Tracks](#build-tracks)
13. [Key Architectural Decisions](#key-architectural-decisions)
14. [Agentic Coding Guide](#agentic-coding-guide)
15. [Document Map](#document-map)

---

## What Intrinsic Is

Intrinsic is a **HIPAA-compliant, multi-tenant SaaS** for HCBS (Home and Community-Based Services) and IDD (Intellectual and Developmental Disabilities) provider agencies operating in Idaho. The core product is a **financial modeling tool**: users model service-line profitability given their staffing mix, caseloads, Medicaid reimbursement rates, and overhead structure.

**Current geographic scope:** Idaho only. Utah, Nevada, and Arizona are deferred for v2.

### Terminology

| Term | Meaning |
|---|---|
| **Licensee** | The SaaS subscriber — a provider agency paying for Intrinsic |
| **Company** | A portfolio company being financially modeled |
| **Service line** | A distinct billing/operating model within a company (e.g., TSC, Res Hab Daily) |
| **Archetype** | A family of service lines sharing a financial model structure |

---

## Users & Access Model

Access follows **Model 1** — SuperAdmin-only provisioning:

- Only **SuperAdmin** (Intrinsic Inc staff) can create companies and assign them to licensees.
- **Licensees** see only the companies assigned to them; they cannot create companies.
- The junction table `licensee_companies` (M2M) carries the assignment plus a `role` column (`read-only` / `editor`).
- Row-Level Security on Supabase enforces all access boundaries at the database layer.

See [docs/access-levels-and-rights.md](access-levels-and-rights.md) and [docs/access-levels-progress.md](access-levels-progress.md) for the full access matrix and implementation progress.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React (JSX) |
| Auth / Database | Supabase (Postgres + RLS + Auth) |
| Deployment target | Lovable → `finance.intrinsic.agency` |
| Infrastructure | AWS ECS Fargate (planned) |
| Analytics | PostHog (HIPAA-masked; no BAA on free plan) |
| Testing | Vitest 2.1 + @testing-library/react + Playwright (Chromium) |
| CI | GitHub Actions — gates `main` on `unit` + `integration` checks |

---

## Repository Layout

The full intended source tree is documented in [`PROJECT_DIRECTORY.md`](../PROJECT_DIRECTORY.md). Summary:

```
src/
  main.jsx                 ← Vite entry
  App.jsx                  ← top-level router
  supabase.js              ← Supabase client + loadConfig/saveConfig helpers
  pages/
    LoginPage.jsx          ← auth UI
    ToolPage.jsx           ← shell that mounts FinancialTool
    AdminPanel.jsx         ← SuperAdmin provisioning UI (Track B)
    FinancialTool.jsx      ← ★ 3,200-line main tool (all UI + App())
  lib/
    companyShape.js        ← v2 data model, factories, migration, selectors
  serviceLines/
    types.js               ← 25-type registry (SERVICE_LINE_TYPES, ARCHETYPES, SERVICE_LINE_DEFS)
    tsc.jsx                ← TSC module (the pattern for all future service lines)
  data/
    idahoRates.js          ← flat rate catalog (~150 records + hospice county matrix)

supabase/
  migrations/              ← canonical Lovable squash migration (single file)

docs/                      ← all specification and reference documents
```

> **Important:** `FinancialTool.jsx` is intentionally a single large file. Do not split it without discussion. Navigate by search: `calcHome`, `SUB_TABS`, `export default function App`.

---

## Core Data Model

All application state lives in a single **v2 config blob** stored as JSONB in Supabase:

```js
{
  version: 2,
  selectedCompanyId: string,
  selectedServiceLineId: string | null,
  companies: [
    {
      id: "co_xxxxxxxx",
      name: string,
      archived: boolean,
      shared: {
        wage, graveyardWage, occupancy,         // direct labor
        entityType, ownerRate,                  // tax / entity
        mgmtFeePct, billingFeePct,              // fees
        rates: { intenseDaily, highDaily, iuUnit, igUnit },  // Res Hab overrides
        mgmt: [{ id, role, salary }],
        overhead: [{ id, name, amount }],
        sharedOverhead: { fixedAnnual, perHomePerMonth, … },
        allocationMethod: 'revenue' | 'headcount' | 'manual',
      },
      serviceLines: [
        {
          id: "sl_xxxxxxxx",
          type: string,          // one of SERVICE_LINE_TYPES
          name: string,
          archived: boolean,
          overheadOverride: null | { method, value },
          config: { …type-specific… },
        }
      ],
    }
  ],
}
```

`migrateConfig()` in [`src/lib/companyShape.js`](../src/lib/companyShape.js) upgrades any legacy flat-v1 Supabase save to this shape on first load. It is the single source of truth for the data shape — never mutate migration paths; always add a new version branch.

All state mutations go through `updateShared()` or `updateServiceLineConfig()` in `App()`. Never mutate the config object directly.

---

## Service Lines

There are **25 registered service line types** across 11 archetype families. See [`src/serviceLines/types.js`](../src/serviceLines/types.js) for the full registry.

### Status tiers

| Status | Meaning |
|---|---|
| `active` | Full UI + financial calculator implemented |
| `catalog` | Rate data exists; renders as a read-only rate table (`CatalogPlaceholder`) |
| `planned` | Reserved; not yet selectable |

### Currently active service lines

| Type | Description |
|---|---|
| `RES_HAB_DAILY` | Residential Habilitation — daily-rate homes |
| `RES_HAB_HOURLY` | Residential Habilitation — hourly-rate homes |
| `TSC` | Targeted Service Coordination |
| `CHILDRENS_DDA` | Children's Developmental Disabilities Administration |
| `VOC_SERVICES` | Vocational Services (CSE) |
| `SCHOOL_BASED` | School-Based services (with nested school-level rate overrides) |

### Behavioral Health split

BH was intentionally split into **7 separate service lines** (not collapsed) because their financial models differ materially:
`BH_OUTPATIENT`, `BH_CBRS`, `BH_CRISIS`, `BH_CHILDRENS_IHCBS`, `BH_SUD`, `BH_DAY_TREATMENT`, `BH_SSH`.
All 7 are currently `catalog` status. BH rates are Magellan IBHP effective 4/13/2026.

### Adding a new active service line

Full checklist in [`PROJECT_DIRECTORY.md`](../PROJECT_DIRECTORY.md#checklist-adding-a-new-service-line). Short version:
1. Create `src/serviceLines/<camelCase>.jsx` — mirror `tsc.jsx` exactly
2. Add sub-tab entries to `SUB_TABS` in `FinancialTool.jsx`
3. Add render cases in the App render switch
4. Flip `status` from `'catalog'` → `'active'` in `types.js`

---

## Rate Catalog

All rates live in [`src/data/idahoRates.js`](../src/data/idahoRates.js) — a flat array of ~150 records accessed via `ratesForLine(type)`.

Key facts:
- All rates are **post-9/1/2025** (4% reduction already applied). No pre-reduction rates exist.
- `Rate Effective 9/1/2025` columns in fee schedules **are** the post-reduction rates — no compare-and-pick logic needed.
- BH rates are Magellan IBHP effective 4/13/2026 (~50 representative codes; full ~250 deferred until licensee demand surfaces it).
- When a second state is added, create a parallel `utahRates.js` and add a state-aware `ratesForLine(type, state)` wrapper — do not fork `idahoRates.js`.

Full rate specification: [`docs/service-rate-spec.md`](service-rate-spec.md)

---

## Financial Calculators

### Ratios & thresholds

Every ratio, default value, threshold, and derived calculation is documented in [`docs/service-line-ratios.md`](service-line-ratios.md). This is the authoritative reference — update it whenever calculator values change.

### Labor efficiency rating

Res Hab homes are rated on their labor-to-revenue ratio:

| Status | Threshold | Label | Color |
|---|---|---|---|
| `incomplete` | total = 0 | Configure Home | slate |
| `approved` | < 47% | Approved | green |
| `needs_review` | 47–58% | Needs Review | amber |
| `concerning` | 58–68% | Concerning | orange |
| `rejected` | ≥ 68% | Not Viable | red |

Specification: [`spec.md`](../spec.md)

### TSC calculator

Full specification including roster, productivity, and P&L tabs: [`docs/TSC-spec.md`](TSC-spec.md) and [`docs/TSC_Reimbursement_Panel_Instructions.md`](TSC_Reimbursement_Panel_Instructions.md)

### School-Based nested overrides

School-Based service lines support nested school-level rate overrides. Specification: [`docs/school-based-spec.md`](school-based-spec.md)

---

## Authentication & Database

### Auth flow

Supabase email/password auth. Login triggers `loadConfig` (current) → will become `loadAssignedCompanies` in Track B.

Full auth implementation plan: [`docs/AUTH_IMPLEMENTATION.md`](AUTH_IMPLEMENTATION.md)

### Database schema

The canonical schema lives in a **single Lovable-owned squash migration** under `supabase/migrations/`. Key tables:

| Table | Purpose |
|---|---|
| `profiles` | One row per authenticated user; links to `auth.users` |
| `companies` | Portfolio companies with JSONB `config` column (v2 blob) |
| `licensees` | SaaS subscriber accounts |
| `licensee_companies` | M2M junction: which licensees can see which companies |
| Referral tracker | Client referral pipeline tables (see [docs/referrals-schema.md](referrals-schema.md)) |

RLS policies enforce the access model at the database layer. There is a **known RLS over-restriction** finding open for non-super-admin users — see [`docs/prod-release/rls-licensee-access-fix.md`](prod-release/rls-licensee-access-fix.md).

Supabase setup guide: [`docs/SUPABASE_SETUP.md`](SUPABASE_SETUP.md)

> **Migration ownership:** Lovable owns migrations. It emits a single full-schema squash as the canonical file. Never re-add old hand-authored migrations alongside it — they define the same objects and cause `relation already exists (42P07)` on `db reset`. New schema changes should come through Lovable or be hand-written as a **new numbered file** that doesn't duplicate the squash.

---

## Test Suite

The test suite is fully implemented across four phases. Status: [`docs/TEST_STATUS.md`](TEST_STATUS.md)

| Suite | Count | Runner |
|---|---|---|
| Unit / component | 279 tests | Vitest |
| Integration | 21 tests | Vitest + local Supabase Docker |
| E2E | 7 tests | Playwright (Chromium) |

### Run commands

```bash
# Unit + component (no external dependencies)
npm test
npm run test:watch
npm run test:coverage

# Integration (requires Docker + local Supabase)
supabase start
supabase db reset
npm run test:integration

# E2E (Playwright starts the dev server automatically)
supabase start
npx playwright install chromium   # one-time
npm run test:e2e
npm run test:e2e:ui               # interactive mode
npx playwright show-report        # view HTML report
```

### CI

GitHub Actions gates `main` on the `unit` and `integration` checks. Every PR must pass before merge. Lovable's bot (`lovable-dev[bot]`) has bypass access for its direct-to-main deploy pushes.

**Integration tests always run against a local ephemeral Supabase — never production.** A localhost guardrail in `tests/integration/setup.js` enforces this hard.

Known gotcha: the integration tenant join is **case-sensitive on email**. Always use lowercase `emailPrefix` in test inserts or joins fail with `42501`.

Phase-by-phase notes: [docs/TEST_PHASE_1.md](TEST_PHASE_1.md) · [docs/TEST_PHASE_2.md](TEST_PHASE_2.md) · [docs/TEST_PHASE_3.md](TEST_PHASE_3.md) · [docs/TEST_PHASE_4.md](TEST_PHASE_4.md)

---

## Deployment

### Decided subdomain

> **`finance.intrinsic.agency`**

This is the confirmed production URL for the Intrinsic financial modeling tool.

### Next steps: publish through Lovable

1. Open the project in [Lovable](https://lovable.dev).
2. Configure the custom domain `finance.intrinsic.agency` in Lovable's domain settings.
3. Point the DNS `CNAME` for `finance` at Lovable's target (shown in their dashboard).
4. Trigger a deploy from the `main` branch — Lovable automatically deploys on push.
5. Verify the Supabase Auth `Site URL` and `Redirect URLs` include `https://finance.intrinsic.agency`.

### Verification checklist before going live

- [ ] Run `npx esbuild src/pages/FinancialTool.jsx --bundle=false --loader:.jsx=jsx` — no errors
- [ ] Run `npm run test:e2e` against local Supabase — all passing
- [ ] Test against a real Supabase config blob (flat v1 shape) to verify `migrateConfig()` is correct
- [ ] Confirm RLS over-restriction fix is merged ([docs/prod-release/rls-licensee-access-fix.md](prod-release/rls-licensee-access-fix.md))
- [ ] Confirm PostHog masking is active (`ph-no-capture` on all PII fields) — [posthog-setup-report.md](../posthog-setup-report.md)

---

## Build Tracks

### Track A — JSX refactor (complete)

Five new files, rewritten `App()`, v2 config blob. Works against the existing data layer. Pending local verification. Full build history: [`intrinsic-build-history.md`](../intrinsic-build-history.md)

### Track B — Supabase schema + SuperAdmin UI (not started)

| Work item | Status |
|---|---|
| `companies` table — JSONB `config` column | Pending |
| `licensees` table | Pending |
| `licensee_companies` M2M junction | Pending |
| `super_admins` flag | Pending |
| RLS policies (licensee SELECT/UPDATE gate + SuperAdmin bypass) | Pending |
| `loadAssignedCompanies()` in `supabase.js` | Pending |
| SuperAdmin provisioning UI in `AdminPanel.jsx` | Pending |
| Login flow: load assigned companies on sign-in | Pending |

`FinancialTool.jsx`'s `handleSave` already passes the full v2 blob to `onSave` verbatim — the data shape is Track-B-ready. Only the persistence and access layers need updating.

Full Track B checklist: [`PROJECT_DIRECTORY.md`](../PROJECT_DIRECTORY.md#checklist-track-b-kickoff)

---

## Key Architectural Decisions

These are locked and should not be revisited without discussion:

- **Single-file tool:** `FinancialTool.jsx` is intentionally monolithic. Components are co-located, not split into separate files, to minimize diff surface during the Track A refactor.
- **Immutable state mutations:** All config changes go through `updateShared()` or `updateServiceLineConfig()` in `App()`. Direct mutation is forbidden.
- **Adapter setters:** Existing components (`HomeTypeCard`, `HomeMixEditor`, `HourlyTab`, etc.) were preserved verbatim. `App()` exposes adapter setters (`setWage`, `setHomeTypes`, etc.) that dispatch into the v2 shape. Do not refactor the component prop signatures.
- **Idaho-only for v1:** All rates are post-9/1/2025 4% reduction. Do not add pre-reduction rates or other states until multi-state work begins.
- **No compare-and-pick:** The `Rate Effective 9/1/2025` column in fee schedules is the post-reduction rate. Use it directly.
- **BH = 7 lines:** Behavioral health is 7 separate service lines, not one collapsed line, because their financial models differ materially.
- **Lovable owns migrations:** Never commit competing migration files. One canonical squash; new schema changes go through Lovable or as a new numbered file.

---

## Agentic Coding Guide

This section is written specifically for AI coding assistants (Claude Code, Cursor, Copilot, etc.) working in this repo. Read it before making any change. The canonical source for all locked decisions is [`CLAUDE.md`](../CLAUDE.md) — treat it as the override layer.

---

### Before you touch any file

1. **Read `CLAUDE.md` first.** It contains locked architectural decisions that must not be revisited.
2. **Run esbuild before declaring code done:**
   ```bash
   npx esbuild src/pages/FinancialTool.jsx --bundle=false --loader:.jsx=jsx
   ```
   The dev server does not catch all parse errors. esbuild has caught `.js` vs `.jsx` loader mismatches that Vite missed. Run it on every modified JSX file.
3. **Never commit directly to `main`.** Always branch from `main`, work on the branch, and open a PR. CI (`unit` + `integration`) must pass before merge.

---

### State mutations — the only correct pattern

All config writes go through two helpers in `App()` inside `FinancialTool.jsx`. **Never mutate the config object directly.**

```js
// Mutate a shared (company-level) field
updateShared("wage", 18);

// Mutate a service line config field
updateServiceLineConfig(sl.id, cfg => ({ ...cfg, coordinators: [...cfg.coordinators, newCoord] }));
```

If you find yourself writing `config.companies[i].shared.wage = 18`, stop — that's wrong.

---

### Adapter setters

Existing components (`HomeTypeCard`, `HomeMixEditor`, `HourlyTab`, etc.) were preserved verbatim during the Track A refactor. Their prop signatures were not changed. `App()` exposes adapter setters like `setWage`, `setHomeTypes`, `setHourlyPx` that translate calls into v2-shape mutations.

**Do not refactor component prop signatures.** The adapter layer is intentional — it decouples the component API from the v2 state shape.

---

### `ensureSLAndUpdate`

Service line config writes auto-create the service line if it doesn't exist yet. This is how `setHomeTypes` and `setHourlyPx` work — the SL is lazily created on first edit. If you are writing a new adapter setter that touches `serviceLines`, follow this pattern.

---

### Navigation in `FinancialTool.jsx`

The file is ~3,200 lines. Navigate by searching for these landmarks:

| Search term | Finds |
|---|---|
| `calcHome` | Residential Hab calculator |
| `calcSLCo` | Company-level P&L aggregator |
| `SUB_TABS` | Tab routing map — add entries here for new service lines |
| `case 'tsc_roster'` | Reference render case in the App render switch |
| `export default function App` | Top of the main component |
| `LABOR_APPROVAL_THRESHOLDS` | Labor efficiency threshold constants |
| `createSharedConfig` | Default values for every shared field |

---

### Adding a new active service line — step by step

This is the highest-risk operation in the codebase. Follow the checklist exactly:

1. **Create** `src/serviceLines/<camelCaseName>.jsx`
   - Mirror `tsc.jsx` exactly in structure
   - Export a pure `calc<TYPE>Service(config)` function at the top
   - Export tab components (`<TYPE>RosterTab`, `<TYPE>PLTab`, etc.) as named exports
   - No default export

2. **Add sub-tab entries** to `SUB_TABS` in `FinancialTool.jsx`

3. **Add render cases** in the App render switch (search `case 'tsc_roster'` as the reference)

4. **Flip status** in `src/serviceLines/types.js`:
   ```js
   // Change this:
   status: 'catalog'
   // To:
   status: 'active'
   ```

5. **Verify with esbuild** on both the new module and `FinancialTool.jsx`

6. **Test end-to-end:** add the SL in dev, enter data, verify numbers, save, reload, confirm numbers persist

No other changes to `types.js` are needed — the type is already registered.

---

### Data model versioning

`migrateConfig()` in `companyShape.js` upgrades any legacy save to the current v2 shape. If the shape ever needs to change:

- Bump `version` to `3`
- Add a `migrateV2toV3()` branch
- **Never mutate existing migration paths** — old saves in production depend on them

---

### Rate data rules

- All rates are post-9/1/2025 (4% reduction already applied). Do not add pre-reduction rates.
- Use `ratesForLine(type)` to filter — never access the flat array directly in components.
- When a new state is added, create a parallel file (e.g. `utahRates.js`) and a state-aware wrapper. Do not fork `idahoRates.js`.
- BH rate catalog has ~50 representative codes. Do not expand speculatively — wait for licensee demand.

---

### Migration rules

- Lovable owns migrations. It emits a single full-schema squash as the canonical file.
- **Never re-add old hand-authored migrations alongside the squash.** They define the same objects and cause `relation already exists (42P07)` on `db reset`.
- New schema changes: go through Lovable, or write a new numbered file that adds only net-new objects.
- Never commit one-off data ops (e.g. `postgres_fdw` copies) as migration files — they run during `db reset` and can reach external DBs.

---

### Common gotchas

| Symptom | Root cause | Fix |
|---|---|---|
| `relation "profiles" already exists (42P07)` on `db reset` | Duplicate migration files | Remove old hand-authored migrations; keep only the Lovable squash |
| Integration test fails with `42501` | Email case sensitivity in tenant join | Use lowercase `emailPrefix` in all test inserts |
| Dev server passes, esbuild fails | `.js` vs `.jsx` loader mismatch on an import | Fix the extension on the import path |
| Brace/tag mismatch error deep in `FinancialTool.jsx` | JSX tag imbalance looks like `}` mismatch downstream | Check JSX tag balance separately from brace balance — they need different tools to diagnose |
| Company name migrated as `'My Company'` | `migrateFlatV1()` hardcodes the name | Verify the production Supabase record's name field before first deploy |

---

### Verification standard (required before any PR)

```bash
# 1. Parse check every modified JSX file
npx esbuild src/pages/FinancialTool.jsx --bundle=false --loader:.jsx=jsx

# 2. Unit tests
npm test

# 3. If touching persistence or RLS:
supabase start && supabase db reset && npm run test:integration

# 4. If touching any user-facing flow:
npm run test:e2e
```

Do not declare code complete until esbuild exits clean and the relevant test tier passes.

---

| Document | What it covers |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | AI assistant context — architecture decisions, terminology, gotchas, locked choices |
| [`PROJECT_DIRECTORY.md`](../PROJECT_DIRECTORY.md) | Full source tree, import path rules, where new files go, checklists |
| [`intrinsic-build-history.md`](../intrinsic-build-history.md) | Chronological build log for Track A |
| [`docs/service-line-ratios.md`](service-line-ratios.md) | Every ratio, default, threshold, and formula used in all calculators |
| [`docs/service-rate-spec.md`](service-rate-spec.md) | Idaho rate catalog structure and code-to-rate mapping |
| [`docs/TSC-spec.md`](TSC-spec.md) | TSC service line calculator specification |
| [`docs/TSC_Reimbursement_Panel_Instructions.md`](TSC_Reimbursement_Panel_Instructions.md) | TSC reimbursement panel user instructions |
| [`docs/school-based-spec.md`](school-based-spec.md) | School-Based service line with nested overrides |
| [`docs/AUTH_IMPLEMENTATION.md`](AUTH_IMPLEMENTATION.md) | Track B auth wiring plan |
| [`docs/SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | Local Supabase setup guide |
| [`docs/access-levels-and-rights.md`](access-levels-and-rights.md) | Full access matrix (SuperAdmin / Licensee / Viewer) |
| [`docs/access-levels-progress.md`](access-levels-progress.md) | Access level implementation progress |
| [`docs/referrals-schema.md`](referrals-schema.md) | Referral tracker database schema |
| [`docs/referral-integration-plan.md`](referral-integration-plan.md) | Referral tracker integration plan |
| [`docs/TEST_STATUS.md`](TEST_STATUS.md) | Test suite status and run commands |
| [`docs/TEST_PHASE_1.md`](TEST_PHASE_1.md) – [`TEST_PHASE_4.md`](TEST_PHASE_4.md) | Per-phase test implementation notes |
| [`docs/prod-release/rls-licensee-access-fix.md`](prod-release/rls-licensee-access-fix.md) | Open RLS over-restriction finding |
| [`docs/bi-billing-code-discrepancy.md`](bi-billing-code-discrepancy.md) | BI billing code discrepancy notes |
| [`posthog-setup-report.md`](../posthog-setup-report.md) | PostHog analytics setup + HIPAA masking report |
| [`spec.md`](../spec.md) | "Concerning" labor efficiency rating category spec |
