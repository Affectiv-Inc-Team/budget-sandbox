# Intrinsic — Claude Code Project Context

## What this project is

Intrinsic is a HIPAA-compliant, multi-tenant SaaS for HCBS (Home and Community-Based Services)
and IDD provider agencies. The core product is a financial modeling tool: users model service
line profitability given their staffing, caseloads, Medicaid rates, and overhead.

**Current geographic scope:** Idaho only (UT/NV/AZ deferred).
**Stack:** Vite + React frontend · Supabase auth/db · AWS ECS Fargate deployment.

---

## Terminology — read this first

| Term | Meaning |
|---|---|
| **Licensee** | The SaaS subscriber (a provider agency paying for Intrinsic) |
| **Company** | A portfolio company — the operating entity being financially modeled |
| **Service line** | A distinct billing/operating model within a company (e.g., TSC, Res Hab Daily) |
| **Archetype** | A family of service lines sharing a financial model (e.g., caseload coordinator, per-diem residential) |
| **Track A** | JSX tool refactor — complete, pending local verification |
| **Track B** | Supabase schema + SuperAdmin provisioning UI — not started |

In-app, "company" always means portfolio company. Use "licensee" for the SaaS subscriber.

---

## Architecture decisions — locked, do not revisit

### Access model: Model 1
- Only SuperAdmin (Intrinsic Inc) provisions companies and assigns licensee access.
- Licensees cannot create companies — they only see ones assigned to them.
- Requires M2M `licensee_companies` junction table and RLS policies (Track B work).
- The in-app empty-state fallback for "no companies assigned" already exists in `FinancialTool.jsx`.

### Two-track build
- **Track A** (done): JSX refactor — five new files, rewritten `App()`, v2 config blob.
- **Track B** (not started): Supabase schema, RLS, SuperAdmin admin UI, `supabase.js` updates.
- Track A works against the existing data layer. Track B does not need to land before Track A
  is testable.

### Idaho-only for v1
All rates are post-9/1/2025 4% reduction. BH rates are Magellan IBHP effective 4/13/2026.
Do not add pre-reduction rates. Do not add rates for other states until multi-state work begins.

### Rate handling
The `Rate Effective 9/1/2025` columns in fee schedules ARE the post-reduction rates.
No compare-and-pick logic needed — use the schedule rates directly.

### Behavioral health: 7 separate service lines
BH was intentionally split into 7 lines (not collapsed into one) because their financial
models differ materially: BH_OUTPATIENT, BH_CBRS, BH_CRISIS, BH_CHILDRENS_IHCBS, BH_SUD,
BH_DAY_TREATMENT, BH_SSH.

---

## v2 config blob — the central data structure

Every piece of app state lives inside a single config object stored as JSONB in Supabase.

```
{
  version: 2,
  selectedCompanyId: string,
  selectedServiceLineId: string | null,
  companies: [
    {
      id: string,                          // co_xxxxxxxx
      name: string,
      archived: boolean,
      shared: {
        wage, graveyardWage, occupancy,    // direct labor
        entityType, ownerRate,             // tax / entity
        mgmtFeePct, billingFeePct,         // fees
        rates: { intenseDaily, highDaily, iuUnit, igUnit },  // Res Hab overrides
        mgmt: [{ id, role, salary }],
        overhead: [{ id, name, amount }],
        sharedOverhead: { fixedAnnual, perHomePerMonth, … },
        allocationMethod: 'revenue' | 'headcount' | 'manual',
      },
      serviceLines: [
        {
          id: string,                      // sl_xxxxxxxx
          type: string,                    // one of SERVICE_LINE_TYPES
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

`migrateConfig()` in `src/lib/companyShape.js` upgrades any legacy Supabase save to this shape
on first load. It handles: null/empty → seed one company; flat v1 (production) → one migrated
company; v1 with companies array → each company migrated; v2 → returned as-is.

---

## File map

```
src/
  pages/
    FinancialTool.jsx     ← 3,197-line main file; all components + App() live here
  lib/
    companyShape.js       ← v2 data model, factories, migration, selectors
  serviceLines/
    types.js              ← SERVICE_LINE_TYPES, ARCHETYPES, SERVICE_LINE_DEFS (25 types)
    tsc.jsx               ← TSC module: calcTSCService, TSCRosterTab, TSCProductivityTab, TSCPLTab
  data/
    idahoRates.js         ← flat rate catalog (~150 records) + hospice county matrix
