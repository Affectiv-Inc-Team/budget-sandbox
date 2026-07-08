# Intrinsic — Access Levels, Rights & Privileges

**Document type:** Access control specification
**Applies to:** Financial Modeling Tool (Document A) — extends company-level access throughout the entire system, not only the Budget Builder
**Companion to:** Document A (Financial Modeling Tool: Scope & Components)
**Status:** Implemented (client-side, Track A) — server-side enforcement deferred to Track B

---

## Principle

The existing Budget Builder already has role-based access controls. This specification **lifts that pattern up to the entire system**, so a user's role determines what they see across every tab, every KPI tile, every P&L view, and every sidebar control — not just the Budget Builder.

The hierarchy mirrors the operational reality of an HCBS provider agency: at the top, owners and senior leadership see the full financial picture in dollars. Mid-level managers see relative shape (percentages, margins, efficiency states) without raw dollar amounts. Operational tier staff see only what they need to do their job.

Two new tiers are introduced compared to the existing Budget Builder roles: **Owner** (split out from CEO/Owner) and **Finance** (new). Hierarchy is now eight tiers deep.

---

## Tier hierarchy

| Tier | Role | Common alternate titles |
|---|---|---|
| 1 | Owner | Founder, Principal, Member |
| 2 | CEO | Chief Executive Officer, Executive Director |
| 3 | Finance | CFO, Controller, Director of Finance |
| 4 | Regional Director | Director of Operations, VP Operations |
| 5 | Program Manager | Service Director, Program Director |
| 6 | HR Manager | Director of People, HR Director |
| 7 | Scheduler / Regional Assistant | Staffing Coordinator, Operations Assistant |
| 8 | House Lead / Team Coordinator | Lead DSP, Site Lead, Shift Lead |

Lower numbers = higher access. Tier 1 is the most privileged, tier 8 the least.

---

## Visibility matrix

The matrix below covers the four visibility dimensions that matter most: company-level dollars, percentages, wages, and budget detail. Specific tab and feature rules follow below.

| Tier | Role | Company $ | Revenue / Margin | Percentages (non-revenue) | Wages | Budget Builder |
|---|---|---|---|---|---|---|
| 1 | Owner | ✅ Full | ✅ Full ($ and %) | ✅ Full | ✅ Full $ | ✅ Full ($, all rows) |
| 2 | CEO | ✅ Full | ✅ Full ($ and %) | ✅ Full | ✅ Full $ | ✅ Full ($, all rows) |
| 3 | Finance | ✅ Scoped | ✅ Scoped ($ and %) | ✅ Scoped | ✅ $ (scoped) | ✅ Full ($, all rows, scoped) |
| 4 | Regional Director | ❌ Hidden | 🔒 % only (no $) | ✅ Full | ✅ Visible $ | 🔒 Own row in $; below their tier as % |
| 5 | Program Manager | ❌ Hidden | ❌ Hidden ($ and %) | ✅ Full | ✅ Visible $ | 🔒 Own row in $; below their tier as % |
| 6 | HR Manager | ❌ Hidden | ❌ Hidden ($ and %) | ✅ Full | ✅ Visible $ | 🔒 Own row in $; below their tier as % |
| 7 | Scheduler / Regional Assistant | ❌ Hidden | ❌ Hidden ($ and %) | ✅ Full | 🔒 As % only | 🔒 Own row in $; below their tier as % |
| 8 | House Lead / Team Coordinator | ❌ Hidden | ❌ Hidden ($ and %) | ✅ Full | ❌ Hidden | 🔒 Own row in $ only; rows above hidden |

**Symbol key:**
- ✅ Visible
- ❌ Hidden (the UI element does not render, or numbers are masked)
- 🔒 Restricted (partial visibility per role-specific rules below)
- **Scoped** = visible only for companies the user is explicitly assigned to via `licensee_companies`

---

## Core visibility rules

### Rule 1 — Company dollars
**Tiers 1–3** (Owner, CEO, Finance) see all dollar amounts everywhere. KPI tiles, P&L rollups, service-line revenue, total labor costs — all in raw dollars.

