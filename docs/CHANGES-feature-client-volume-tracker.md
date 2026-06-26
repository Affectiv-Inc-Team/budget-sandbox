# Feature: Per-Agency Client Volume Tracker

**Date:** 2026-06-26
**Author:** Mason Tuft
**Scope:** Track per-agency client volume by month and by year.

---

## Context

A client (one of the original program sponsors) asked: *"Can we add a per-agency client
volume that tracks by month and by year?"*

Before this change, Intrinsic stored clients only as named roster entries inside each service
line's config (`participants`, `students`, etc.). Those entries represent the **current modeled
state** — they answer "how many clients are we modeling right now," not "how many clients did
we serve in January vs. February." There was no historical time series and no way to compare
census trends month-over-month or year-over-year.

This feature adds a lightweight **census log** to the Whole Company view. Users manually enter
monthly client counts (optionally scoped to a specific service line), and the UI surfaces a
monthly trend table and an annual summary grid. Manual entry is intentional — it keeps the log
honest about *actual* census rather than auto-deriving from the modeled roster.

The implementation stays entirely within the existing v2 JSONB config blob. **No new Supabase
table or migration was required** — the data persists in the `config` column on `companies`
alongside the rest of the company state.

---

## What changed

### 1. Data model — `src/lib/companyShape.js`

Added a `volumeLog` array to the company `shared` shape. Each entry is one month × one scope:

```js
volumeLog: [
  {
    id: string,                    // "vol_xxxxxxxx"
    month: string,                 // "YYYY-MM"
    serviceLineId: string | null,  // null = whole-company total
    clientCount: number,
    notes: string,                 // optional
  }
]
```

- `createSharedConfig()` now seeds `volumeLog: []` for every new company.
- `normalizeV2()` seeds `volumeLog: []` on already-saved v2 companies that predate the feature,
  so loading an older save never crashes and never loses data.

### 2. New component — `src/serviceLines/volumeTracker.jsx`

A new `VolumeTrackerTab` component (mirrors the `tsc.jsx` module conventions). Props:
`{ shared, serviceLines, onUpsert, onDelete }`. Three sections:

- **Log Client Volume (form):** month picker, service-line scope dropdown (Whole Company or any
  active service line), client count, optional notes, and an Add/Save button. Switches to edit
  mode when an existing row is selected.
- **Monthly Log (table):** all entries, most-recent first. Columns: Month, Service Line,
  Clients, MoM change (color-coded green/red/neutral, computed per scope), Notes, and
  Edit/Delete actions.
- **Annual Summary (grid):** one row per calendar year with Jan–Dec cells, an annual average,
  and the peak month. A scope selector switches the grid between Whole Company and a specific
  service line.

An empty state renders until the first entry is logged.

### 3. Wiring — `src/pages/FinancialTool.jsx`

- Imported `VolumeTrackerTab`.
- Added `{ id: "volume_tracker", label: "📈 Client Volume" }` to `SUB_TABS.WHOLE_COMPANY`
  (positioned between Budget Builder and FAQ).
- Added two mutation helpers in `App()` following the existing `updateShared` pattern:
  - `upsertVolumeEntry(entry)` — inserts a new entry or replaces an existing one by `id`.
  - `deleteVolumeEntry(id)` — removes an entry by `id`.
- Added the render case for `subTab === "volume_tracker"`.

Not dollar-gated — client counts are not financially sensitive the way EBITDA/P&L tabs are.

---

## Files touched

| File | Change |
|---|---|
| `src/lib/companyShape.js` | Added `volumeLog` to `createSharedConfig()`; seed on v2 normalize |
| `src/serviceLines/volumeTracker.jsx` | **New** — `VolumeTrackerTab` component |
| `src/pages/FinancialTool.jsx` | Tab entry, import, two mutation helpers, render case |

---

## What this does NOT do (deferred)

- Does **not** auto-populate the log from participant rosters — entry is manual by design.
- Does **not** aggregate volume across companies in the Portfolio view — possible follow-on.
- Does **not** add a dedicated `company_metrics` DB table — out of scope; the JSONB blob is
  sufficient for current needs and keeps this Track-A-only.

---

## Verification

| Step | Result |
|---|---|
| `esbuild` parse check — `volumeTracker.jsx` | ✅ no errors |
| `esbuild` parse check — `companyShape.js` | ✅ no errors |
| `esbuild` parse check — `FinancialTool.jsx` | ✅ no errors |
| Dev server — "📈 Client Volume" tab appears under Whole Company | ✅ confirmed in browser |
| Tab renders form + empty state | ✅ confirmed via snapshot + screenshot |
| Existing-company migration (no `volumeLog` key) | ✅ seeds `[]`, no crash |
| `npm test` (unit/component) | ✅ **462 passed / 462** |

> Note: a pre-existing `HomeMixEditor` style-shorthand console warning and the `ReferralList`
> border/borderLeft warning were observed during testing. Both are unrelated to this change.