```

Supporting files (existing, not replaced by Track A):
```
src/
  App.jsx                 ← top-level router, wraps FinancialTool
  pages/
    LoginPage.jsx
    AdminPanel.jsx        ← will be extended in Track B
    ToolPage.jsx
  main.jsx
  supabase.js             ← loadConfig / saveConfig (will gain loadAssignedCompanies in Track B)
```

---

## Key patterns — follow these exactly

### State mutations
All config mutations go through `updateShared()` or `updateServiceLineConfig()` in `App()`.
Never mutate the config object directly. Both follow immutable update:
```js
// shared field
updateShared("wage", 18);

// service line config
updateServiceLineConfig(sl.id, cfg => ({ ...cfg, coordinators: [...cfg.coordinators, newCoord] }));
```

### Adapter setters
Existing components (`HomeTypeCard`, `HomeMixEditor`, `HourlyTab`, etc.) were preserved
verbatim — their prop signatures were not changed. `App()` exposes adapter setters like
`setWage`, `setHomeTypes`, `setHourlyPx` that dispatch into the v2 shape. Do not remove
these or refactor the component prop signatures — the adapter layer is intentional.

### ensureSLAndUpdate
Service line config writes auto-create the SL if it doesn't exist. This is how
`setHomeTypes` and `setHourlyPx` work — the SL is lazily created on first edit.

### SUB_TABS routing
Navigation is driven by `activeKey` (`"WHOLE_COMPANY"` or a service line `id`) plus a
`subTab` string. The `SUB_TABS` object in `FinancialTool.jsx` maps service line type → array
of sub-tab descriptors. Adding a new service line requires entries here plus routing in
the App render switch.

### Adding a new service line (the full pattern)
1. Create `src/serviceLines/<TYPE>.jsx` — export `calc<TYPE>Service()` and tab components.
   Mirror `tsc.jsx` exactly.
2. Add sub-tab entries to `SUB_TABS` in `FinancialTool.jsx`.
3. Add render cases in the App render switch (search for `case 'tsc_roster'` as a reference).
4. In `src/serviceLines/types.js`, change the type's `status` from `'catalog'` to `'active'`.
5. The type is already registered — no other changes to `types.js` are needed.

---

## Service line status

| Status | Meaning |
|---|---|
| `active` | Full UI + calculator implemented |
| `catalog` | Rate data exists; renders as `CatalogPlaceholder` (read-only rate table) |
| `planned` | Reserved; not yet pickable in the picker |

Currently `active`: `RES_HAB_DAILY`, `RES_HAB_HOURLY`, `TSC`.
All other 22 types are `catalog`.

---

## Rate data

`src/data/idahoRates.js` exports a flat array. Access via `ratesForLine(type)` which filters
by `serviceLineType`. All rates are post-9/1/2025. BH rates are Magellan IBHP 4/13/2026.

The BH rate catalog currently has ~50 representative codes out of a full ~250. Expansion is
deferred until licensee demand surfaces it — do not expand speculatively.

---

## Database, migrations & CI — read before touching schema or `main`

**Repo:** `Affectiv-Inc-Team/budget-sandbox` (formerly `AffectivBilling`). Lovable deploys to
the production Supabase backend **from the `main` branch**.

### Migration ownership: Lovable
Lovable owns the database migrations. It introspects the cloud DB and emits a single
**full-schema squash** as the canonical migration:

- `supabase/migrations/20260615201552_fcac4baf-…​.sql` — the entire schema (profiles,
  licensees, companies, licensee_companies, referral tracker + RLS, triggers, grants, SSN
  RPCs). This is the source of truth that `supabase db reset` builds from.

Do **not** re-add the old per-feature hand-authored migrations (`initial_schema`, `grant_*`,
`referral_tracker`, …). They define the same objects as the squash and cause
`relation "profiles" already exists (42P07)` when both are present. Keep exactly **one**
canonical schema migration in the folder. New schema changes should come through Lovable; if
hand-written, they must not duplicate objects the squash already creates. Never commit one-off
data ops (e.g. `postgres_fdw` copies) as migration files — they run during `db reset`, reach
external DBs, and have leaked credentials before.

### CI gating on `main`
A repository ruleset protects `main`: changes must land via PR and pass the **`unit`** and
**`integration`** checks before merge, so tests run before Lovable deploys. The Lovable app
(`lovable-dev[bot]`) is a bypass actor, so its direct-to-main deploy pushes still work.

### Tests are the regression gate
A Vitest + Playwright suite exists: `npm test` (unit/component), `npm run test:integration`,
`npm run test:e2e`. The **integration suite runs against a local, ephemeral Supabase (Docker),
reset from the migration each run — never Lovable/production**; a localhost guardrail in
`tests/integration/setup.js` enforces this. That local instance *is* the isolated test DB —
do not point it at a hosted backend.

---

## Track B — what's coming next

### Supabase schema additions needed
- `companies` table — JSONB `config` column for the v2 blob
- `licensees` table — may rename existing `companies` table
- `licensee_companies` — M2M junction: `licensee_id`, `company_id`, `role` (read-only/editor), `assigned_at`
- `super_admins` — flag on profiles or separate table

### RLS policies needed
- Licensees: SELECT/UPDATE only companies they have a row in `licensee_companies` for
- SuperAdmin: bypass policy

### Application code changes needed
- `src/supabase.js`: add `loadAssignedCompanies()`, `saveCompany(companyId, config)`, super-admin helpers
- `src/pages/AdminPanel.jsx`: company create/assign/revoke UI
- Login flow: load all assigned companies on sign-in, default to first

### What does NOT need to change for Track B
`FinancialTool.jsx` `handleSave` already passes the full v2 blob to `onSave` verbatim.
The data shape is Track-B-ready. Only the persistence and access layers need updating.

---

## Verification standard

Before declaring any code complete:
1. Run `npx esbuild <file> --bundle=false --loader:.jsx=jsx` on every modified JSX file.
2. If adding/changing imports, confirm all paths resolve relative to `src/pages/FinancialTool.jsx`.
3. For migration changes, test against a real Supabase config blob (flat v1 shape) before deploying.
4. Run `npm run dev` and exercise the affected service line tab end-to-end.

esbuild caught a `.js` vs `.jsx` loader mismatch during Track A — never rely on the dev
server alone to catch parse errors.

---

## Known risks and gotchas

- **`migrateFlatV1()` names migrated companies `'My Company'`** regardless of the original save.
  If the production Supabase record has the company name under a different field, it will be
  silently lost. Verify against a real record before the first production deploy.
- **Import paths assume `src/pages/FinancialTool.jsx`**. If the file moves, the `../lib/`,
  `../serviceLines/`, and `../data/` relative imports in that file all break.
- **`FinancialTool.jsx` is a single 3,197-line file by design** — components are co-located,
  not split into separate files. Navigate by search: `calcHome`, `CompanyPL`, `SUB_TABS`,
  `export default function App`.
- **A Vitest + Playwright test suite now exists** (unit/component, integration, e2e) and gates
  `main` via CI — see "Database, migrations & CI" above. esbuild + manual testing are still
  useful for fast local checks, but tests are the regression gate.
- **The schema and RLS now exist** in the canonical Lovable migration (profiles, companies,
  licensees, licensee_companies, referral tracker, with RLS policies). The Track B *app code*
  (SuperAdmin provisioning UI, `loadAssignedCompanies`, etc.) is still pending, and there is a
  known RLS over-restriction finding open for normal (non-super-admin) users.

---

## Working style

- Verify with esbuild before declaring code done.
- Preserve existing working components verbatim during refactors — only rewrite changed scope.
- Split multi-step refactors into reviewable foundation passes before integration.
- Push back constructively when framing is wrong — don't silently follow a bad direction.
- When a "brace imbalance" symptom appears in long JSX, check JSX tag balance separately —
  `}` and `</div>` errors look similar downstream but need different tools to diagnose.
