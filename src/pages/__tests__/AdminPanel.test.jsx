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

  it("surfaces revoke_invite errors and re-enables the button instead of reloading", async () => {
    setup([inviteRow()]);
    mockRpc.mockImplementation((fn) => {
      if (fn === "admin_list_invites") return Promise.resolve({ data: [inviteRow()], error: null });
      if (fn === "revoke_invite") return Promise.resolve({ data: null, error: { message: "invite already accepted — remove the member instead" } });
      return Promise.resolve({ data: null, error: null });
    });
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });

    const before = mockRpc.mock.calls.filter(([fn]) => fn === "admin_list_invites").length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    });

    expect(screen.getByText("invite already accepted — remove the member instead")).toBeDefined();
    // no reload happened on error, and the button is clickable again (not stuck on "Revoking…")
    const after = mockRpc.mock.calls.filter(([fn]) => fn === "admin_list_invites").length;
    expect(after).toBe(before);
    expect(screen.getByRole("button", { name: /^revoke$/i })).not.toBeDisabled();
  });

  it("ignores a second click on Revoke while the first call is still in flight", async () => {
    setup([inviteRow()]);
    let resolveRevoke;
    mockRpc.mockImplementation((fn) => {
      if (fn === "admin_list_invites") return Promise.resolve({ data: [inviteRow()], error: null });
      if (fn === "revoke_invite") return new Promise((resolve) => { resolveRevoke = resolve; });
      return Promise.resolve({ data: null, error: null });
    });
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });

    const button = screen.getByRole("button", { name: /revoke/i });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole("button", { name: /revoking/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /revoking/i })); // second click while in flight
    const revokeCalls = mockRpc.mock.calls.filter(([fn]) => fn === "revoke_invite").length;
    expect(revokeCalls).toBe(1); // second click was ignored

    await act(async () => { resolveRevoke({ data: null, error: null }); });
  });

  it("resolves a service-line scope id to its name when the company's config is available", async () => {
    mockFrom.mockImplementation((table) => {
      if (table === "companies") {
        return fromResult({
          data: [{ id: "co_1", name: "Sawtooth Group Homes", archived: false, created_at: "2026-07-01", serviceLines: [{ id: "sl_tsc1", name: "TSC — Sawtooth" }] }],
          error: null,
        });
      }
      return fromResult({ data: [], error: null });
    });
    mockRpc.mockImplementation((fn) =>
      fn === "admin_list_invites"
        ? Promise.resolve({ data: [inviteRow({ company_id: "co_1" })], error: null })
        : Promise.resolve({ data: null, error: null }),
    );
    await act(async () => { render(<AdminPanel onExit={() => {}} />); });
    expect(screen.getByText("TSC — Sawtooth")).toBeDefined();
    expect(screen.queryByText("sl_tsc1")).toBeNull();
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
