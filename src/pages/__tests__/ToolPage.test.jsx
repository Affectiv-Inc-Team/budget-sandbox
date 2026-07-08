import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { createEmptyConfig } from "../../lib/companyShape.js";

// Mock supabase — ToolPage calls loadConfig + getMyCompanyScopes on mount
vi.mock("../../supabase.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  getMyCompanyScopes: vi.fn(),
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
import { loadConfig, getMyCompanyScopes } from "../../supabase.js";

beforeEach(() => {
  vi.clearAllMocks();
  getMyCompanyScopes.mockResolvedValue({});
});

describe("ToolPage — config loading states", () => {
  it("renders nothing while loadConfig is pending", async () => {
    loadConfig.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<ToolPage userRole="CEO" />);
    await act(async () => {});
    expect(screen.queryByTestId("financial-tool")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("renders FinancialTool with the resolved config", async () => {
    const config = createEmptyConfig();
    loadConfig.mockResolvedValue(config);
    await act(async () => { render(<ToolPage userRole="CEO" />); });
    expect(screen.getByTestId("financial-tool")).toBeDefined();
    expect(screen.getByTestId("financial-tool").dataset.hasConfig).toBe("true");
  });

  it("renders FinancialTool with null config when loadConfig resolves null", async () => {
    loadConfig.mockResolvedValue(null);
    await act(async () => { render(<ToolPage userRole="CEO" />); });
    const tool = screen.getByTestId("financial-tool");
    expect(tool).toBeDefined();
    expect(tool.dataset.hasConfig).toBe("false");
  });
});

describe("ToolPage — member scopes", () => {
  it("loads config and scopes together and passes memberScopes through", async () => {
    const config = createEmptyConfig();
    loadConfig.mockResolvedValue(config);
    getMyCompanyScopes.mockResolvedValue({
      co_1: { accessRole: "editor", serviceLineScope: "sl_tsc1" },
    });
    await act(async () => { render(<ToolPage userRole="REGIONAL_DIRECTOR" />); });
    expect(getMyCompanyScopes).toHaveBeenCalled();
    const tool = screen.getByTestId("financial-tool");
    expect(JSON.parse(tool.dataset.memberScopes)).toEqual({
      co_1: { accessRole: "editor", serviceLineScope: "sl_tsc1" },
    });
  });

  it("defaults to an empty scopes object when none are returned", async () => {
    loadConfig.mockResolvedValue(createEmptyConfig());
    getMyCompanyScopes.mockResolvedValue({});
    await act(async () => { render(<ToolPage userRole="OWNER" />); });
    const tool = screen.getByTestId("financial-tool");
    expect(JSON.parse(tool.dataset.memberScopes)).toEqual({});
  });
});
