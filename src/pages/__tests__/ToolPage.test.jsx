import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { createEmptyConfig, createCompany, createServiceLine } from "../../lib/companyShape.js";

// Mock supabase — ToolPage calls these on mount / during onboarding.
vi.mock("../../supabase.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  getMyCompanyScopes: vi.fn(),
  getProvenance: vi.fn(),
  completeOnboarding: vi.fn(),
}));

// Mock FinancialTool — avoids rendering the 3,200-line component in unit tests
vi.mock("../FinancialTool.jsx", () => ({
  default: vi.fn(({ initialConfig, memberScopes }) => (
    <div
      data-testid="financial-tool"
      data-has-config={initialConfig !== null ? "true" : "false"}
      data-member-scopes={JSON.stringify(memberScopes)}
    />
  )),
}));

import ToolPage from "../ToolPage.jsx";
import { loadConfig, getMyCompanyScopes, getProvenance, completeOnboarding } from "../../supabase.js";

function onboardedProfile(overrides = {}) {
  return { id: "u1", onboarding_completed_at: "2026-01-01T00:00:00Z", ...overrides };
}
function freshProfile(overrides = {}) {
  return { id: "u1", onboarding_completed_at: null, ...overrides };
}

function configWithOneCompany({ serviceLines = [] } = {}) {
  const company = createCompany("Test Co", { serviceLines });
  return {
    version: 2,
    selectedCompanyId: company.id,
    selectedServiceLineId: null,
    companies: [company],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getMyCompanyScopes.mockResolvedValue({});
  getProvenance.mockResolvedValue({ kind: "owner" });
  completeOnboarding.mockResolvedValue(true);
  // Node 22+'s own experimental global `localStorage` can shadow jsdom's
  // working implementation in this runner (see src/lib/__tests__/onboarding.test.js)
  // — stub a plain in-memory Storage so resume/progress tests are deterministic.
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  });
});

describe("ToolPage — config loading states (already onboarded)", () => {
  it("renders nothing while loadConfig is pending", async () => {
    loadConfig.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<ToolPage userRole="CEO" profile={onboardedProfile()} />);
    await act(async () => {});
    expect(screen.queryByTestId("financial-tool")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while profile is still loading (undefined)", async () => {
    loadConfig.mockResolvedValue(createEmptyConfig());
    const { container } = render(<ToolPage userRole="CEO" profile={undefined} />);
    await act(async () => {});
    expect(container.firstChild).toBeNull();
  });

  it("renders FinancialTool with the resolved config once onboarding is already complete", async () => {
    const config = createEmptyConfig();
    loadConfig.mockResolvedValue(config);
    await act(async () => { render(<ToolPage userRole="CEO" profile={onboardedProfile()} />); });
    expect(screen.getByTestId("financial-tool")).toBeDefined();
    expect(screen.getByTestId("financial-tool").dataset.hasConfig).toBe("true");
    // Already onboarded — no provenance lookup needed at all.
    expect(getProvenance).not.toHaveBeenCalled();
  });
});

describe("ToolPage — member scopes", () => {
  it("loads config and scopes together and passes memberScopes through", async () => {
    const config = createEmptyConfig();
    loadConfig.mockResolvedValue(config);
    getMyCompanyScopes.mockResolvedValue({
      co_1: { accessRole: "editor", serviceLineScope: "sl_tsc1" },
    });
    await act(async () => { render(<ToolPage userRole="REGIONAL_DIRECTOR" profile={onboardedProfile()} />); });
    expect(getMyCompanyScopes).toHaveBeenCalled();
    const tool = screen.getByTestId("financial-tool");
    expect(JSON.parse(tool.dataset.memberScopes)).toEqual({
      co_1: { accessRole: "editor", serviceLineScope: "sl_tsc1" },
    });
  });

  it("defaults to an empty scopes object when none are returned", async () => {
    loadConfig.mockResolvedValue(createEmptyConfig());
    getMyCompanyScopes.mockResolvedValue({});
    await act(async () => { render(<ToolPage userRole="OWNER" profile={onboardedProfile()} />); });
    const tool = screen.getByTestId("financial-tool");
    expect(JSON.parse(tool.dataset.memberScopes)).toEqual({});
  });
});

describe("ToolPage — onboarding: standalone AwaitingCompany (post-onboarding, no company)", () => {
  it("shows AwaitingCompany without a Skip link when onboarding is already done but there's no company", async () => {
    loadConfig.mockResolvedValue(null);
    await act(async () => { render(<ToolPage userRole="OWNER" profile={onboardedProfile()} />); });
    expect(screen.getByText(/workspace is being set up/i)).toBeDefined();
    expect(screen.queryByText(/skip setup/i)).toBeNull();
    expect(screen.queryByTestId("financial-tool")).toBeNull();
    // Onboarding is done — this isn't part of the step sequence, no provenance needed.
    expect(getProvenance).not.toHaveBeenCalled();
  });

  it("Check again re-runs loadConfig and re-renders once a company appears", async () => {
    loadConfig.mockResolvedValueOnce(null);
    await act(async () => { render(<ToolPage userRole="OWNER" profile={onboardedProfile()} />); });
    expect(screen.getByText(/workspace is being set up/i)).toBeDefined();

    loadConfig.mockResolvedValueOnce(createEmptyConfig());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    });
    expect(screen.getByTestId("financial-tool")).toBeDefined();
  });
});

