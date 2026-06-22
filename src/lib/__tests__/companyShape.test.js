import { describe, it, expect } from "vitest";
import {
  idFor,
  createSharedConfig,
  createServiceLine,
  createCompany,
  createEmptyConfig,
  migrateConfig,
  validateConfig,
  isNewShape,
  getSelectedCompany,
  getSelectedServiceLine,
  getServiceLineByType,
} from "../companyShape.js";

// ──────────────────────────────────────────────────────────────────────
// ID generation
// ──────────────────────────────────────────────────────────────────────

describe("idFor.company()", () => {
  it("returns a string starting with co_", () => {
    expect(idFor.company()).toMatch(/^co_/);
  });

  it("generates unique IDs across repeated calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => idFor.company()));
    expect(ids.size).toBe(50);
  });
});

describe("idFor.serviceLine()", () => {
  it("returns a string starting with sl_", () => {
    expect(idFor.serviceLine()).toMatch(/^sl_/);
  });

  it("generates unique IDs across repeated calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => idFor.serviceLine()));
    expect(ids.size).toBe(50);
  });
});

// ──────────────────────────────────────────────────────────────────────
// createSharedConfig
// ──────────────────────────────────────────────────────────────────────

describe("createSharedConfig", () => {
  it("returns correct defaults with no arguments", () => {
    const cfg = createSharedConfig();
    expect(cfg.wage).toBe(16);
    expect(cfg.graveyardWage).toBe(9.5);
    expect(cfg.occupancy).toBe(95);
    expect(cfg.entityType).toBe("ccorp");
    expect(cfg.ownerRate).toBe(32);
    expect(cfg.mgmtFeePct).toBe(5);
    expect(cfg.billingFeePct).toBe(1);
    expect(cfg.allocationMethod).toBe("revenue");
  });

  it("populates nested defaults", () => {
    const cfg = createSharedConfig();
    expect(Array.isArray(cfg.mgmt)).toBe(true);
    expect(Array.isArray(cfg.overhead)).toBe(true);
    expect(cfg.mgmt).toHaveLength(0);
    expect(cfg.overhead).toHaveLength(0);
    expect(cfg.sharedOverhead.fixedAnnual).toBe(0);
    expect(cfg.sharedOverhead.perHomePerMonth).toBe(0);
    expect(cfg.sharedOverhead.perParticipantPerMonth).toBe(0);
    expect(cfg.sharedOverhead.perCoordinatorPerMonth).toBe(0);
  });

  it("includes default Res Hab rates", () => {
    const { rates } = createSharedConfig();
    expect(rates.intenseDaily).toBe(678.77);
    expect(rates.highDaily).toBe(368.67);
    expect(rates.iuUnit).toBe(7.07);
    expect(rates.igUnit).toBe(3.61);
  });

  it("merges overrides without clobbering other defaults", () => {
    const cfg = createSharedConfig({ wage: 20 });
    expect(cfg.wage).toBe(20);
    expect(cfg.graveyardWage).toBe(9.5);
    expect(cfg.mgmtFeePct).toBe(5);
  });

  it("accepts multiple overrides simultaneously", () => {
    const cfg = createSharedConfig({ wage: 22, entityType: "scorp", mgmtFeePct: 8 });
    expect(cfg.wage).toBe(22);
    expect(cfg.entityType).toBe("scorp");
    expect(cfg.mgmtFeePct).toBe(8);
    expect(cfg.billingFeePct).toBe(1); // unaffected default
  });
});

// ──────────────────────────────────────────────────────────────────────
// createServiceLine
// ──────────────────────────────────────────────────────────────────────

