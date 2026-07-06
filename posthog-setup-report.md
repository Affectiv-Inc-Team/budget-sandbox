<wizard-report>
# PostHog post-wizard report

PostHog analytics is fully integrated into the Intrinsic Vite + React SPA via a shared singleton in `src/lib/posthog.js` using `posthog-js`. The integration covers authentication, financial model persistence, service line activity, marketing conversion, referral intake pipeline events, error tracking, and user identification. Fourteen business events are tracked across six files. This run added `referral_created` and `referral_updated` to `src/pages/ReferralTracker.jsx`, which previously had no instrumentation despite being a core business module.

| Event | Description | File |
|---|---|---|
| `user_signed_in` | User successfully authenticated via email/password | `src/pages/LoginPage.jsx` |
| `user_sign_in_failed` | Login attempt returned an authentication error | `src/pages/LoginPage.jsx` |
| `user_signed_out` | User explicitly triggered sign-out from the app header | `src/App.jsx` |
| `module_switched` | User toggled between Financial Tool and Referral Tracker modules | `src/App.jsx` |
| `$pageview` | Route change captured manually; includes `path` | `src/App.jsx` |
| `model_saved` | User saved the financial model config to Supabase; includes `success`, `company_count`, `service_line_count` | `src/pages/FinancialTool.jsx` |
| `service_line_added` | User added a new service line; includes `service_line_type` | `src/pages/FinancialTool.jsx` |
| `service_line_removed` | User confirmed removal of a service line; includes `service_line_type` | `src/pages/FinancialTool.jsx` |
| `service_line_viewed` | User navigated to a service line tab; includes `service_line_type` | `src/pages/FinancialTool.jsx` |
| `config_load_failed` | Supabase query failed when loading the company config; includes `error_message`, `error_code` | `src/supabase.js` |
| `demo_requested` | Visitor clicked 'Request a Demo' on a marketing page; includes `page` | `src/pages/LandingPage.jsx`, `src/pages/FeaturesPage.jsx` |
| `landing_signin_clicked` | Visitor clicked Sign In in the marketing site header; includes `page`, `authed` | `src/marketing/MarketingLayout.jsx` |
| `referral_created` | User saved a new referral into the intake pipeline; includes `stage`, `priority`, `source_type`, `service_level`, `pay_source` | `src/pages/ReferralTracker.jsx` |
| `referral_updated` | User saved changes to an existing referral; includes `stage`, `priority`, `source_type`, `stage_changed`, `outcome_set` | `src/pages/ReferralTracker.jsx` |

