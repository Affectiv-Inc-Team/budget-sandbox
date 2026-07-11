import { describe, it, expect } from "vitest";
import {
  ROLES,
  ROLE_TIERS,
  canSeeCompanyDollars,
  wageDisplayMode,
  canSeePercentages,
  budgetRowVisibility,
  canSeeControl,
  editMode,
  canSeeTopNumbers,
  canEditServiceLines,
  canAddServiceLine,
  canSeeReferrals,
  canUnmaskSSN,
  invitableTiers,
  invitableRoles,
  canInviteRole,
  accessRoleForTier,
} from "../access.js";

const { OWNER, CEO, FINANCE, REGIONAL_DIRECTOR: RD, PROGRAM_MANAGER: PM, HR_MANAGER: HR, SCHEDULER: SCHED, HOUSE_LEAD: HL } = ROLES;

// ──────────────────────────────────────────────────────────────────────
// canSeeCompanyDollars
// ──────────────────────────────────────────────────────────────────────

describe("canSeeCompanyDollars", () => {
  it("returns true for tiers 1–3 (OWNER, CEO, FINANCE)", () => {
    expect(canSeeCompanyDollars(OWNER)).toBe(true);
    expect(canSeeCompanyDollars(CEO)).toBe(true);
    expect(canSeeCompanyDollars(FINANCE)).toBe(true);
  });

  it("returns false for tiers 4–8", () => {
    expect(canSeeCompanyDollars(RD)).toBe(false);
    expect(canSeeCompanyDollars(PM)).toBe(false);
    expect(canSeeCompanyDollars(HR)).toBe(false);
    expect(canSeeCompanyDollars(SCHED)).toBe(false);
    expect(canSeeCompanyDollars(HL)).toBe(false);
  });

  it("returns false for unknown / undefined role", () => {
    expect(canSeeCompanyDollars("UNKNOWN")).toBe(false);
    expect(canSeeCompanyDollars(undefined)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// wageDisplayMode
// ──────────────────────────────────────────────────────────────────────

describe("wageDisplayMode", () => {
  it("returns 'dollars' for tiers 1–6", () => {
    for (const role of [OWNER, CEO, FINANCE, RD, PM, HR]) {
      expect(wageDisplayMode(role)).toBe("dollars");
    }
  });

  it("returns 'percent' for tier 7 (SCHEDULER)", () => {
    expect(wageDisplayMode(SCHED)).toBe("percent");
  });

  it("returns 'hidden' for tier 8 (HOUSE_LEAD)", () => {
    expect(wageDisplayMode(HL)).toBe("hidden");
  });

  it("returns 'hidden' for unknown / undefined role", () => {
    expect(wageDisplayMode("UNKNOWN")).toBe("hidden");
    expect(wageDisplayMode(undefined)).toBe("hidden");
  });
});

// ──────────────────────────────────────────────────────────────────────
// canSeePercentages
// ──────────────────────────────────────────────────────────────────────

describe("canSeePercentages", () => {
  it("returns true for every defined role", () => {
    for (const role of Object.values(ROLES)) {
      expect(canSeePercentages(role)).toBe(true);
    }
  });

  it("returns true for unknown / undefined role", () => {
    expect(canSeePercentages("UNKNOWN")).toBe(true);
    expect(canSeePercentages(undefined)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// budgetRowVisibility
// ──────────────────────────────────────────────────────────────────────

describe("budgetRowVisibility", () => {
  it("tiers 1–3 always return 'dollars' regardless of row tier", () => {
    for (const role of [OWNER, CEO, FINANCE]) {
      for (const rowTier of [1, 2, 3, 4, 5, 6, 7, 8]) {
        expect(budgetRowVisibility(role, rowTier)).toBe("dollars");
      }
    }
  });

  it("tier 8 (HOUSE_LEAD) returns 'dollars' for own row, 'hidden' for all others", () => {
    expect(budgetRowVisibility(HL, 8)).toBe("dollars");
    expect(budgetRowVisibility(HL, 7)).toBe("hidden");
    expect(budgetRowVisibility(HL, 5)).toBe("hidden");
    expect(budgetRowVisibility(HL, 1)).toBe("hidden");
  });

  it("tiers 4–7 return 'dollars' for own row, 'percent' for rows below, 'hidden' for rows above", () => {
    // REGIONAL_DIRECTOR = tier 4
    expect(budgetRowVisibility(RD, 4)).toBe("dollars"); // own
    expect(budgetRowVisibility(RD, 5)).toBe("percent"); // below
    expect(budgetRowVisibility(RD, 8)).toBe("percent"); // further below
    expect(budgetRowVisibility(RD, 3)).toBe("hidden");  // above
    expect(budgetRowVisibility(RD, 1)).toBe("hidden");  // further above

    // PROGRAM_MANAGER = tier 5
    expect(budgetRowVisibility(PM, 5)).toBe("dollars");
    expect(budgetRowVisibility(PM, 6)).toBe("percent");
    expect(budgetRowVisibility(PM, 4)).toBe("hidden");

    // SCHEDULER = tier 7
    expect(budgetRowVisibility(SCHED, 7)).toBe("dollars");
    expect(budgetRowVisibility(SCHED, 8)).toBe("percent");
    expect(budgetRowVisibility(SCHED, 6)).toBe("hidden");
  });
});

// ──────────────────────────────────────────────────────────────────────
// canSeeControl
// ──────────────────────────────────────────────────────────────────────

describe("canSeeControl", () => {
  it("tier-3 controls (entityType, ownerRate, mgmtFee, billingFee) visible only to tiers 1–3", () => {
    for (const id of ["entityType", "ownerRate", "mgmtFee", "billingFee"]) {
      expect(canSeeControl(FINANCE, id)).toBe(true);
      expect(canSeeControl(RD, id)).toBe(false);
    }
  });

  it("tier-5 controls (resHabRates, tscRates) visible to tiers 1–5", () => {
    expect(canSeeControl(PM, "resHabRates")).toBe(true);
    expect(canSeeControl(HR, "resHabRates")).toBe(false);
    expect(canSeeControl(PM, "tscRates")).toBe(true);
    expect(canSeeControl(HR, "tscRates")).toBe(false);
  });

  it("tier-6 controls (wage, graveyardWage) visible to tiers 1–6", () => {
    expect(canSeeControl(HR, "wage")).toBe(true);
    expect(canSeeControl(SCHED, "wage")).toBe(false);
    expect(canSeeControl(HR, "graveyardWage")).toBe(true);
    expect(canSeeControl(SCHED, "graveyardWage")).toBe(false);
  });

  it("tier-7 control (occupancy) visible to tiers 1–7", () => {
    expect(canSeeControl(SCHED, "occupancy")).toBe(true);
    expect(canSeeControl(HL, "occupancy")).toBe(false);
  });

  it("unknown controlId defaults to tier ≤3 (most restricted)", () => {
    expect(canSeeControl(FINANCE, "unknownControl")).toBe(true);
    expect(canSeeControl(RD, "unknownControl")).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// editMode
// ──────────────────────────────────────────────────────────────────────

describe("editMode", () => {
  it("returns 'full' for tiers 1–3", () => {
    expect(editMode(OWNER)).toBe("full");
    expect(editMode(CEO)).toBe("full");
    expect(editMode(FINANCE)).toBe("full");
  });

  it("returns 'operational' for tiers 4–6", () => {
    expect(editMode(RD)).toBe("operational");
    expect(editMode(PM)).toBe("operational");
    expect(editMode(HR)).toBe("operational");
  });

  it("returns 'readonly' for tiers 7–8", () => {
    expect(editMode(SCHED)).toBe("readonly");
    expect(editMode(HL)).toBe("readonly");
  });

  it("returns 'readonly' for unknown role", () => {
    expect(editMode("UNKNOWN")).toBe("readonly");
    expect(editMode(undefined)).toBe("readonly");
  });
});

// ──────────────────────────────────────────────────────────────────────
// canSeeTopNumbers
// ──────────────────────────────────────────────────────────────────────

describe("canSeeTopNumbers", () => {
  it("returns true for tiers 1–4", () => {
    expect(canSeeTopNumbers(OWNER)).toBe(true);
    expect(canSeeTopNumbers(CEO)).toBe(true);
    expect(canSeeTopNumbers(FINANCE)).toBe(true);
    expect(canSeeTopNumbers(RD)).toBe(true);
  });

  it("returns false for tiers 5–8", () => {
    expect(canSeeTopNumbers(PM)).toBe(false);
    expect(canSeeTopNumbers(HR)).toBe(false);
    expect(canSeeTopNumbers(SCHED)).toBe(false);
    expect(canSeeTopNumbers(HL)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// canEditServiceLines
// ──────────────────────────────────────────────────────────────────────

describe("canEditServiceLines", () => {
  it("returns true for tiers 1–4", () => {
    expect(canEditServiceLines(OWNER)).toBe(true);
    expect(canEditServiceLines(CEO)).toBe(true);
    expect(canEditServiceLines(FINANCE)).toBe(true);
    expect(canEditServiceLines(RD)).toBe(true);
  });

  it("returns false for tiers 5–8", () => {
    expect(canEditServiceLines(PM)).toBe(false);
    expect(canEditServiceLines(HR)).toBe(false);
    expect(canEditServiceLines(SCHED)).toBe(false);
    expect(canEditServiceLines(HL)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// canAddServiceLine
// ──────────────────────────────────────────────────────────────────────

describe("canAddServiceLine", () => {
  it("returns true for tiers 1–4", () => {
    expect(canAddServiceLine(OWNER)).toBe(true);
    expect(canAddServiceLine(CEO)).toBe(true);
    expect(canAddServiceLine(FINANCE)).toBe(true);
    expect(canAddServiceLine(RD)).toBe(true);
  });

  it("returns false for tiers 5–8", () => {
    expect(canAddServiceLine(PM)).toBe(false);
    expect(canAddServiceLine(HR)).toBe(false);
    expect(canAddServiceLine(SCHED)).toBe(false);
    expect(canAddServiceLine(HL)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// canSeeReferrals — floor is PROGRAM_MANAGER (tier 5)
// ──────────────────────────────────────────────────────────────────────

describe("canSeeReferrals", () => {
  it("returns true for tiers 1–5 (OWNER … PROGRAM_MANAGER)", () => {
    expect(canSeeReferrals(OWNER)).toBe(true);
    expect(canSeeReferrals(CEO)).toBe(true);
    expect(canSeeReferrals(FINANCE)).toBe(true);
    expect(canSeeReferrals(RD)).toBe(true);
    expect(canSeeReferrals(PM)).toBe(true);
  });

  it("returns false below the floor (HR_MANAGER and down)", () => {
    expect(canSeeReferrals(HR)).toBe(false);
    expect(canSeeReferrals(SCHED)).toBe(false);
    expect(canSeeReferrals(HL)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// canUnmaskSSN — restricted to tiers 1–3
// ──────────────────────────────────────────────────────────────────────

describe("canUnmaskSSN", () => {
  it("returns true for tiers 1–3 (OWNER, CEO, FINANCE)", () => {
    expect(canUnmaskSSN(OWNER)).toBe(true);
    expect(canUnmaskSSN(CEO)).toBe(true);
    expect(canUnmaskSSN(FINANCE)).toBe(true);
  });

  it("returns false for tiers 4–8, including Regional Director", () => {
    expect(canUnmaskSSN(RD)).toBe(false);
    expect(canUnmaskSSN(PM)).toBe(false);
    expect(canUnmaskSSN(HR)).toBe(false);
    expect(canUnmaskSSN(SCHED)).toBe(false);
    expect(canUnmaskSSN(HL)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// invitableTiers — Owner invites any tier; others only strictly below
// ──────────────────────────────────────────────────────────────────────

describe("invitableTiers", () => {
  it("OWNER can invite every tier, including another OWNER", () => {
    expect(invitableTiers(OWNER)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("non-Owner tiers invite only tiers strictly below their own", () => {
    expect(invitableTiers(CEO)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(invitableTiers(FINANCE)).toEqual([4, 5, 6, 7, 8]);
    expect(invitableTiers(RD)).toEqual([5, 6, 7, 8]);
    expect(invitableTiers(PM)).toEqual([6, 7, 8]);
    expect(invitableTiers(HR)).toEqual([7, 8]);
    expect(invitableTiers(SCHED)).toEqual([8]);
  });

  it("HOUSE_LEAD can invite nobody — no tier below it", () => {
    expect(invitableTiers(HL)).toEqual([]);
  });

  it("unknown / undefined role can invite nobody", () => {
    expect(invitableTiers("UNKNOWN")).toEqual([]);
    expect(invitableTiers(undefined)).toEqual([]);
    expect(invitableTiers(null)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// invitableRoles — role-key view of invitableTiers
// ──────────────────────────────────────────────────────────────────────

describe("invitableRoles", () => {
  it("OWNER gets all 8 roles", () => {
    expect(invitableRoles(OWNER)).toEqual(Object.keys(ROLE_TIERS));
  });

  it("CEO gets FINANCE down — no OWNER, no CEO", () => {
    const roles = invitableRoles(CEO);
    expect(roles).not.toContain(OWNER);
    expect(roles).not.toContain(CEO);
    expect(roles).toEqual([FINANCE, RD, PM, HR, SCHED, HL]);
  });

  it("HR_MANAGER gets only SCHEDULER and HOUSE_LEAD", () => {
    expect(invitableRoles(HR)).toEqual([SCHED, HL]);
  });

  it("HOUSE_LEAD and unknown roles get an empty list", () => {
    expect(invitableRoles(HL)).toEqual([]);
    expect(invitableRoles(undefined)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// canInviteRole — pairwise checks
// ──────────────────────────────────────────────────────────────────────

describe("canInviteRole", () => {
  it("OWNER can invite another OWNER (the one same-tier exception)", () => {
    expect(canInviteRole(OWNER, OWNER)).toBe(true);
  });

  it("no other tier can invite its own tier or above", () => {
    expect(canInviteRole(CEO, OWNER)).toBe(false);
    expect(canInviteRole(CEO, CEO)).toBe(false);
    expect(canInviteRole(FINANCE, CEO)).toBe(false);
    expect(canInviteRole(PM, RD)).toBe(false);
    expect(canInviteRole(HL, HL)).toBe(false);
  });

  it("every tier above HOUSE_LEAD can invite strictly below itself", () => {
    expect(canInviteRole(CEO, FINANCE)).toBe(true);
    expect(canInviteRole(FINANCE, RD)).toBe(true);
    expect(canInviteRole(HR, SCHED)).toBe(true);
    expect(canInviteRole(SCHED, HL)).toBe(true);
  });

  it("unknown inviter or target can never invite / be invited", () => {
    expect(canInviteRole("UNKNOWN", HL)).toBe(false);
    expect(canInviteRole(OWNER, "UNKNOWN")).toBe(false);
    expect(canInviteRole(undefined, undefined)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// accessRoleForTier — company access level derived from tier at invite time
// ──────────────────────────────────────────────────────────────────────

describe("accessRoleForTier", () => {
  it("tiers 1–3 map to admin", () => {
    expect(accessRoleForTier(1)).toBe("admin");
    expect(accessRoleForTier(2)).toBe("admin");
    expect(accessRoleForTier(3)).toBe("admin");
  });

  it("tiers 4–6 map to editor", () => {
    expect(accessRoleForTier(4)).toBe("editor");
    expect(accessRoleForTier(5)).toBe("editor");
    expect(accessRoleForTier(6)).toBe("editor");
  });

  it("tiers 7–8 map to read_only, matching editMode readonly", () => {
    expect(accessRoleForTier(7)).toBe("read_only");
    expect(accessRoleForTier(8)).toBe("read_only");
    expect(editMode(SCHED)).toBe("readonly");
    expect(editMode(HL)).toBe("readonly");
  });
});
