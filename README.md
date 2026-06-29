# Intrinsic — Financial Modeling Tool for HCBS Providers

> **Live URL:** [`finance.intrinsic.agency`](https://finance.intrinsic.agency) *(publishing via Lovable — see [Deployment](#deployment))*

A HIPAA-compliant, multi-tenant SaaS for Home and Community-Based Services (HCBS) and IDD provider agencies. The core product is a **financial modeling tool**: agencies model service-line profitability given their staffing mix, caseloads, Medicaid reimbursement rates, and overhead structure.

**Current scope:** Idaho — post-9/1/2025 rates (4% reduction applied). Utah, Nevada, and Arizona deferred for v2.

---

## Documentation

| Document | Description |
|---|---|
| [**System Overview**](docs/SYSTEM_OVERVIEW.md) | Full system reference — architecture, data model, service lines, deployment, and a map of all docs |
| [Agentic Coding Guide](docs/SYSTEM_OVERVIEW.md#agentic-coding-guide) | Patterns, gotchas, and verification steps for AI coding assistants |
| [Project Directory](PROJECT_DIRECTORY.md) | Source tree, import rules, file placement checklists |
| [Service-Line Ratios](docs/service-line-ratios.md) | Every calculator ratio, default, threshold, and formula |
| [Service Rate Spec](docs/service-rate-spec.md) | Idaho Medicaid rate catalog structure |
| [TSC Spec](docs/TSC-spec.md) | Targeted Service Coordination calculator spec |
| [School-Based Spec](docs/school-based-spec.md) | School-Based service line with nested overrides |
| [Access Levels](docs/access-levels-and-rights.md) | SuperAdmin / Licensee / Viewer access matrix |
| [Auth Implementation](docs/AUTH_IMPLEMENTATION.md) | Track B auth wiring plan |
| [Supabase Setup](docs/SUPABASE_SETUP.md) | Local Supabase setup guide |
| [Test Status](docs/TEST_STATUS.md) | Test suite status and commands |
| [Build History](intrinsic-build-history.md) | Chronological Track A build log |

---

## Quick Start

```bash
npm install
npm run dev        # start Vite dev server
```

---

## Testing

Unit and component tests (no external dependencies):

```bash
npm test                # run all unit/component tests once
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report
```

Integration tests exercise the persistence and RLS layer against a **local** Supabase Docker instance — never production. A localhost guardrail in `tests/integration/setup.js` aborts if the resolved URL is not `127.0.0.1`.

```bash
supabase start          # boot local Postgres/Auth (requires Docker)
supabase db reset       # apply migrations + seed to a clean DB
npm run test:integration
```

End-to-end tests drive the real app in Chromium against the same local Supabase. Playwright starts the dev server itself (`vite --mode e2e`, which loads `.env.e2e` so the browser never touches production).

```bash
supabase start                    # local Supabase must be running
npx playwright install chromium   # one-time browser download
npm run test:e2e                  # headless
npm run test:e2e:ui               # interactive UI mode
npx playwright show-report        # view HTML report after a run
```

See [docs/TEST_STATUS.md](docs/TEST_STATUS.md) for the full test-suite status and phase notes.

---

## Deployment

The decided production subdomain is **`finance.intrinsic.agency`**.

**Next steps — publish through Lovable:**

1. Open the project in [Lovable](https://lovable.dev).
2. Configure the custom domain `finance.intrinsic.agency` in Lovable's domain settings.
3. Point the DNS `CNAME` for `finance` at Lovable's target (shown in the Lovable dashboard).
4. Trigger a deploy from `main` — Lovable automatically deploys on every push.
5. Verify the Supabase Auth `Site URL` and `Redirect URLs` include `https://finance.intrinsic.agency`.

Before going live, confirm: `npm run test:e2e` is passing, the open RLS over-restriction finding is resolved ([docs/prod-release/rls-licensee-access-fix.md](docs/prod-release/rls-licensee-access-fix.md)), and PostHog PHI masking is active ([posthog-setup-report.md](posthog-setup-report.md)).

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React (JSX) |
| Auth / Database | Supabase (Postgres + RLS) |
| Deployment | Lovable → `finance.intrinsic.agency` |
| Analytics | PostHog (HIPAA client-side masking) |
| Testing | Vitest 2.1 + Playwright (Chromium) |
| CI | GitHub Actions — gates `main` on `unit` + `integration` |