User identification: `posthog.identify()` is called with the Supabase user UUID and email on successful login (both in `LoginPage.jsx` and via `onAuthStateChange` in `App.jsx`). `posthog.reset()` is called on sign-out to clear the identity. Exception autocapture is enabled globally via `enable_exception_autocapture: true`. `posthog.captureException()` is called explicitly in the `loadConfig` and `saveConfig` catch blocks in `src/supabase.js`.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events instrumented in this project:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/471586/dashboard/1806474)
- [Referrals created over time](https://us.posthog.com/project/471586/insights/HHqICCeV) — New referrals entering the intake pipeline per day
- [Referrals created vs updated](https://us.posthog.com/project/471586/insights/yuhXfkvI) — Intake velocity vs case management activity
- [Stage changes per day](https://us.posthog.com/project/471586/insights/hvtCSMgR) — How actively referrals are being moved through the pipeline
- [Demo requests over time](https://us.posthog.com/project/471586/insights/46Odul14) — Top-of-funnel prospect interest from marketing pages
- [Sign-in to referral creation funnel](https://us.posthog.com/project/471586/insights/7yvKkdW6) — Conversion from login to capturing a new referral

Prior dashboard (authentication, model saves, service lines):
- [Original wizard dashboard](https://us.posthog.com/project/471586/dashboard/1715178)

## Verify before merging

- [x] Run a full production build (`npm run build`) and fix any lint or type errors introduced by the generated code. *(2026-07-06: passes clean — only pre-existing chunk-size and Vite deprecation warnings.)*
- [x] Run the test suite (`npm test`) — instrumented call sites in `ReferralTracker.jsx` may need updated mocks or fixtures. *(2026-07-06: 475/475 pass with the new instrumentation in place; no mock changes needed.)*
- [x] Add `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to `.env.example` so collaborators know what to set. *(2026-07-06: created `.env.example` with the PostHog and Supabase vars.)*
- [ ] Wire source-map upload (`posthog-cli sourcemap` or Vite source-map plugin) into CI so production stack traces de-minify in PostHog error tracking. *(Deferred 2026-07-06: not wireable yet — Lovable builds and deploys the frontend from `main`, so GitHub Actions never produces the served bundles, and `posthog-cli sourcemap inject` must run on the exact deployed chunks. Revisit when the deploy moves to a pipeline we control, e.g. the planned AWS ECS Fargate setup.)*
- [x] Confirm the returning-visitor path (page refresh while already logged in) also calls `posthog.identify()` — the `onAuthStateChange` handler in `App.jsx` fires on `SIGNED_IN` only; the initial `getSession()` call at mount does not explicitly identify. *(2026-07-06: confirmed the gap — supabase-js emits `INITIAL_SESSION`, not `SIGNED_IN`, on session restore. Fixed by also identifying on `INITIAL_SESSION` in `App.jsx`.)*

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>

---

# PostHog ↔ Claude integration (continuous improvement)

This section documents the work added on top of the wizard baseline to make PostHog safe
for our HIPAA context, connect it to Claude Code, and turn on the remaining free products.

## HIPAA posture — why we mask aggressively (free plan, no BAA)

PostHog **only signs a BAA on the paid Boost/Scale/Enterprise packages**. On the free plan
PostHog is **not** authorized to receive PHI. We are staying on the free plan, so the rule is:
**no PHI may ever leave the browser.** PostHog's privacy controls run client-side (masked
content is redacted *before* transmission), which makes this enforceable.

Controls in `src/lib/posthog.js`:
- `session_recording.maskAllInputs: true` — every `<input>` is masked.
- `session_recording.maskTextSelector: '*'` — **all visible text** is masked, shown as asterisks
  in replay (the key fix; without it, on-screen names/SSN/DOB/diagnoses would be recorded).
- `session_recording.maskCapturedNetworkRequestFn` — strips query strings and drops
  request/response bodies from captured network metadata.
- `autocapture: false` — DOM autocapture is disabled. `maskTextSelector` only masks the replay,
  not event properties, so autocapture could otherwise capture clicked element text (e.g. a
  participant name in a referral row) into events. We use explicit `posthog.capture()` calls
  instead. (`enable_exception_autocapture` is separate and stays on.)

> We previously also added the `ph-no-capture` class (solid-block redaction) to PHI surfaces,
> but removed it in favor of asterisk masking everywhere — cleaner replays, and `autocapture:
> false` covers the event-side leak that `ph-no-capture` had been guarding.

> If real PHI ever needs to reach PostHog, that is a hard prerequisite of a paid Boost/Scale
> subscription **with a countersigned BAA** (app.posthog.com/legal) on PostHog Cloud **US**.
> Do not relax the masking above until that is in place.

## Claude Code ↔ PostHog (MCP)

`.mcp.json` (committed, project-scoped) registers PostHog's official remote MCP server:

```json
{ "mcpServers": { "posthog": { "type": "http", "url": "https://mcp.posthog.com/mcp" } } }
```

- No secret is stored — auth is **browser OAuth**. First use: run `/mcp` in Claude Code and log
  in; the endpoint auto-routes to the US region of the signed-in account (project 471586).
- Gives Claude tools for insights, dashboards, **error tracking** (issue lists + stack traces),
  HogQL/SQL queries, feature flags, surveys, and annotations.
- **No session-replay tool exists** — Claude drives improvement from analytics + error tracking
  + insights, not by reading replays directly.
- Continuous-improvement loop: Claude reads errors/analytics → proposes/implements fixes →
  (optionally) creates annotations or toggles flags.

## Products enabled (all free tier)

- **Analytics + replay** — from the wizard; replay now masked (above). Manual `$pageview` and a
  `module_switched` event are captured in `src/App.jsx` (init keeps `capture_pageview: false`).
- **Error tracking** — `enable_exception_autocapture` is on; `posthog.captureException` enriches
  the Supabase `loadConfig`/`saveConfig` catch sites (`src/supabase.js`). Enable the Error
  Tracking product + a new-issue alert in the PostHog UI.
- **Feature flags** — `useFeatureFlag(key)` / `isFeatureEnabled(key)` helpers in
  `src/lib/posthog.js`. Reference gate: the `hide-catalog-service-lines` flag hides
  in-development service lines from the picker in `src/pages/FinancialTool.jsx` (default off =
  current behavior). Create the flag in PostHog to use it.
- **Surveys** — no/low-code; create in the PostHog UI and they render via the loaded `posthog-js`.
  Suggested first survey: a satisfaction prompt triggered after the `model_saved` event.
- **Experiments (A/B)** — intentionally **not** set up yet; feature flags above are the
  prerequisite if we add them later.

## Free-tier allowances to watch (resets monthly)

| Product | Free allowance |
|---|---|
| Product analytics | 1M events / mo |
| Session replay | 5,000 recordings / mo |
| Feature flags | 1M requests / mo |
| Surveys | 1,500 responses / mo |
| Error tracking | 100,000 exceptions / mo |

Free plan also = **1 project**, **1-year retention**, community support.
