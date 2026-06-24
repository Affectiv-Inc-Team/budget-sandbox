<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Intrinsic financial modeling app. PostHog is initialized via a shared singleton in `src/lib/posthog.js` using `posthog-js` (the browser SDK, appropriate for this Vite + React SPA). User identity is established at login and cleared on sign-out. Eight business events are tracked across four files covering authentication, model persistence, service line management, and data loading errors.

| Event | Description | File |
|---|---|---|
| `user_signed_in` | User successfully authenticated via email/password | `src/pages/LoginPage.jsx` |
| `user_sign_in_failed` | Login attempt returned an authentication error | `src/pages/LoginPage.jsx` |
| `user_signed_out` | User explicitly triggered sign-out from the header | `src/App.jsx` |
| `model_saved` | User saved the financial model config to Supabase; includes `success`, `company_count`, `service_line_count` | `src/pages/FinancialTool.jsx` |
| `service_line_added` | User added a new service line; includes `service_line_type` | `src/pages/FinancialTool.jsx` |
| `service_line_removed` | User confirmed removal of a service line; includes `service_line_type` | `src/pages/FinancialTool.jsx` |
| `service_line_viewed` | User navigated to a service line tab; includes `service_line_type` | `src/pages/FinancialTool.jsx` |
| `config_load_failed` | Supabase query failed when loading the company config; includes `error_message`, `error_code` | `src/supabase.js` |

User identification: `posthog.identify()` is called with the Supabase user UUID and email on successful login (both in `LoginPage.jsx` and via `onAuthStateChange` in `App.jsx`). `posthog.reset()` is called on sign-out to clear the identity. Exception autocapture is enabled globally via `enable_exception_autocapture: true` in the PostHog init config.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/471586/dashboard/1715178)
- [Daily sign-ins](https://us.posthog.com/project/471586/insights/dBsWxgsC) — Unique users signing in per day
- [Model saves over time](https://us.posthog.com/project/471586/insights/ePj68Ug7) — Total saves vs failed saves per day
- [Sign-in to model save funnel](https://us.posthog.com/project/471586/insights/VnDX2Yc2) — Conversion from login to saving the financial model
- [Service line adoptions by type](https://us.posthog.com/project/471586/insights/HpIdIv7H) — Which service line types are added most often
- [Sign-in failure rate](https://us.posthog.com/project/471586/insights/01vQtjsq) — Percentage of login attempts that fail over time

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
