import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../supabase.js", () => ({
  supabase: {
    rpc: (...a) => mockRpc(...a),
    from: (...a) => mockFrom(...a),
  },
}));

import AdminPanel from "../AdminPanel.jsx";

// Chainable stub — resolves to `result` wherever the query chain is awaited.
function fromResult(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    upsert: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function inviteRow(overrides = {}) {
  return {
    id: "inv-1",
    company_id: "co_1",
    company_name: "Sawtooth Group Homes",
    email: "casey@test.local",
    org_role: "REGIONAL_DIRECTOR",
    service_line_scope: "sl_tsc1",
    access_role: "editor",
    invited_by_email: "owner@test.local",
    status: "sent",
    effective_status: "sent",
    created_at: "2026-07-08T10:00:00Z",
    email_sent_at: "2026-07-08T10:00:05Z",
    revoked_at: null,
    ...overrides,
  };
}

function setup(invites) {
  mockFrom.mockImplementation(() => fromResult({ data: [], error: null }));
  mockRpc.mockImplementation((fn) => {
    if (fn === "admin_list_invites") return Promise.resolve({ data: invites, error: null });
    if (fn === "revoke_invite") return Promise.resolve({ data: null, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("AdminPanel — Invitations section", () => {
  it("renders invite rows with company, tier label, scope, inviter, and status", async () => {
    setup([inviteRow()]);
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });

    expect(mockRpc).toHaveBeenCalledWith("admin_list_invites");
    const section = screen.getByText(/Invitations \(1\)/).closest("div");
    const scoped = within(section);
    expect(scoped.getByText("Sawtooth Group Homes")).toBeDefined();
    expect(scoped.getByText("casey@test.local")).toBeDefined();
    expect(scoped.getByText("Regional Director (T4)")).toBeDefined();
    expect(scoped.getByText("sl_tsc1")).toBeDefined();
    expect(scoped.getByText("owner@test.local")).toBeDefined();
    expect(scoped.getByText("sent")).toBeDefined();
  });

  it("null scope renders as whole company", async () => {
    setup([inviteRow({ org_role: "CEO", service_line_scope: null })]);
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });
    expect(screen.getByText("whole company")).toBeDefined();
  });

  it("Revoke appears for pending/sent/failed but not accepted/revoked", async () => {
    setup([
      inviteRow({ id: "a", effective_status: "sent" }),
      inviteRow({ id: "b", email: "b@test.local", effective_status: "accepted" }),
      inviteRow({ id: "c", email: "c@test.local", effective_status: "revoked" }),
      inviteRow({ id: "d", email: "d@test.local", effective_status: "failed" }),
    ]);
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });
    expect(screen.getAllByRole("button", { name: /revoke/i })).toHaveLength(2);
  });

  it("Revoke calls the revoke_invite RPC and reloads", async () => {
    setup([inviteRow()]);
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });

    const before = mockRpc.mock.calls.filter(([fn]) => fn === "admin_list_invites").length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    });

    expect(mockRpc).toHaveBeenCalledWith("revoke_invite", { p_invite_id: "inv-1" });
    const after = mockRpc.mock.calls.filter(([fn]) => fn === "admin_list_invites").length;
    expect(after).toBe(before + 1);
  });

  it("shows an empty state when there are no invites", async () => {
    setup([]);
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });
    expect(screen.getByText("No invites yet.")).toBeDefined();
  });

  it("surfaces admin_list_invites errors in the error card", async () => {
    mockFrom.mockImplementation(() => fromResult({ data: [], error: null }));
    mockRpc.mockImplementation((fn) =>
      fn === "admin_list_invites"
        ? Promise.resolve({ data: null, error: { message: "permission denied" } })
        : Promise.resolve({ data: null, error: null }),
    );
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });
    expect(screen.getByText("permission denied")).toBeDefined();
  });
});
