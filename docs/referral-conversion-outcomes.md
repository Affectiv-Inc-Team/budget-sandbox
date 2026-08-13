# Referral Conversion / Outcome Tracking

Lets intake staff close a referral out with a structured outcome so the active
board stays clean and the agency can see *why* referrals didn't convert.

## Data

No schema change — uses existing `referrals` columns:

| Column | Use |
|---|---|
| `outcome` | conversion outcome value (see below) |
| `outcome_reason` | structured reason string picked from `OUTCOME_REASONS` |
| `decision_date` | auto-defaults to today when an outcome is picked |
| `stage` | auto-set from the outcome's mapped stage |
| `details.outcome_note` | free-text notes |
| `details.outcome_destination` | where they went (competing provider / program) |

## Outcomes (`src/lib/referralShape.js`)

| Value | Label | Converted | Stays on Active board |
|---|---|---|---|
| `in_services` | In services (converted) | yes | no |
| `accepted_pending` | Accepted — pending placement | yes | yes |
| `waitlisted` | Waitlisted (still ours) | no | yes |
| `chose_other_provider` | Chose another company | no | no |
| `declined_services` | Decided not to access services | no | no |
| `we_declined` | We declined the referral | no | no |
| `referred_out` | Referred out | no | no |
| `not_eligible` | Not eligible / no funding | no | no |
| `lost_contact` | Lost contact / no response | no | no |
| `withdrawn` | Withdrawn by family | no | no |

Legacy values `enrolled` and `declined` remain readable (labelled "(legacy)")
but are not selectable.

Helpers: `SELECTABLE_OUTCOMES`, `outcomeMeta(value)`, `isClosedOutcome(value)`,
`OUTCOME_REASONS[outcome]` (reason picklists per outcome).

## UI (`src/pages/ReferralTracker.jsx`)

- **Conversion summary** above the list: conversion rate (converted ÷ closed)
  plus a "Why we didn't get them" breakdown counted by outcome.
- **Active / Closed / All** filter tabs; closed referrals drop off Active.
- List cards show a colored outcome pill and the recorded reason.
- **Section 10 · Outcome / conversion** is now a one-click convert/close panel:
  picking an outcome sets the pipeline stage, defaults the decision date to
  today, and swaps the reason field to that outcome's picklist.
