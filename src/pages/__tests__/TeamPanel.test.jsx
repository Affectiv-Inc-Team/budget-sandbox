import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../supabase.js", () => ({
  supabase: {
    auth: { getUser: (...a) => mockGetUser(...a) },
    rpc: (...a) => mockRpc(...a),
    from: (...a) => mockFrom(...a),
  },
  sendInvite: vi.fn(),
  getMyCompanyScopes: vi.fn(),
}));

import TeamPanel, { permissionText, memberStatus, scopeLabel } from "../TeamPanel.jsx";
import { sendInvite, getMyCompanyScopes } from "../../supabase.js";

// Chainable stub for supabase.from(...) — resolves to `result` at any await point.
function fromResult(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(result),
    delete: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const COMPANY = {
  id: "co_1",
  name: "Sawtooth Group Homes",
  archived: false,
  config: {
    serviceLines: [
      { id: "sl_tsc1", type: "TSC", name: "TSC", archived: false },
      { id: "sl_rhd1", type: "RES_HAB_DAILY", name: "Res Hab Daily", archived: false },
      { id: "sl_arch1", type: "TSC", name: "Old line", archived: true },
    ],
  },
};

function memberRow(overrides = {}) {
  return {
    email: "member@test.local",
    org_role: "PROGRAM_MANAGER",
    pending_org_role: null,
    access_role: "editor",
    service_line_scope: "sl_tsc1",
    has_account: true,
    last_sign_in_at: "2026-07-01T10:00:00Z",
    confirmed_at: "2026-06-01T10:00:00Z",
    invite_status: null,
    invited_at: null,
    ...overrides,
  };
}

function setupHappyPath({ members = [memberRow()], scopes } = {}) {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mockFrom.mockImplementation((tableName) => {
    if (tableName === "profiles") {
      return fromResult({ data: { id: "u1", email: "me@test.local", is_super_admin: false } });
    }
    if (tableName === "companies") return fromResult({ data: [COMPANY] });
    if (tableName === "licensees") return fromResult({ data: [{ id: "lic1" }] });
    if (tableName === "licensee_companies") return fromResult({ error: null });
    return fromResult({ data: [] });
  });
  getMyCompanyScopes.mockResolvedValue(
    scopes ?? { co_1: { accessRole: "admin", serviceLineScope: null } },
  );
  mockRpc.mockImplementation((fn) => {
    if (fn === "get_company_member_status") return Promise.resolve({ data: members, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

async function renderPanel(userRole) {
  await act(async () => {
    render(
      <MemoryRouter>
        <TeamPanel userRole={userRole} />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe("permissionText", () => {
  it("Owner gets the any-tier special case", () => {
    expect(permissionText("OWNER")).toMatch(/including another Owner/);
  });
  it("mid-tier lists exactly the invitable roles", () => {
    const text = permissionText("HR_MANAGER");
    expect(text).toContain("Scheduler, House Lead");
    expect(text).not.toContain("Program Manager,");
  });
  it("House Lead gets the locked copy", () => {
    expect(permissionText("HOUSE_LEAD")).toMatch(/can't invite anyone/);
  });
});

describe("memberStatus", () => {
  it("keys Active on last_sign_in_at, not has_account", () => {
    expect(memberStatus(memberRow()).label).toMatch(/Active/);
    // invited: account exists (inviteUserByEmail creates it) but never signed in
    expect(
      memberStatus(memberRow({ last_sign_in_at: null, invite_status: "sent" })).label,
    ).toMatch(/Invited/);
  });
  it("maps failed and revoked invites", () => {
    expect(memberStatus(memberRow({ last_sign_in_at: null, invite_status: "failed" })).label).toMatch(/failed/);
    expect(memberStatus(memberRow({ invite_status: "revoked" })).label).toMatch(/Revoked/);
  });
  it("no invite and never signed in → Not signed up", () => {
    expect(
      memberStatus(memberRow({ last_sign_in_at: null, has_account: false, invite_status: null })).label,
    ).toMatch(/Not signed up/);
  });
});

describe("scopeLabel", () => {
  it("null scope is Whole Company", () => {
    expect(scopeLabel(null, COMPANY)).toBe("Whole Company");
  });
  it("resolves the line name from the company config", () => {
    expect(scopeLabel("sl_tsc1", COMPANY)).toBe("TSC");
  });
  it("stale ids show (removed)", () => {
    expect(scopeLabel("sl_gone", COMPANY)).toBe("(removed)");
  });
});

// ─── Component behavior ──────────────────────────────────────────────────────

describe("TeamPanel invite form", () => {
  it("tier dropdown is constrained to invitableRoles of the current user", async () => {
    setupHappyPath();
    await renderPanel("FINANCE");
    const tierSelect = screen.getByLabelText("Invite tier");
    const values = within(tierSelect).getAllByRole("option").map((o) => o.value);
    expect(values).not.toContain("OWNER");
    expect(values).not.toContain("CEO");
    expect(values).not.toContain("FINANCE");
    expect(values).toContain("REGIONAL_DIRECTOR");
    expect(values).toContain("HOUSE_LEAD");
  });

  it("tier ≤3 locks scope to Whole Company; tier ≥4 offers only active lines", async () => {
    setupHappyPath();
    await renderPanel("OWNER");

    fireEvent.change(screen.getByLabelText("Invite tier"), { target: { value: "CEO" } });
    expect(screen.getByLabelText("Scope")).toBeDisabled();
    expect(screen.getByLabelText("Scope").value).toBe("Whole Company");

    fireEvent.change(screen.getByLabelText("Invite tier"), { target: { value: "REGIONAL_DIRECTOR" } });
    const scopeSelect = screen.getByLabelText("Service line scope");
    const values = within(scopeSelect).getAllByRole("option").map((o) => o.value);
    expect(values).toContain("sl_tsc1");
    expect(values).toContain("sl_rhd1");
    expect(values).not.toContain("sl_arch1"); // archived lines excluded
  });

  it("Send stays disabled until email + tier (+scope for tier ≥4) are set", async () => {
    setupHappyPath();
    await renderPanel("OWNER");
    const send = screen.getByRole("button", { name: /send invite/i });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Invite email"), { target: { value: "new@test.local" } });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Invite tier"), { target: { value: "SCHEDULER" } });
    expect(send).toBeDisabled(); // tier 7 needs a scope

    fireEvent.change(screen.getByLabelText("Service line scope"), { target: { value: "sl_tsc1" } });
    expect(send).not.toBeDisabled();
  });

  it("submits via sendInvite with a scoped payload and reloads the roster", async () => {
    setupHappyPath();
    sendInvite.mockResolvedValue({ ok: true, inviteId: "inv1", emailAction: "invite" });
    await renderPanel("OWNER");

    fireEvent.change(screen.getByLabelText("Invite email"), { target: { value: "New@Test.Local" } });
    fireEvent.change(screen.getByLabelText("Invite tier"), { target: { value: "REGIONAL_DIRECTOR" } });
    fireEvent.change(screen.getByLabelText("Service line scope"), { target: { value: "sl_rhd1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    });

    expect(sendInvite).toHaveBeenCalledWith({
      companyId: "co_1",
      email: "New@Test.Local",
      orgRole: "REGIONAL_DIRECTOR",
      serviceLineScope: "sl_rhd1",
    });
    expect(screen.getByText(/Invite sent to new@test.local/)).toBeDefined();
    // roster reloaded: initial load + post-invite
    const rosterCalls = mockRpc.mock.calls.filter(([fn]) => fn === "get_company_member_status");
    expect(rosterCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("whole-company invites pass a null scope", async () => {
    setupHappyPath();
    sendInvite.mockResolvedValue({ ok: true, inviteId: "inv2", emailAction: "invite" });
    await renderPanel("OWNER");

    fireEvent.change(screen.getByLabelText("Invite email"), { target: { value: "ceo@test.local" } });
    fireEvent.change(screen.getByLabelText("Invite tier"), { target: { value: "CEO" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    });
    expect(sendInvite.mock.calls[0][0].serviceLineScope).toBeNull();
  });

  it("surfaces sendInvite errors", async () => {
    setupHappyPath();
    sendInvite.mockResolvedValue({ ok: false, error: "your role cannot invite tier 1 (OWNER)" });
    await renderPanel("OWNER");

    fireEvent.change(screen.getByLabelText("Invite email"), { target: { value: "x@test.local" } });
    fireEvent.change(screen.getByLabelText("Invite tier"), { target: { value: "OWNER" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    });
    expect(screen.getByText(/cannot invite tier 1/)).toBeDefined();
  });

  it("HOUSE_LEAD sees the locked state instead of a form", async () => {
    setupHappyPath({ scopes: { co_1: { accessRole: "read_only", serviceLineScope: "sl_tsc1" } } });
    await renderPanel("HOUSE_LEAD");
    expect(screen.queryByLabelText("Invite email")).toBeNull();
    expect(screen.getByText(/no tier below it to invite/i)).toBeDefined();
    // roster still visible
    expect(screen.getByText("member@test.local")).toBeDefined();
  });
});

describe("TeamPanel roster", () => {
  it("shows tier chip, scope name, status, and the can-invite indicator", async () => {
    setupHappyPath({
      members: [
        memberRow(), // PM, signed in, scoped to TSC
        memberRow({
          email: "invited@test.local",
          org_role: null,
          pending_org_role: "SCHEDULER",
          access_role: "read_only",
          service_line_scope: "sl_rhd1",
          last_sign_in_at: null,
          invite_status: "sent",
        }),
      ],
      scopes: { co_1: { accessRole: "editor", serviceLineScope: null } }, // NOT admin
    });
    await renderPanel("HR_MANAGER");

    const rows = screen.getAllByRole("row").slice(1); // skip header
    const first = within(rows[0]);
    expect(first.getByText("member@test.local")).toBeDefined();
    expect(first.getByText(/TIER 5 · Program Manager/)).toBeDefined(); // chip (non-admin: read-only)
    expect(first.getByText("TSC")).toBeDefined();
    expect(first.getByText(/Active/)).toBeDefined();
    expect(first.getByText(/— No/)).toBeDefined(); // HR (T6) cannot invite a T5

    const second = within(rows[1]);
    expect(second.getByText(/Invited/)).toBeDefined();
    expect(second.getByText("Res Hab Daily")).toBeDefined();
    expect(second.getByText(/✓ Yes/)).toBeDefined(); // HR can invite a Scheduler
    expect(second.getByText(/Pending — applies at first sign-in/)).toBeDefined();
  });

  it("non-admin members get no tier dropdown and no Remove button", async () => {
    setupHappyPath({ scopes: { co_1: { accessRole: "editor", serviceLineScope: null } } });
    await renderPanel("PROGRAM_MANAGER");
    expect(screen.queryByLabelText(/Tier for/)).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("an admin who is not Owner cannot manage a row at or above their own tier, but can manage one below it", async () => {
    setupHappyPath({
      members: [
        memberRow({ email: "senior@test.local", org_role: "CEO" }),     // T2, above FINANCE (T3)
        memberRow({ email: "junior@test.local", org_role: "SCHEDULER" }), // T7, below FINANCE (T3)
      ],
      scopes: { co_1: { accessRole: "admin", serviceLineScope: null } },
    });
    await renderPanel("FINANCE"); // T3, admin access, but not Owner

    expect(screen.queryByLabelText("Tier for senior@test.local")).toBeNull();
    expect(within(screen.getByText("senior@test.local").closest("tr")).queryByRole("button", { name: /remove/i })).toBeNull();

    expect(screen.getByLabelText("Tier for junior@test.local")).toBeDefined();
    expect(within(screen.getByText("junior@test.local").closest("tr")).getByRole("button", { name: /remove/i })).toBeDefined();
  });

  it("admins can change a member's tier through set_member_org_role", async () => {
    setupHappyPath();
    await renderPanel("OWNER");
    const select = screen.getByLabelText("Tier for member@test.local");
    await act(async () => {
      fireEvent.change(select, { target: { value: "HR_MANAGER" } });
    });
    expect(mockRpc).toHaveBeenCalledWith("set_member_org_role", {
      p_company_id: "co_1",
      p_target_email: "member@test.local",
      p_role: "HR_MANAGER",
    });
  });
});
