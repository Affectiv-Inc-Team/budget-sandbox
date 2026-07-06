# Onboarding & Invitation — Action Items

Tracked in Microsoft Planner ("Affectiv Billing Finance tool" plan, `Design (Gather Info)` bucket) as of 2026-07-01. This document mirrors that board for reference — the board is the source of truth if the two drift.

**Prototypes referenced throughout:**
- Onboarding Prototype — https://claude.ai/code/artifact/bb8b621e-61aa-4564-a075-8d360211a97f
- Invitation Prototype — https://claude.ai/code/artifact/f5f579a2-e661-4459-9458-fffb1e6196d7

---

## Onboarding prototype → real system

- [ ] **Build SuperAdmin/Owner account activation flow + guided product tour**
  Covers activation, welcome, access-granted, and the 4-step spotlight tour of the dashboard. Copy already branches on whether the account is Owner (SuperAdmin-provisioned) or an invited teammate (Owner-delegated) in the prototype — carry that branch into the real flow.

- [ ] **Replace the "No companies assigned" empty state with a tiered Awaiting-company status view**
  Only the Owner ever sees this. Everyone else is invited straight into a company that already exists, so this step should be removed from the real onboarding flow entirely for non-Owner tiers, not shown disabled.

- [ ] **Wire the First service line archetype picker into real onboarding for new companies**
  Bootstrapping the first-ever service line only happens once, with the Owner. Should not appear for any tier joining an already-configured company.

- [ ] **Implement conditional skip logic for onboarding pages 3, 6, 7 when a company already exists**
  Real-system version of `visibleScreens()` from the prototype. Building the three pages above is not enough on its own — a teammate joining an existing company must never see them, not just see a disabled version.

---

## Invitation prototype → real system

- [ ] **Build owner-delegated invite backend**
  New `invites` table (email, tier, scope, invited_by, company_id, status), an invite-acceptance email flow, and a real password-activation endpoint for the invitee. Owner-delegated, not routed through SuperAdmin.

- [ ] **Enforce the tier-restricted invite rule server-side**
  `invitableTiers(inviterTier)` = all 8 tiers if inviter is Owner (tier 1), else strictly greater than inviter's own tier. Must be enforced on the invite endpoint itself, not just the UI dropdown, or a client bypass lets anyone invite upward.

- [ ] **Restrict who can send invites to Owner + select top tiers only**
  Distinct from the rule above — this restricts *who has invite capability at all*. Per the original action items: only Owner and select top tiers (e.g. CEO) should see an invite option; Program Manager/HR Manager/Scheduler/House Lead should not, even though they'd technically be invitable by an Owner. **Needs a decision on the exact cutoff tier** before the prototype's `invitableTiers()` logic is updated to match.

- [ ] **Add service-line scope to invites**
  Tiers 1–3 (Owner, CEO, Finance) always get whole-company scope, no picker needed. Tier 4+ must pick one of the company's active service lines (TSC, Res Hab Daily today). Store as the scope on the new profile/membership row alongside tier.

- [ ] **Build the in-app Team & Invitations management screen**
  Lives in `AdminPanel.jsx` or `FinancialTool.jsx`: invite form (email, tier, service-line scope) plus a team roster showing each member's tier, scope, and status. Tier options and roster rows must be dynamically limited to what the logged-in user can actually invite and see.

- [ ] **Decide SuperAdmin visibility/approval for owner-delegated invites**
  Cuts across both prototypes. Both currently assume Owner-delegated invites bypass SuperAdmin entirely. Given HIPAA/BAA and per-seat billing, decide whether Intrinsic needs visibility or approval on every new login before building the real invite backend.

- [ ] **Transfer the Onboarding and Invitation prototypes from Claude Workspace into Lovable**
  Process step, not a build task: point Claude Code at the deployed codebase with both artifact links and prompt it to integrate them into the main project. Instruct it to ask clarifying questions on how to merge the two flows before writing code, rather than guessing.

---

## Deployment & branding

- [x] Deploy `budget.intrinsic.agency` subdomain — done during the meeting.
- [ ] **Remove all Lovable branding from the public-facing site**
  Kill the "Edit with Lovable" popup/button and scrub any other Lovable branding. Pure Lovable-project cleanup, unrelated to the onboarding/invitation work.
- [ ] **Debug why the budget tool's public page wasn't rendering after deploy**
  Site wasn't loading properly right after the `budget.intrinsic.agency` deploy went live during the meeting — inspect and fix before treating the deploy as done.

---

## Authentication & SSO (research phase — full build deferred)

- [ ] **Research unified single sign-on across Intrinsic products**
  Scope: `intrinsic.agency` (payment-processing login) vs. `budget.intrinsic.agency` (separate login today) — goal is one login where users see only the tools they have access to. Explore a "Connect through Intrinsic" button on the budget login: route to Intrinsic auth → create the connection → redirect back; fallback path is create-account → route to the Intrinsic product purchase flow. **Explicitly deferred**: Shawn wants the full SSO build tackled later across all 5 middle products, not just the budget tool. Research/scoping only — no implementation yet.
- [ ] **Share SSO and Lovable integration research findings with Shawn**
  Deliverable tied to the research above — write up findings and share before Shawn decides how to sequence the full cross-product SSO build.

---

## Budget/Projection tool (Lovable)

- [ ] **List "Projection and Budget Tools" as a product on the main Intrinsic website**
  Under the Products tab. Description: *"Financial modeling, purpose-built for HCBS agencies."*
- [ ] **Set up PostHog session-recording review**
  When a user email or bug report comes in, pair it with their session recording and watch the replay for friction points before responding. A workflow habit, not a one-time setup task — PostHog masking/HIPAA rules are already documented separately.

---

## Not tracked as separate cards

- Continue building out core financial modeling features while auth gets sorted separately — sequencing guidance, not a discrete task.