describe("createServiceLine", () => {
  it("creates a service line with correct type", () => {
    const sl = createServiceLine("TSC");
    expect(sl.type).toBe("TSC");
  });

  it("generates an id starting with sl_", () => {
    const sl = createServiceLine("TSC");
    expect(sl.id).toMatch(/^sl_/);
  });

  it("defaults to archived=false and overheadOverride=null", () => {
    const sl = createServiceLine("TSC");
    expect(sl.archived).toBe(false);
    expect(sl.overheadOverride).toBeNull();
  });

  it("defaults name to empty string", () => {
    expect(createServiceLine("TSC").name).toBe("");
  });

  it("populates config via getDefaultConfig for the given type", () => {
    const sl = createServiceLine("TSC");
    expect(sl.config).toBeDefined();
    expect(Array.isArray(sl.config.coordinators)).toBe(true);
  });

  it("merges overrides on top of defaults", () => {
    const sl = createServiceLine("TSC", { name: "My TSC Line" });
    expect(sl.name).toBe("My TSC Line");
    expect(sl.type).toBe("TSC");
    expect(sl.archived).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// createCompany
// ──────────────────────────────────────────────────────────────────────

describe("createCompany", () => {
  it("generates an id starting with co_", () => {
    expect(createCompany("Alpha").id).toMatch(/^co_/);
  });

  it("stores the given name", () => {
    expect(createCompany("Alpha").name).toBe("Alpha");
  });

  it("falls back to 'New Company' for empty name", () => {
    expect(createCompany("").name).toBe("New Company");
  });

  it("defaults to archived=false", () => {
    expect(createCompany("Alpha").archived).toBe(false);
  });

  it("defaults serviceLines to empty array", () => {
    const co = createCompany("Alpha");
    expect(Array.isArray(co.serviceLines)).toBe(true);
    expect(co.serviceLines).toHaveLength(0);
  });

  it("includes a shared config with defaults", () => {
    const co = createCompany("Alpha");
    expect(co.shared.wage).toBe(16);
    expect(co.shared.entityType).toBe("ccorp");
  });

  it("merges overrides", () => {
    const co = createCompany("Alpha", { archived: true });
    expect(co.archived).toBe(true);
    expect(co.name).toBe("Alpha");
  });
});

// ──────────────────────────────────────────────────────────────────────
// createEmptyConfig
// ──────────────────────────────────────────────────────────────────────

describe("createEmptyConfig", () => {
  it("returns a v2 config", () => {
    expect(createEmptyConfig().version).toBe(2);
  });

  it("has exactly one company", () => {
    expect(createEmptyConfig().companies).toHaveLength(1);
  });

  it("selectedCompanyId matches the company id", () => {
    const cfg = createEmptyConfig();
    expect(cfg.selectedCompanyId).toBe(cfg.companies[0].id);
  });

  it("selectedServiceLineId is null", () => {
    expect(createEmptyConfig().selectedServiceLineId).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// isNewShape
// ──────────────────────────────────────────────────────────────────────

describe("isNewShape", () => {
  it("returns true for v2 config", () => {
    expect(isNewShape({ version: 2, companies: [] })).toBe(true);
  });

  it("returns falsy for null", () => {
    expect(isNewShape(null)).toBeFalsy();
  });

  it("returns false for v1 flat shape", () => {
    expect(isNewShape({ wage: 18, homeTypes: [] })).toBe(false);
  });

  it("returns false for missing version", () => {
    expect(isNewShape({ companies: [] })).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// migrateConfig
// ──────────────────────────────────────────────────────────────────────

describe("migrateConfig — null / empty input", () => {
  it("handles null → returns a v2 config", () => {
    expect(migrateConfig(null).version).toBe(2);
  });

  it("null → has exactly one company", () => {
    expect(migrateConfig(null).companies).toHaveLength(1);
  });

  it("null → selectedCompanyId matches the company id", () => {
    const result = migrateConfig(null);
    expect(result.selectedCompanyId).toBe(result.companies[0].id);
  });

  it("null → selectedServiceLineId is null", () => {
    expect(migrateConfig(null).selectedServiceLineId).toBeNull();
  });

  it("handles undefined the same as null", () => {
    expect(migrateConfig(undefined).version).toBe(2);
  });
});

describe("migrateConfig — already v2 (identity path)", () => {
  it("returns the exact same object reference", () => {
    const input = {
      version: 2,
      selectedCompanyId: "co_abc",
      selectedServiceLineId: null,
      companies: [],
    };
    expect(migrateConfig(input)).toBe(input);
  });
});

describe("migrateConfig — v2 normalization: TSC config.rates → config.rateOverrides", () => {
  const v2WithTscRates = (slConfig) => ({
    version: 2,
    selectedCompanyId: "co_abc",
    selectedServiceLineId: null,
    companies: [{
      id: "co_abc", name: "Acme", archived: false,
      shared: createSharedConfig(),
      serviceLines: [{
        id: "sl_tsc", type: "TSC", name: "", archived: false,
        overheadOverride: null, subTabOrder: null,
        config: slConfig,
      }],
    }],
  });

  it("renames the legacy key and preserves the user's edited rate values", () => {
    const legacy = v2WithTscRates({ coordinators: [], rates: { coord: 19.5, planDev: 18 } });
    const out = migrateConfig(legacy);
    const cfg = out.companies[0].serviceLines[0].config;
    expect(cfg.rateOverrides).toEqual({ coord: 19.5, planDev: 18 });
    expect(cfg.rates).toBeUndefined();
  });

  it("leaves an existing rateOverrides untouched (no double-migration)", () => {
    const already = v2WithTscRates({ coordinators: [], rateOverrides: { coord: 21 } });
    const out = migrateConfig(already);
    expect(out.companies[0].serviceLines[0].config.rateOverrides).toEqual({ coord: 21 });
  });

  it("is a no-op (same reference) for a v2 blob with no TSC rates to migrate", () => {
    const clean = v2WithTscRates({ coordinators: [], rateOverrides: {} });
    expect(migrateConfig(clean)).toBe(clean);
  });

  it("does not touch non-TSC service lines that happen to carry a rates key", () => {
    const input = {
      version: 2, selectedCompanyId: "co_abc", selectedServiceLineId: null,
      companies: [{
        id: "co_abc", name: "Acme", archived: false, shared: createSharedConfig(),
        serviceLines: [{
          id: "sl_x", type: "RES_HAB_DAILY", name: "", archived: false,
          overheadOverride: null, subTabOrder: null,
          config: { indHomes: [], rates: { foo: 1 } },
        }],
      }],
    };
    expect(migrateConfig(input)).toBe(input);
  });
});

describe("migrateConfig — flat v1 (production shape)", () => {
  const flatV1 = {
    wage: 18,
    graveyardWage: 10,
    occupancy: 90,
    homeTypes: [{ label: "Home A", nHigh: 2, nIntense: 1, numHomes: 5 }],
    hourlyPx: [],
  };

  it("produces version 2", () => {
    expect(migrateConfig(flatV1).version).toBe(2);
  });

  it("has exactly one company", () => {
    expect(migrateConfig(flatV1).companies).toHaveLength(1);
  });

  it("maps wage to company shared config", () => {
    expect(migrateConfig(flatV1).companies[0].shared.wage).toBe(18);
  });

  it("maps graveyardWage and occupancy to shared config", () => {
    const co = migrateConfig(flatV1).companies[0];
    expect(co.shared.graveyardWage).toBe(10);
    expect(co.shared.occupancy).toBe(90);
  });

  it("creates a RES_HAB_DAILY service line from homeTypes", () => {
    const sls = migrateConfig(flatV1).companies[0].serviceLines;
    expect(sls.some((s) => s.type === "RES_HAB_DAILY")).toBe(true);
  });

  it("does not create an hourly service line when hourlyPx is empty", () => {
    const sls = migrateConfig(flatV1).companies[0].serviceLines;
    expect(sls.some((s) => s.type === "RES_HAB_HOURLY")).toBe(false);
  });

  it("creates a RES_HAB_HOURLY service line when hourlyPx has entries", () => {
    const withHourly = { ...flatV1, hourlyPx: [{ id: "p1", name: "P" }] };
    const sls = migrateConfig(withHourly).companies[0].serviceLines;
    expect(sls.some((s) => s.type === "RES_HAB_HOURLY")).toBe(true);
  });

  it("populates default shared fields even when absent from input", () => {
    const sparse = { wage: 18 };
    const co = migrateConfig(sparse).companies[0];
    expect(co.shared.mgmtFeePct).toBe(5);
    expect(co.shared.billingFeePct).toBe(1);
    expect(co.shared.entityType).toBe("ccorp");
  });

  it("does not create any service lines when homeTypes and hourlyPx are absent", () => {
    const sparse = { wage: 18 };
    expect(migrateConfig(sparse).companies[0].serviceLines).toHaveLength(0);
  });

  it("sets selectedCompanyId to the migrated company id", () => {
    const result = migrateConfig(flatV1);
    expect(result.selectedCompanyId).toBe(result.companies[0].id);
  });
});

describe("migrateConfig — v1 with companies array", () => {
  const v1Multi = {
    selectedCompanyId: "co_existing",
    companies: [{ id: "co_existing", name: "Test Co", wage: 20 }],
  };

  it("produces version 2", () => {
    expect(migrateConfig(v1Multi).version).toBe(2);
  });

  it("preserves existing company IDs", () => {
    expect(migrateConfig(v1Multi).companies[0].id).toBe("co_existing");
  });

  it("preserves selectedCompanyId from input", () => {
    expect(migrateConfig(v1Multi).selectedCompanyId).toBe("co_existing");
  });

  it("maps wage into shared config", () => {
    expect(migrateConfig(v1Multi).companies[0].shared.wage).toBe(20);
  });

  it("preserves company name", () => {
    expect(migrateConfig(v1Multi).companies[0].name).toBe("Test Co");
  });

  it("generates a new company id when id is absent in old company", () => {
    const noId = {
      companies: [{ name: "No ID Co", wage: 18 }],
    };
    const result = migrateConfig(noId);
    expect(result.companies[0].id).toMatch(/^co_/);
  });

  it("falls back selectedCompanyId to first company when not set", () => {
    const noSel = { companies: [{ id: "co_abc", wage: 18 }] };
    expect(migrateConfig(noSel).selectedCompanyId).toBe("co_abc");
  });
});

// ──────────────────────────────────────────────────────────────────────
// validateConfig
// ──────────────────────────────────────────────────────────────────────

describe("validateConfig", () => {
  it("returns error array for null input", () => {
    const errors = validateConfig(null);
    expect(errors).toContain("Config is not an object");
  });

  it("returns error when companies is not an array", () => {
    const errors = validateConfig({ version: 2 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns empty array for a valid v2 config", () => {
    const co = createCompany("Test Co");
    const cfg = {
      version: 2,
      selectedCompanyId: co.id,
      selectedServiceLineId: null,
      companies: [co],
    };
    expect(validateConfig(cfg)).toHaveLength(0);
  });

  it("returns error when a company is missing id", () => {
    const cfg = {
      version: 2,
      companies: [{ name: "No ID", shared: createSharedConfig(), serviceLines: [] }],
    };
    const errors = validateConfig(cfg);
    expect(errors.some((e) => e.includes("missing id"))).toBe(true);
  });

  it("returns error when a company is missing shared config", () => {
    const cfg = {
      version: 2,
      companies: [{ id: "co_x", name: "No Shared", serviceLines: [] }],
    };
    const errors = validateConfig(cfg);
    expect(errors.some((e) => e.includes("missing shared config"))).toBe(true);
  });

  it("returns error for service line missing type", () => {
    const sl = createServiceLine("TSC");
    delete sl.type;
    const co = createCompany("Test");
    co.serviceLines = [sl];
    const errors = validateConfig({ version: 2, companies: [co] });
    expect(errors.some((e) => e.includes("missing type"))).toBe(true);
  });

  it("validates multiple companies independently", () => {
    const good = createCompany("Good");
    const bad = { name: "Bad", shared: createSharedConfig(), serviceLines: [] }; // no id
    const cfg = { version: 2, companies: [good, bad] };
    const errors = validateConfig(cfg);
    expect(errors.some((e) => e.includes("missing id"))).toBe(true);
    expect(errors.length).toBe(1); // only the bad company has an error
  });
});

// ──────────────────────────────────────────────────────────────────────
// Selectors
// ──────────────────────────────────────────────────────────────────────

describe("getSelectedCompany", () => {
  it("returns the company matching selectedCompanyId", () => {
    const co = createCompany("Alpha");
    const cfg = {
      version: 2,
      selectedCompanyId: co.id,
      selectedServiceLineId: null,
      companies: [co],
    };
    expect(getSelectedCompany(cfg)).toEqual(co);
  });

  it("returns null for null config", () => {
    expect(getSelectedCompany(null)).toBeNull();
  });

  it("returns null when no company matches the ID", () => {
    const co = createCompany("Alpha");
    const cfg = {
      version: 2,
      selectedCompanyId: "co_nonexistent",
      companies: [co],
    };
    expect(getSelectedCompany(cfg)).toBeNull();
  });

  it("returns null when companies array is empty", () => {
    const cfg = { version: 2, selectedCompanyId: "co_x", companies: [] };
    expect(getSelectedCompany(cfg)).toBeNull();
  });
});

describe("getSelectedServiceLine", () => {
  function makeConfigWithSL() {
    const sl = createServiceLine("TSC", { name: "My TSC" });
    const co = createCompany("Alpha");
    co.serviceLines = [sl];
    return {
      version: 2,
      selectedCompanyId: co.id,
      selectedServiceLineId: sl.id,
      companies: [co],
    };
  }

  it("returns the matching service line", () => {
    const cfg = makeConfigWithSL();
    const sl = cfg.companies[0].serviceLines[0];
    expect(getSelectedServiceLine(cfg)).toEqual(sl);
  });

  it("returns null for null config", () => {
    expect(getSelectedServiceLine(null)).toBeNull();
  });

  it("returns null when selectedServiceLineId does not match any SL", () => {
    const cfg = makeConfigWithSL();
    cfg.selectedServiceLineId = "sl_nonexistent";
    expect(getSelectedServiceLine(cfg)).toBeNull();
  });

  it("returns null when selectedServiceLineId is null", () => {
    const cfg = makeConfigWithSL();
    cfg.selectedServiceLineId = null;
    expect(getSelectedServiceLine(cfg)).toBeNull();
  });
});

describe("getServiceLineByType", () => {
  function makeConfig() {
    const sl = createServiceLine("TSC");
    const co = createCompany("Alpha");
    co.serviceLines = [sl];
    return { version: 2, selectedCompanyId: co.id, companies: [co] };
  }

  it("returns the service line matching type", () => {
    const cfg = makeConfig();
    const result = getServiceLineByType(cfg, cfg.selectedCompanyId, "TSC");
    expect(result).not.toBeNull();
    expect(result.type).toBe("TSC");
  });

  it("returns null for null config", () => {
    expect(getServiceLineByType(null, "co_x", "TSC")).toBeNull();
  });

  it("returns null when companyId does not match", () => {
    const cfg = makeConfig();
    expect(getServiceLineByType(cfg, "co_nonexistent", "TSC")).toBeNull();
  });

  it("returns null when no service line has that type", () => {
    const cfg = makeConfig();
    expect(getServiceLineByType(cfg, cfg.selectedCompanyId, "RES_HAB_DAILY")).toBeNull();
  });

  it("skips archived service lines", () => {
    const sl = createServiceLine("TSC", { archived: true });
    const co = createCompany("Alpha");
    co.serviceLines = [sl];
    const cfg = { version: 2, selectedCompanyId: co.id, companies: [co] };
    expect(getServiceLineByType(cfg, co.id, "TSC")).toBeNull();
  });

  it("returns the first non-archived match when multiple SLs have the same type", () => {
    const archived = createServiceLine("TSC", { archived: true });
    const active = createServiceLine("TSC", { archived: false });
    const co = createCompany("Alpha");
    co.serviceLines = [archived, active];
    const cfg = { version: 2, selectedCompanyId: co.id, companies: [co] };
    expect(getServiceLineByType(cfg, co.id, "TSC")).toEqual(active);
  });
});
