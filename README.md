# budget-sandbox
A scalable billing platform designed to support Medicaid service providers, streamlining claims, tracking, and compliance for individuals with disabilities, with plans for full integration into a broader SaaS solution.

## Testing

Unit + component tests (no external dependencies):

```bash
npm test                # run all unit/component tests once
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report
```

Integration tests exercise the persistence + RLS layer against a **local**
Supabase Docker instance (never production — `tests/integration/setup.js` aborts
if the resolved URL is not `127.0.0.1`):

```bash
supabase start          # boot local Postgres/Auth (requires Docker running)
supabase db reset       # apply migrations + seed to a clean DB
npm run test:integration
```

End-to-end tests drive the real app in Chromium against the **same local**
Supabase. Playwright starts the dev server itself (`vite --mode e2e`, which loads
`.env.e2e` so the browser never touches production), and `global-setup.js`
provisions a throwaway super-admin test user:

```bash
supabase start          # local Supabase must be running
npx playwright install chromium   # one-time browser download
npm run test:e2e        # run all E2E flows headless
npm run test:e2e:ui     # interactive UI mode
npx playwright show-report        # view the HTML report after a run
```

See [docs/TEST_STATUS.md](docs/TEST_STATUS.md) for the full test-suite roadmap.