describe("ToolPage — onboarding sequence (not yet onboarded)", () => {
  it("an Owner with zero companies sees welcome, then the awaiting_company step (with a Skip link) after Continue", async () => {
    loadConfig.mockResolvedValue(null);
    getProvenance.mockResolvedValue({ kind: "owner" });
    await act(async () => { render(<ToolPage userRole="OWNER" profile={freshProfile()} />); });
    expect(screen.getByText(/welcome to intrinsic/i)).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    });
    expect(screen.getByText(/workspace is being set up/i)).toBeDefined();
    expect(screen.getByText(/skip setup/i)).toBeDefined();
  });

  it("an Owner whose company already has service lines skips straight to welcome", async () => {
    loadConfig.mockResolvedValue(configWithOneCompany({ serviceLines: [createServiceLine("TSC")] }));
    getProvenance.mockResolvedValue({ kind: "owner" });
    await act(async () => { render(<ToolPage userRole="OWNER" profile={freshProfile()} />); });
    expect(screen.getByText(/welcome to intrinsic/i)).toBeDefined();
    expect(screen.queryByText(/workspace is being set up/i)).toBeNull();
  });

  it("an invited teammate never sees awaiting_company even with zero companies", async () => {
    loadConfig.mockResolvedValue(null);
    getProvenance.mockResolvedValue({ kind: "invited", invitedByEmail: "owner@test.local", role: "PROGRAM_MANAGER" });
    await act(async () => { render(<ToolPage userRole="PROGRAM_MANAGER" profile={freshProfile()} />); });
    expect(screen.getByText(/welcome to intrinsic/i)).toBeDefined();
    expect(screen.queryByText(/workspace is being set up/i)).toBeNull();
  });

  it("Continue on welcome advances to access_granted, showing the inviter for a teammate", async () => {
    loadConfig.mockResolvedValue(configWithOneCompany({ serviceLines: [createServiceLine("TSC")] }));
    getProvenance.mockResolvedValue({ kind: "invited", invitedByEmail: "owner@test.local", role: "CEO" });
    await act(async () => { render(<ToolPage userRole="CEO" profile={freshProfile()} />); });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    });
    expect(screen.getByText(/you're in/i)).toBeDefined();
    expect(screen.getByText(/owner@test\.local/i)).toBeDefined();
  });

  it("Enter workspace on access_granted falls through to the dashboard (tour not built yet)", async () => {
    loadConfig.mockResolvedValue(configWithOneCompany({ serviceLines: [createServiceLine("TSC")] }));
    getProvenance.mockResolvedValue({ kind: "owner" });
    await act(async () => { render(<ToolPage userRole="OWNER" profile={freshProfile()} />); });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^continue$/i })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /enter workspace/i })); });

    expect(screen.getByTestId("financial-tool")).toBeDefined();
  });

  it("Skip setup calls completeOnboarding and the profile-refresh callback, then falls through to the dashboard", async () => {
    loadConfig.mockResolvedValue(configWithOneCompany({ serviceLines: [createServiceLine("TSC")] }));
    getProvenance.mockResolvedValue({ kind: "owner" });
    const onProfileRefresh = vi.fn();
    await act(async () => {
      render(<ToolPage userRole="OWNER" profile={freshProfile()} onProfileRefresh={onProfileRefresh} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /skip setup/i }));
    });

    expect(completeOnboarding).toHaveBeenCalled();
    expect(onProfileRefresh).toHaveBeenCalled();
    expect(screen.getByTestId("financial-tool")).toBeDefined();
  });

  it("resumes from localStorage rather than restarting at welcome", async () => {
    loadConfig.mockResolvedValue(configWithOneCompany({ serviceLines: [createServiceLine("TSC")] }));
    getProvenance.mockResolvedValue({ kind: "owner" });
    localStorage.setItem("intrinsic_onboarding_v1:u1", "access_granted");

    await act(async () => { render(<ToolPage userRole="OWNER" profile={freshProfile()} />); });
    // access_granted already completed -> next visible step after it is tour,
    // which isn't built yet -> falls through to the dashboard directly.
    expect(screen.getByTestId("financial-tool")).toBeDefined();
    expect(screen.queryByText(/welcome to intrinsic/i)).toBeNull();
  });
});