**Tier 4** (Regional Director) sees those metrics expressed as **percentages or ratios** rather than dollars:
- Revenue tiles render as "% of company total" rather than "$X annual"
- EBITDA tile renders as "%" (EBITDA margin) rather than "$"
- Net Income tile renders as "% net margin" rather than "$"
- P&L rows render as "% of revenue" rather than absolute amounts

**Tiers 5–8** (Program Manager, HR Manager, Scheduler, House Lead) see **no revenue or margin at all — neither dollars nor percentages**. Revenue and margin are financial-planning concepts outside their operational scope:
- The Company tab's Net Revenue, EBITDA, EBITDA Mgn, and Net Margin KPI chips are hidden
- The Company P&L panel is replaced with a short "restricted to Regional Director and above" notice
- Home Mix Editor: per-home margin ring, the "% margin" caption, and the per-home margin % badge are all hidden; card borders fall back to a neutral color instead of the margin-state color
- Home detail metric grid: the "Margin" tile is hidden (same gate)
- **5-Year Projection** table (inside the Labor Efficiency tab) is hidden entirely for tiers 4–8
- **Budget Builder header**: All three context cards (Total Participants, Net Revenue, Revenue / Participant) are hidden for tiers 4–8
- **Portfolio tab**: hidden entirely from the navigation for tiers 4–8 (not masked — the tab does not appear)
- The dollar-mode toggle is hidden from tiers 4–8

### Rule 2 — Wages
**Tiers 1–6** can see wages in dollars wherever they appear: the sidebar wage slider, per-coordinator hourly wage in TSC, per-clinician hourly wage in School-Based Services, per-home labor cost in Res Hab Mix Editor, graveyard wage, etc.

**Tier 7** (Scheduler / Regional Assistant) can see wages and overtime **as percentages only** — average wage as % of revenue, overtime hours as % of total labor, labor cost as % of revenue. No raw dollar wage figures are shown. This lets them do their job (managing schedules with cost-awareness) without exposing individual or aggregate wage dollars.

**Tier 8** (House Lead / Team Coordinator) cannot see wages anywhere — not in dollars, not in percentages, not at all:
- Sidebar wage and graveyard wage controls are hidden
- TSC coordinator wage column is hidden
- Labor cost columns and wage-related ratios are hidden entirely
- Service-line P&L labor lines are hidden

### Rule 3 — Percentages
All tiers see percentages, margins, ratios, and efficiency states. This is the visual language for tiers 4–8 — they navigate the tool through shape, not absolute size. This includes:
- EBITDA margin %, net margin %, gross margin per service line
- Occupancy %, mgmt fee %, billing fee %
- Labor efficiency states ("approved / marginal / over-threshold")
- Caseload utilization % (TSC productivity tab)
- Per-home margin %

### Rule 4 — Budget Builder visibility
This rule lifts the existing Budget Builder pattern and refines it for the new tier system.

**Tiers 1–3** see every row in dollars. They can edit any row.

