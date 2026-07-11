import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  STEPS,
  visibleSteps,
  firstPendingStep,
  getTourStops,
  welcomeBullet,
  accessBlurb,
  doneSummary,
  loadLocalProgress,
  saveLocalProgress,
  clearLocalProgress,
} from "../onboarding.js";
import { ROLES } from "../access.js";

const { OWNER, CEO, FINANCE, REGIONAL_DIRECTOR: RD, PROGRAM_MANAGER: PM, HR_MANAGER: HR, SCHEDULER: SCHED, HOUSE_LEAD: HL } = ROLES;

function ctx(overrides = {}) {
  return {
    role: OWNER,
    provenance: "owner",
    companyCount: 1,
    selectedCompanySLCount: 1,
    multiCompany: false,
    firstLineJustCreated: false,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────
// visibleSteps — the full predicate matrix
// ──────────────────────────────────────────────────────────────────────

describe("visibleSteps", () => {
  it("Owner with no company yet: sees awaiting_company, first_line, line_result (transient) removed since no company exists", () => {
    const steps = visibleSteps(ctx({ provenance: "owner", companyCount: 0, selectedCompanySLCount: 0 }));
    expect(steps).toContain("awaiting_company");
    // first_line requires companyCount > 0 — can't pick a line before a company exists
    expect(steps).not.toContain("first_line");
    expect(steps).not.toContain("line_result");
  });

  it("Owner with a company that already has service lines: skips awaiting_company, first_line, line_result", () => {
    const steps = visibleSteps(ctx({ provenance: "owner", companyCount: 1, selectedCompanySLCount: 2 }));
    expect(steps).not.toContain("awaiting_company");
    expect(steps).not.toContain("first_line");
    expect(steps).not.toContain("line_result");
    expect(steps).toEqual(["welcome", "access_granted", "tour", "invite_team", "done"]);
  });

  it("Owner with a company and zero service lines: sees first_line, not line_result (until it fires)", () => {
    const steps = visibleSteps(ctx({ provenance: "owner", companyCount: 1, selectedCompanySLCount: 0 }));
    expect(steps).toContain("first_line");
    expect(steps).not.toContain("line_result");
  });

  it("line_result appears only when firstLineJustCreated is true", () => {
    const steps = visibleSteps(ctx({ provenance: "owner", companyCount: 1, selectedCompanySLCount: 0, firstLineJustCreated: true }));
    expect(steps).toContain("line_result");
  });

  it("invited teammate (any tier): bootstrap steps 3/6/7 never appear, even with zero service lines or zero companies", () => {
    for (const role of [PM, SCHED, HL]) {
      const steps = visibleSteps(ctx({ role, provenance: "invited", companyCount: 0, selectedCompanySLCount: 0 }));
      expect(steps).not.toContain("awaiting_company");
      expect(steps).not.toContain("first_line");
      expect(steps).not.toContain("line_result");
    }
  });

  it("invited PROGRAM_MANAGER (tier 5): sees invite_team (can invite tiers 6-8)", () => {
    const steps = visibleSteps(ctx({ role: PM, provenance: "invited" }));
    expect(steps).toContain("invite_team");
  });

  it("invited SCHEDULER (tier 7): still sees invite_team (can invite House Lead)", () => {
    const steps = visibleSteps(ctx({ role: SCHED, provenance: "invited" }));
    expect(steps).toContain("invite_team");
  });

  it("invited HOUSE_LEAD (tier 8): invite_team is removed — nobody below to invite", () => {
    const steps = visibleSteps(ctx({ role: HL, provenance: "invited" }));
    expect(steps).not.toContain("invite_team");
  });

  it("read-only tiers (7-8) still see welcome/access_granted/tour/done", () => {
    for (const role of [SCHED, HL]) {
      const steps = visibleSteps(ctx({ role, provenance: "invited" }));
      expect(steps).toEqual(expect.arrayContaining(["welcome", "access_granted", "tour", "done"]));
    }
  });

  it("first_line requires canAddServiceLine — a Program Manager Owner-provenance edge case is excluded", () => {
    // Provenance 'owner' with a tier that cannot add service lines (defensive:
    // shouldn't occur in practice since Owners are tier 1, but the predicate
    // must not assume it).
    const steps = visibleSteps(ctx({ role: PM, provenance: "owner", companyCount: 1, selectedCompanySLCount: 0 }));
    expect(steps).not.toContain("first_line");
  });

  it("welcome, access_granted, tour, done are always present regardless of context", () => {
    const always = ["welcome", "access_granted", "tour", "done"];
    const contexts = [
      ctx({ provenance: "owner", companyCount: 0 }),
      ctx({ role: HL, provenance: "invited" }),
      ctx({ role: FINANCE, provenance: "owner", companyCount: 3, selectedCompanySLCount: 5 }),
    ];
    for (const c of contexts) {
      const steps = visibleSteps(c);
      for (const step of always) expect(steps).toContain(step);
    }
  });

  it("preserves canonical STEPS order", () => {
    const steps = visibleSteps(ctx({ provenance: "owner", companyCount: 0, selectedCompanySLCount: 0 }));
    const indices = steps.map((s) => STEPS.indexOf(s));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

// ──────────────────────────────────────────────────────────────────────
// firstPendingStep — resume, with revalidation against live state
// ──────────────────────────────────────────────────────────────────────

describe("firstPendingStep", () => {
  it("null/unknown lastCompletedStep resumes at the first visible step", () => {
    const c = ctx({ provenance: "owner", companyCount: 0, selectedCompanySLCount: 0 });
    expect(firstPendingStep(c, null)).toBe("welcome");
    expect(firstPendingStep(c, "not-a-real-step")).toBe("welcome");
  });

  it("resumes at the next visible step after the last completed one", () => {
    const c = ctx({ provenance: "owner", companyCount: 1, selectedCompanySLCount: 2 }); // no bootstrap steps
    expect(firstPendingStep(c, "welcome")).toBe("access_granted");
    expect(firstPendingStep(c, "access_granted")).toBe("tour");
  });

  it("revalidates stale progress: a user who completed first_line before a company got service lines resumes correctly", () => {
    // localStorage says "done with first_line", but live state now shows the
    // company already has lines (e.g. someone else added one) — first_line
    // and line_result are no longer visible, so resume should land on the
    // next step that IS visible, not get stuck looking for first_line again.
    const c = ctx({ provenance: "owner", companyCount: 1, selectedCompanySLCount: 3 });
    const next = firstPendingStep(c, "first_line");
    expect(next).toBe("invite_team");
  });

  it("an invited teammate whose stale progress points at a bootstrap step skips straight past it", () => {
    const c = ctx({ role: PM, provenance: "invited" });
    // Stale/impossible for this provenance, but must not crash or loop.
    expect(firstPendingStep(c, "awaiting_company")).toBe("access_granted");
  });

  it("lastCompletedStep at the tail returns the last visible step (done) rather than null", () => {
    const c = ctx({ provenance: "owner", companyCount: 1, selectedCompanySLCount: 2 });
    expect(firstPendingStep(c, "invite_team")).toBe("done");
    expect(firstPendingStep(c, "done")).toBe("done");
  });

  it("returns null only when visibleSteps is somehow empty (defensive — never happens given always-true steps)", () => {
    // Sanity: welcome/access_granted/tour/done predicates are all () => true,
    // so visibleSteps is never empty in practice; this just documents the contract.
    expect(visibleSteps(ctx()).length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// getTourStops — target/copy filtering
// ──────────────────────────────────────────────────────────────────────

describe("getTourStops", () => {
  it("drops the switcher stop when there is only one company", () => {
    const stops = getTourStops({ role: OWNER, multiCompany: false });
    expect(stops.map((s) => s.id)).not.toContain("switcher");
  });

  it("includes the switcher stop first when multiCompany is true", () => {
    const stops = getTourStops({ role: OWNER, multiCompany: true });
    expect(stops[0].id).toBe("switcher");
  });

  it("always includes shared, strip, and save stops", () => {
    const stops = getTourStops({ role: CEO, multiCompany: false });
    expect(stops.map((s) => s.id)).toEqual(["shared", "strip", "save"]);
  });

  it("read-only tiers (7-8) get the save stop anchored to the tab strip, not the save button", () => {
    for (const role of [SCHED, HL]) {
      const stops = getTourStops({ role, multiCompany: false });
      const save = stops.find((s) => s.id === "save");
      expect(save.target).toBe("tab-strip");
      expect(save.body).toMatch(/read-only/i);
    }
  });

  it("tiers 1-6 get the save stop anchored to the real save button", () => {
    for (const role of [OWNER, CEO, FINANCE, RD, PM, HR]) {
      const stops = getTourStops({ role, multiCompany: false });
      const save = stops.find((s) => s.id === "save");
      expect(save.target).toBe("save-button");
    }
  });

  it("the strip stop mentions adding lines only for tiers that can add them", () => {
    const canAdd = getTourStops({ role: OWNER, multiCompany: false }).find((s) => s.id === "strip");
    const cannotAdd = getTourStops({ role: HR, multiCompany: false }).find((s) => s.id === "strip");
    expect(canAdd.body).toMatch(/add new lines/i);
    expect(cannotAdd.body).not.toMatch(/add new lines/i);
  });

  it("the strip stop's who-can-add-lines copy matches canAddServiceLine exactly (tiers 1-4, not 5)", () => {
    const body = getTourStops({ role: HR, multiCompany: false }).find((s) => s.id === "strip").body;
    expect(body).toMatch(/Owner\/CEO\/Finance\/Regional Director-only/);
    expect(body).not.toMatch(/Program Manager/);
  });

  it("the shared stop differentiates Scheduler (percent, still sees occupancy) from House Lead (hidden)", () => {
    const schedBody = getTourStops({ role: SCHED, multiCompany: false }).find((s) => s.id === "shared").body;
    const hlBody = getTourStops({ role: HL, multiCompany: false }).find((s) => s.id === "shared").body;
    expect(schedBody).not.toBe(hlBody);
    expect(schedBody).toMatch(/percentage/i);
    expect(hlBody).toMatch(/hidden/i);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Tier copy tables — non-crashing, tier-differentiated
// ──────────────────────────────────────────────────────────────────────

describe("welcomeBullet", () => {
  it("returns a distinct bullet per tier band", () => {
    const bullets = [OWNER, CEO, RD, SCHED, HL].map((r) => welcomeBullet(r).title);
    expect(new Set(bullets).size).toBe(bullets.length);
  });
});

describe("accessBlurb", () => {
  it("credits Intrinsic for an owner and the inviting Owner for a teammate", () => {
    expect(accessBlurb(OWNER, "owner")).toMatch(/Intrinsic/);
    expect(accessBlurb(CEO, "invited")).toMatch(/Owner who invited you/);
  });
});

describe("doneSummary", () => {
  it("owner summary mentions configuring a first service line", () => {
    const summary = doneSummary({ role: OWNER, provenance: "owner" });
    expect(summary.checklist.some((c) => /service line/i.test(c))).toBe(true);
  });

  it("invited + canAddServiceLine gets the add-a-line next step", () => {
    const summary = doneSummary({ role: RD, provenance: "invited" });
    expect(summary.nextSteps.some((s) => /add a new service line/i.test(s))).toBe(true);
  });

  it("invited + read-only tier gets the nothing-to-save copy", () => {
    const summary = doneSummary({ role: HL, provenance: "invited" });
    expect(summary.nextSteps.some((s) => /nothing to save/i.test(s))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// localStorage progress helpers
// ──────────────────────────────────────────────────────────────────────

describe("local progress storage", () => {
  // Node 22+'s own experimental global `localStorage` (file-backed, inert
  // without a valid path) can shadow jsdom's working implementation in this
  // runner — stub a plain in-memory Storage so these tests are deterministic
  // regardless of which global wins.
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    });
  });

  it("round-trips a step for a given uid", () => {
    saveLocalProgress("user-1", "tour");
    expect(loadLocalProgress("user-1")).toBe("tour");
  });

  it("is scoped per uid", () => {
    saveLocalProgress("user-1", "tour");
    saveLocalProgress("user-2", "done");
    expect(loadLocalProgress("user-1")).toBe("tour");
    expect(loadLocalProgress("user-2")).toBe("done");
  });

  it("returns null for an unknown uid", () => {
    expect(loadLocalProgress("nobody")).toBeNull();
  });

  it("clearLocalProgress removes the stored step", () => {
    saveLocalProgress("user-1", "tour");
    clearLocalProgress("user-1");
    expect(loadLocalProgress("user-1")).toBeNull();
  });

  it("no-ops safely without throwing when uid is falsy", () => {
    expect(() => saveLocalProgress(null, "tour")).not.toThrow();
    expect(loadLocalProgress(null)).toBeNull();
    expect(() => clearLocalProgress(undefined)).not.toThrow();
  });

  it("swallows storage errors (e.g. quota/private mode) without throwing", () => {
    localStorage.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(() => saveLocalProgress("user-1", "tour")).not.toThrow();
  });
});
