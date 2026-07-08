import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "../FinancialTool.jsx";
import { ROLES } from "../../lib/access.js";
import { createCompany, createServiceLine } from "../../lib/companyShape.js";

// FinancialTool.jsx does not import supabase.js — no mock needed.
// It receives everything through props.

describe("FinancialTool (App) — smoke tests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without throwing when given a null initialConfig", () => {
    // migrateConfig(null) seeds a default company internally
    expect(() =>
      render(<App initialConfig={null} userRole={ROLES.CEO} />)
    ).not.toThrow();
  });

  it("shows a Save button when onSave is provided and userRole can edit", () => {
    render(<App initialConfig={null} onSave={vi.fn()} userRole={ROLES.CEO} />);
    expect(screen.getByText("Save")).toBeDefined();
  });

  it("does not show a Save button when onSave is omitted", () => {
    render(<App initialConfig={null} userRole={ROLES.CEO} />);
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("calls onSave when the Save button is clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<App initialConfig={null} onSave={onSave} userRole={ROLES.CEO} />);
    await act(async () => { fireEvent.click(screen.getByText("Save")); });
    expect(onSave).toHaveBeenCalledOnce();
    // onSave receives the current v2 config blob
    const savedConfig = onSave.mock.calls[0][0];
    expect(savedConfig).toHaveProperty("version", 2);
    expect(savedConfig).toHaveProperty("companies");
  });
});

describe("FinancialTool (App) — service-line scope filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement the Pointer Events capture API; the SL tab
    // strip calls it on pointerdown for drag-reorder support.
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => {};
      Element.prototype.releasePointerCapture = () => {};
    }
  });

  function twoLineConfig() {
    const tsc = createServiceLine("TSC", { name: "TSC" });
    const resHab = createServiceLine("RES_HAB_DAILY", { name: "Res Hab Daily" });
    const company = createCompany("Sawtooth", { serviceLines: [tsc, resHab] });
    return {
      config: {
        version: 2,
        selectedCompanyId: company.id,
        selectedServiceLineId: null,
        companies: [company],
      },
      company,
      tsc,
      resHab,
    };
  }

  it("shows every unarchived line when memberScopes is absent (regression)", () => {
    const { config, tsc, resHab } = twoLineConfig();
    render(<App initialConfig={config} userRole={ROLES.OWNER} />);
    expect(screen.getByText(tsc.name)).toBeDefined();
    expect(screen.getByText(resHab.name)).toBeDefined();
  });

  it("shows every unarchived line when the member has whole-company scope (null)", () => {
    const { config, company, tsc, resHab } = twoLineConfig();
    const memberScopes = { [company.id]: { accessRole: "admin", serviceLineScope: null } };
    render(<App initialConfig={config} userRole={ROLES.OWNER} memberScopes={memberScopes} />);
    expect(screen.getByText(tsc.name)).toBeDefined();
    expect(screen.getByText(resHab.name)).toBeDefined();
  });

  it("hides every service line except the member's scoped line", () => {
    const { config, company, tsc, resHab } = twoLineConfig();
    const memberScopes = { [company.id]: { accessRole: "editor", serviceLineScope: tsc.id } };
    render(
      <App initialConfig={config} userRole={ROLES.REGIONAL_DIRECTOR} memberScopes={memberScopes} />,
    );
    expect(screen.getByText(tsc.name)).toBeDefined();
    expect(screen.queryByText(resHab.name)).toBeNull();
    // Whole Company stays visible regardless of scope — its contents are tier-gated.
    expect(screen.getByText(/Whole Company/)).toBeDefined();
  });

  it("resets to Whole Company when the open line falls outside the member's scope", async () => {
    const { config, company, tsc, resHab } = twoLineConfig();
    // Open Res Hab first, then apply a scope that only allows TSC.
    config.selectedServiceLineId = resHab.id;
    const memberScopes = { [company.id]: { accessRole: "editor", serviceLineScope: tsc.id } };

    const { rerender } = render(
      <App initialConfig={config} userRole={ROLES.REGIONAL_DIRECTOR} />,
    );
    // Service-line tabs activate on pointerdown (drag-reorder support), not click.
    await act(async () => {
      fireEvent.pointerDown(screen.getByText(resHab.name));
    });

    await act(async () => {
      rerender(
        <App initialConfig={config} userRole={ROLES.REGIONAL_DIRECTOR} memberScopes={memberScopes} />,
      );
    });

    expect(screen.queryByText(resHab.name)).toBeNull();
    expect(screen.getByText(tsc.name)).toBeDefined();
  });

  it("a stale scope id (line removed from config) hides all lines, not just skips filtering", () => {
    const { config, company, tsc } = twoLineConfig();
    const memberScopes = { [company.id]: { accessRole: "editor", serviceLineScope: "sl_does_not_exist" } };
    render(
      <App initialConfig={config} userRole={ROLES.REGIONAL_DIRECTOR} memberScopes={memberScopes} />,
    );
    expect(screen.queryByText(tsc.name)).toBeNull();
    expect(screen.getByText(/Whole Company/)).toBeDefined();
  });
});
