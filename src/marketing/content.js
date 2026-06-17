/**
 * Marketing copy + CTA configuration for the public landing pages.
 *
 * Kept in one place so the Home and Features pages stay consistent and the
 * voice (direct, functional, no hype — matching the login page) is easy to
 * tune. The Features page derives its service-line catalog dynamically from
 * src/serviceLines/types.js, so feature counts there never go stale.
 */

// ── Demo capture ─────────────────────────────────────────────
// mailto for now; a Supabase-backed form is a documented future phase.
// TODO: confirm the real inbox — intrinsic.agency is inferred from the team domain.
export const DEMO_EMAIL = "hello@intrinsic.agency";
export const DEMO_MAILTO =
  `mailto:${DEMO_EMAIL}` +
  `?subject=${encodeURIComponent("Intrinsic demo request")}` +
  `&body=${encodeURIComponent(
    "Hi Intrinsic team,\n\nI'd like to see a demo of the financial modeling tool.\n\n" +
    "Agency:\nMy role:\nWhat we'd like to model:\n\nThanks,"
  )}`;

export const TAGLINE = "Financial Model Builder";
export const FOOTER_LINE = "Idaho HCBS Operations · Intrinsic Inc";

// ── Home: hero ───────────────────────────────────────────────
export const HERO = {
  eyebrow: "For HCBS & IDD provider agencies",
  headline: "Financial modeling purpose-built for HCBS agencies",
  subhead:
    "Model service-line profitability in minutes, not spreadsheets. Plug in your " +
    "staffing, caseloads, and the Idaho Medicaid rates we keep current — and read the margin.",
};

// ── Home: value props ────────────────────────────────────────
export const VALUE_PROPS = [
  {
    title: "Domain expertise, built in",
    body:
      "Idaho Medicaid rates, waiver codes, and billing modalities come encoded — " +
      "no more hunting fee schedules or maintaining a fragile spreadsheet of HCPCS codes.",
  },
  {
    title: "Answer “is this viable?” instantly",
    body:
      "Change a wage, a caseload, or an occupancy assumption and watch gross margin, " +
      "labor ratio, and EBITDA recompute live across the whole service line.",
  },
  {
    title: "One model, every operating type",
    body:
      "Per-diem residential, hourly direct service, caseload coordination, behavioral " +
      "health — each archetype has its own calculator, so the numbers reflect reality.",
  },
  {
    title: "Role-based by design",
    body:
      "Leadership sees the dollars; schedulers and house leads see only the efficiency " +
      "ratios they need. Financial visibility follows the org chart, not the login.",
  },
];

// ── Home: how it works ───────────────────────────────────────
export const STEPS = [
  {
    n: "01",
    title: "Pick a service line",
    body: "Choose from the catalog of Idaho HCBS service lines and archetypes.",
  },
  {
    n: "02",
    title: "Plug in your operations",
    body: "Enter staffing, wages, caseload, occupancy, and overhead — your real numbers.",
  },
  {
    n: "03",
    title: "Read the P&L",
    body: "Get a live P&L with margin, labor ratio, and a viability rating in seconds.",
  },
];

export const TRUST = ["HIPAA-compliant", "Multi-tenant SaaS", "Idaho HCBS focus", "Post-9/1/2025 rates"];

// ── Features: capabilities ───────────────────────────────────
export const CAPABILITIES = [
  {
    title: "Service-line profitability",
    body: "Unit economics for each operating model, from per-diem days to 15-minute units.",
  },
  {
    title: "Labor & staffing optimization",
    body: "Model staffing hours, wages (including graveyard), productivity, and payroll burden.",
  },
  {
    title: "Overhead allocation",
    body: "Distribute indirect cost by revenue, headcount, or manual method across companies.",
  },
  {
    title: "Live margin & viability rating",
    body: "Real-time gross margin, labor ratio, and an efficiency state on every change.",
  },
  {
    title: "Multi-company portfolios",
    body: "Model several operating entities under one licensee and compare them side by side.",
  },
  {
    title: "Integrated Idaho rates",
    body: "Current Medicaid fee schedules and Magellan behavioral-health rates, kept up to date.",
  },
];

// ── Features: roles ──────────────────────────────────────────
export const ROLE_GROUPS = [
  {
    tier: "Leadership",
    roles: "Owner · CEO · Finance",
    body: "Full financial visibility — portfolio P&L, entity structure, margin reporting.",
  },
  {
    tier: "Operations",
    roles: "Regional Director · Program Manager · HR",
    body: "Operational modeling and scenario analysis without exposing strategic financials.",
  },
  {
    tier: "Site & scheduling",
    roles: "Scheduler · House Lead",
    body: "Schedule and occupancy views with labor expressed as ratios, not wage dollars.",
  },
];