**Tiers 4–7** see:
- **Their own row in dollars** (e.g., a Regional Director sees their own salary line at $X)
- **All rows below their tier as percentages** of company revenue (no dollar amounts)
- **All rows above their tier are hidden entirely** (not even percentages — the rows don't render)

**Tier 8 (House Lead)** sees:
- **Their own row in dollars only**
- **No other rows** — not above, not below, not in any format

This means a House Lead opening the Budget Builder sees a single line: their own budget. Everyone else's budget is invisible.

### Rule 5 — Sidebar controls
The global sidebar controls (wage, graveyard wage, occupancy, entity type, owner rate, rates, mgmt fee %, billing fee %) are gated:

| Control | Visible to tiers |
|---|---|
| Wage / Graveyard wage (in $) | 1–6 |
| Wage / Overtime (as % only) | 7 |
| Occupancy | 1–7 |
| Entity type | 1–3 |
| Owner tax rate | 1–3 |
| Res Hab rate overrides | 1–5 |
| Mgmt fee % | 1–3 |
| Billing fee % | 1–3 |

Tier 8 sees only occupancy in the sidebar; all other controls are hidden.

For any tier below a control's visibility threshold, the control is **hidden from the sidebar entirely** rather than disabled. A hidden control communicates "this is not for you"; a disabled control communicates "this is for you but you can't touch it right now," which is the wrong message.

### Rule 6 — Edit vs. read-only
Visibility is not the same as edit permission. A user might see a value but not be allowed to change it.

| Tier | Default permission |
|---|---|
| 1–3 | Edit everything they can see |
| 4 | Edit operational fields (rosters, schedules, Home Mix Editor); read-only on financial fields |
| 5–8 | Read-only across the entire tool; Save button hidden |

The Save button is visible only to tiers 1–4. Tiers 5–8 have no editable fields, so the Save button does not render for them.

### Rule 7 — Header KPI chips
The top-of-page KPI chip bar (24hr Clients, Hourly Clients, TSC Caseload, EBITDA, Net Income/Margin) is visible to **tiers 1–4 only**.

- **Tiers 1–3:** Dollar chips — EBITDA `$X` and Net Income `$X`.
- **Tier 4:** Percentage chips — EBITDA Mgn `X%` and Net Margin `X%`. Client count chips still visible.
- **Tiers 5–8:** The entire header KPI bar is hidden. No numbers appear at the top of the screen.

### Rule 8 — Home Mix Editor interactivity
The Home Mix Editor (add/remove homes, client mix steppers, wage/occupancy sliders, billing toggles, rate overrides) is fully interactive for **tiers 1–4**. For **tiers 5–8** it becomes view-only:
- Add and Remove home buttons are hidden
- Home name input is read-only
- All sliders, steppers, and toggles are non-interactive (pointer-events disabled, opacity reduced)
- The read-only state communicates that the configuration is visible but not editable at this permission level

### Rule 9 — Add Service Line button
The `+ Add Service Line` button is visible only to **tiers 1–4**. Tiers 5–8 cannot add new service lines to a company.

---

## What each tier sees, tab by tab

The **FAQ & Help tab** is visible to all tiers but its content is filtered to match what each role can see and interact with. Questions about EBITDA, billing types, fees, rate reductions, and the Home Mix Editor are only shown to roles who have access to those features. Lower tiers see a progressively narrower set of topics focused on their operational domain. The AI assistant's system prompt is also scoped by role — it answers questions within the bounds of what that role can see.

### Tier 1 — Owner
Sees everything. No restrictions. Edits everything.
- **FAQ:** All topics visible. Full financial and operational context in the AI assistant.

### Tier 2 — CEO
Same as Owner. Functionally equivalent for visibility; differences (if any) are operational/legal rather than tool-level.
- **FAQ:** All topics visible.

### Tier 3 — Finance
Finance has **CEO-equivalent visibility and edit permissions, scoped to assigned companies only.**

Practically: a Finance user assigned to Companies A and B sees full dollar visibility on those two companies — every KPI, every P&L line, every wage, every fee, full Budget Builder access. They edit financial fields (rates, fees, entity type, owner rate) the same way the CEO would. They do not edit operational rosters (that's not their role).

The distinction from Owner/CEO: Finance only sees companies they have been explicitly assigned to. If your Intrinsic deployment contains six companies and the Finance user is assigned to two, the other four are completely invisible to them — they do not appear in the company picker, do not appear in cross-company portfolio views, and their data cannot be read at any layer. Owner and CEO, by contrast, are assumed to have visibility into every company in their agency.

This scoping is enforced by the same `licensee_companies` assignment mechanism described in Document B. The Finance role essentially says "treat me as CEO inside my assigned scope; treat me as nonexistent outside it."

### Tier 4 — Regional Director
- **Header KPIs:** Visible — percentage chips (EBITDA Mgn %, Net Margin %) and client count chips. No raw dollar chips.
- **Whole Company P&L:** Hidden — does not appear in navigation (same gate as Portfolio).
- **Service line P&L tabs:** Hidden — Res Hab P&L, Hourly P&L, TSC P&L, Children's DDA P&L, Voc Services P&L, and School-Based P&L tabs do not appear.
- **Portfolio tab:** Hidden — does not appear in navigation.
- **Service line operational tabs:** All visible (roster, productivity, staffing, rate schedule, etc.).
- **Scenario tabs (TSC, School-Based):** Visible — Regional Directors can run scenario modeling.
- **Budget Builder:** No header cards. Their own row in $, lines below in %, lines above hidden.
- **Labor Efficiency tab:** Ratio/% content fully visible. Dollar metric tiles and 5-year projection hidden (dollar columns gated to tiers 1–3).
- **Sidebar:** Wage, occupancy, Res Hab rate overrides visible. Entity type, owner rate, fees hidden.
- **Wages:** Visible everywhere they appear.
- **Add Service Line:** Button visible — Regional Directors can add service lines.
- **Home Mix Editor:** Fully interactive — can add/remove homes, adjust sliders, configure billing.
- **FAQ:** All sections visible. Billing type, EBITDA, staffing, rate reduction, and Mix Editor topics shown. Management/billing fee question hidden (sidebar control not available). AI assistant uses operational + margin % framing.

### Tier 5 — Program Manager
- **Header KPIs:** Hidden — entire KPI chip bar does not render.
- **Company tab:** Net Revenue, EBITDA, EBITDA Mgn, and Net Margin chips hidden. The Company P&L panel is replaced with a short "restricted to Regional Director and above" notice.
- **Whole Company P&L:** Hidden — does not appear in navigation.
- **Service line P&L tabs:** Hidden — P&L tabs do not appear.
- **Portfolio tab:** Hidden — does not appear in navigation.
- **Scenario tabs (TSC, School-Based):** Hidden — scenario modeling is a financial planning function restricted to tiers 1–4.
- **Service line operational tabs:** All visible except as noted above. Focuses operationally on the service lines they run.
- **Budget Builder:** No header cards. Their own row in $, lines below in %, lines above hidden.
- **Labor Efficiency tab:** Ratio/% content visible. Dollar tiles and 5-year projection hidden.
- **Home Mix Editor:** Per-home margin ring, "% margin" caption, and per-home margin badge are hidden; card borders use a neutral color. Home detail "Margin" tile hidden. View-only for all other controls.
- **Sidebar:** Wage, occupancy, Res Hab rate overrides visible. Entity type, owner rate, fees hidden.
- **Wages:** Visible.
- **Add Service Line:** Button hidden — Program Managers cannot add service lines.
- **FAQ:** Billing type, EBITDA, management fees, and Mix Editor topics hidden. Sees staffing, group hours, revenue rates, rate reduction, and Budget Builder questions. "Why percentages?" explainer shown. AI assistant focuses on staffing and operational efficiency.

### Tier 6 — HR Manager
- **Header KPIs:** Hidden — entire KPI chip bar does not render.
- **Whole Company P&L:** Hidden — does not appear in navigation.
- **Service line P&L tabs:** Hidden — P&L tabs do not appear.
- **Portfolio tab:** Hidden — does not appear in navigation.
- **Scenario tabs (TSC, School-Based):** Hidden — scenario modeling is a financial planning function restricted to tiers 1–4.
- **Service line operational tabs:** Visible except as noted above — HR cares about staffing across all lines.
- **Budget Builder:** No header cards. Their own row in $, lines below in %, lines above hidden.
- **Labor Efficiency tab:** Ratio/% content visible. Dollar tiles and 5-year projection hidden.
- **Sidebar:** Wage and occupancy visible. Rate overrides, entity type, owner rate, fees hidden.
- **Wages:** Visible — HR needs wages to manage staff.
- **Add Service Line:** Button hidden — HR Managers cannot add service lines.
- **Home Mix Editor:** View-only — can see configuration but cannot modify homes, sliders, or billing settings.
- **FAQ:** Same as Program Manager. Billing type and hourly rates also hidden (HR doesn't make billing decisions). Staffing ratios, payroll burden, and group hours visible. AI assistant focuses on HR and staffing efficiency.

### Tier 7 — Scheduler / Regional Assistant
- **Header KPIs:** Hidden — entire KPI chip bar does not render.
- **Whole Company P&L:** Hidden — does not appear in navigation.
- **Service line P&L tabs:** Hidden — P&L tabs do not appear.
- **Portfolio tab:** Hidden — does not appear in navigation.
- **Scenario tabs (TSC, School-Based):** Hidden — scenario modeling is a financial planning function restricted to tiers 1–4.
- **Service line operational tabs:** Visible except as noted above. Productivity tabs (e.g., TSC Productivity) visible — utilization is their domain.
- **Budget Builder:** No header cards. Their own row in $, lines below in %, lines above hidden.
- **Labor Efficiency tab:** Ratio/% content visible. Dollar tiles and 5-year projection hidden.
- **Sidebar:** Occupancy visible. Wage controls visible **but rendered as ratios** (e.g., average wage as % of revenue, overtime % of total labor) rather than raw dollar wage sliders. Rate overrides, entity, fees all hidden.
- **Wages and overtime:** Visible **as percentages only**. No raw dollar wage figures.
- **Add Service Line:** Button hidden — Schedulers cannot add service lines.
- **Home Mix Editor:** View-only — can see configuration but cannot modify homes, sliders, or billing settings.
- **Save button:** Hidden — tiers 7–8 are fully read-only; the Save button does not render.
- **FAQ:** Revenue section reduced to Intense vs High Support only. Billing type, hourly rates, group hours revenue impact, payroll burden, EBITDA, and management fees all hidden. Sees staffing ratio, labor for group hours, "why percentages?" explainer, Budget Builder, and Margin Guide. AI assistant focuses on scheduling and shift coverage efficiency.

### Tier 8 — House Lead / Team Coordinator
- **Header KPIs:** Hidden — entire KPI chip bar does not render.
- **Whole Company P&L:** Hidden — does not appear in navigation.
- **Service line P&L tabs:** Hidden — P&L tabs do not appear.
- **Portfolio tab:** Hidden — does not appear in navigation.
- **Scenario tabs (TSC, School-Based):** Hidden — scenario modeling is a financial planning function restricted to tiers 1–4.
- **Service line operational tabs:** They see only the service line they operate within. Within that, they see operational state (occupancy, scheduling, labor-efficiency color states) but no dollar amounts.
- **Budget Builder:** No header cards. Their own row in $ only. Everything else is invisible.
- **Labor Efficiency tab:** Visible (ratio/% content only — labor ratio bar, sweep chart, staffing hours). Dollar metric tiles and 5-year projection are hidden entirely (`canSeeCompanyDollars` is false for tier 8).
- **Sidebar:** Occupancy visible. Everything else hidden.
- **Wages:** Hidden everywhere.
- **Add Service Line:** Button hidden.
- **Home Mix Editor:** View-only — cannot modify homes, sliders, or billing settings.
- **Save button:** Hidden — tier 8 is fully read-only.
- **FAQ:** Revenue section hidden entirely. "Understanding Your Revenue" has no visible items for tier 8. Sees only: High Support staffing ratio, Budget Builder explanation, and Margin Guide. AI assistant focuses on daily operations, client mix, and occupancy.

---

## Implementation notes for Mason

When implementing this, the cleanest pattern is to centralize role-based visibility in a single helper module rather than scatter `if (role === ...)` checks through every component.

**Suggested structure:**

```
src/lib/access.js
  ├─ ROLE_TIERS = { OWNER: 1, CEO: 2, FINANCE: 3, ... }
  ├─ canSeeCompanyDollars(role)     // tiers 1-3
  ├─ canSeeWages(role)              // tiers 1-6
  ├─ canSeePercentagesOnly(role)    // tiers 4-8
  ├─ canEditField(role, fieldName)
  ├─ budgetVisibility(role, rowTier) // returns 'dollars' | 'percent' | 'hidden'
  └─ canSeeControl(role, controlId)
```

Every component that renders dollars, wages, or restricted controls calls these helpers rather than checking roles directly. That way the rules above are enforced in one place and easy to change when (not if) they evolve.

**Render strategy for masked values:**
- For dollars hidden behind percentages: compute the dollar value normally, then convert to % at the display layer
- For wages hidden: don't pass the wage prop to the child component at all; the component renders a placeholder or omits the column
- For Budget Builder rows hidden: filter the rows array before passing it to the component, don't ship hidden data to the client

**Don't ship dollars to clients who can't see them.** Even if the UI hides them, sending raw dollar amounts in the JSON payload means a curious user could open browser devtools and read everything. The data layer (`supabase.js` or wherever) should be role-aware too: a House Lead's `loadConfig` call should return a config blob with dollar fields stripped or replaced with computed percentages server-side.

This is more important than it sounds. The whole point of access tiers is that lower tiers genuinely cannot see higher-tier data — not that the UI politely declines to show it.

---

## Dependencies surfaced by these rules

A few rules above imply features that don't fully exist in the tool yet. Calling them out so they don't get lost in implementation.

**Overtime as a tracked concept.** Tier 7 (Scheduler) needs to see overtime as a percentage of total labor. The tool today treats wages as a flat input — there's no concept of regular vs. overtime hours, no overtime multiplier, no aggregate overtime metric. To honor the access rule, the tool needs to start modeling overtime explicitly:
- Per-role or per-service-line overtime hours (input or calculated)
- Overtime wage multiplier (typically 1.5×)
- Aggregate overtime metric ("overtime as % of total labor hours")

This is a real feature addition, not just an access wrinkle. It's reasonably scoped — the Scheduler role wants visibility into a number that should exist anyway, and any agency caring about labor cost discipline should be tracking it. Worth promoting from "implied by access" to "actual feature on the roadmap."

**Wage-shape ratios.** Tier 7's percentage-only wage view requires the tool to compute and display wage-shape metrics that aren't currently shown to anyone:
- Average wage as % of revenue
- Total labor as % of revenue (already exists in some views)
- Overtime as % of total labor (depends on above)
- Per-role wage as % of company labor budget

These are useful metrics for everyone, not just the Scheduler. Surfacing them on the Whole Company P&L and the labor efficiency views benefits all tiers, not just tier 7.

**Per-company role assignment.** The Finance tier's "scoped to assigned companies" rule means a user's role isn't a single value on their profile — it's per-company. The data model needs to reflect this: a row in `licensee_companies` (or equivalent) carries the user's role for that specific company. A Finance user might be Finance on Company A and have no access at all to Company B. This is more flexible than a single-role-per-user model and is the right shape for the long term, but it has implications for the auth/profile schema (Document B territory).

---

---

## What this depends on (forward references to Document B)

The role itself lives on the user's profile, which is part of the auth/identity infrastructure described in Document B. Specifically:

- A user's role is stored on their profile record in Supabase (extension to the existing `profiles` table)
- The same user could potentially have different roles at different licensee companies (rare but possible) — the assignment lives on `licensee_companies` rather than on the user
- Role-based row-level security policies in Supabase are the backstop: even if the UI screwed up and tried to render data the user shouldn't see, RLS would refuse to return it from the database

Mason can build the **client-side** of this access control as part of Track A polish. The **server-side** enforcement (RLS policies, data stripping in `supabase.js`) is Track B infrastructure work.

The client-side without the server-side gives you UX correctness but not security. The server-side without the client-side gives you security but a confusing UI. Both are needed, but client-side is what Mason should ship within his 6 weeks.

---

## Open questions and confirmations

The following have been confirmed by Shawn (logged for reference):

1. ✅ **House Lead's narrow view is intentional.** They see operational state (their site's clients, occupancy, labor-efficiency colors) plus their own budget row in dollars. No company dollars, no wages, no other budget rows. May warrant a dedicated simplified screen rather than the full tool with most of it masked — open design question for week-two Monday session.

2. ✅ **Budget Builder visibility: own row in dollars; below their tier in percentages; above their tier hidden entirely.** House Lead is the exception — they see only their own row, nothing else.

3. ✅ **Finance is CEO-scoped-to-assignment.** Full dollar visibility and edit on assigned companies only. No visibility into unassigned companies at all. Treated as nonexistent outside their assigned scope.

4. ✅ **Scheduler / Regional Assistant is a single combined tier.** Sees wages and overtime as percentages only (not dollars). Requires the tool to track overtime explicitly — see Dependencies section above.

Still open:

5. **Multi-role users at the same company.** Can a single user hold multiple tiers simultaneously (e.g., Owner + CEO + Finance in a small agency)? Default assumption: yes, the highest tier wins. Confirm.

6. **Role assignment workflow.** Who assigns roles and through what UI? Owner/CEO assigning via an admin screen is the obvious answer, but that admin screen is Track B work and doesn't exist yet. For Mason's purposes, role can be hard-coded in the user's profile and tested via direct database edits until the admin UI lands.

7. **Tier 8 — dedicated simplified screen vs. masked full tool.** Worth a design conversation. The full tool with most of it masked is fast to ship; a dedicated simplified screen is the better UX. Recommend deciding in the week-two Monday session.
