import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../../../lib/posthog.js", () => ({
  default: { capture: vi.fn() },
  useFeatureFlag: vi.fn(() => false),
}));

import OnboardingOverlay from "../OnboardingOverlay.jsx";

function renderOverlay(props) {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/app" element={<OnboardingOverlay {...props} />} />
        <Route path="/team" element={<div>Team screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const baseProps = {
  role: "OWNER",
  provenance: "owner",
  multiCompany: false,
  visibleSLsCount: 0,
  co: { slBreakdown: [], netMargin: 0 },
  onAddServiceLine: vi.fn(),
  onSave: vi.fn().mockResolvedValue(true),
  onStepChange: vi.fn(),
  onComplete: vi.fn(),
  onSkip: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

describe("OnboardingOverlay — first_line -> line_result -> invite_team -> done", () => {
  it("picking a line calls onAddServiceLine and shows the (zero, honest) payoff for a fresh line", async () => {
    render(
      <MemoryRouter>
        <OnboardingOverlay {...baseProps} initialStep="first_line" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /TSC.*Ready/is }));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(baseProps.onAddServiceLine).toHaveBeenCalledWith("TSC");
    // FirstLineResult shows the def's full label (e.g. "Targeted Service
    // Coordination"), not the short type code.
    await waitFor(() => expect(screen.getByText(/is live/i)).toBeDefined());
    expect(baseProps.onStepChange).toHaveBeenCalledWith("line_result");
  });

  it("line_result Continue saves, then advances to invite_team when the tier can invite", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<MemoryRouter><OnboardingOverlay {...baseProps} onSave={onSave} initialStep="line_result" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onSave).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("heading", { name: /invite your team/i })).toBeDefined());
  });

  it("line_result -> done directly for a role that cannot invite anyone", async () => {
    render(
      <MemoryRouter>
        <OnboardingOverlay {...baseProps} role="HOUSE_LEAD" onSave={vi.fn().mockResolvedValue(true)} initialStep="line_result" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(screen.getByText(/you're set up/i)).toBeDefined());
  });

  it("a failed save stays on the payoff screen and shows the error, rather than silently advancing past it", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<MemoryRouter><OnboardingOverlay {...baseProps} onSave={onSave} initialStep="line_result" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(screen.getByText(/saving failed/i)).toBeDefined());
    expect(baseProps.onStepChange).not.toHaveBeenCalled();

    // Retrying with a successful save now advances normally.
    onSave.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /invite your team/i })).toBeDefined());
  });

  it("Invite your team navigates to /team and persists 'done' for when they come back", async () => {
    renderOverlay({ ...baseProps, initialStep: "invite_team" });
    fireEvent.click(screen.getByRole("button", { name: /invite your team →/i }));
    await waitFor(() => expect(screen.getByText(/team screen/i)).toBeDefined());
    expect(baseProps.onStepChange).toHaveBeenCalledWith("done");
  });

  it("'I'll do this later' advances to done in place", async () => {
    render(<MemoryRouter><OnboardingOverlay {...baseProps} initialStep="invite_team" /></MemoryRouter>);
    fireEvent.click(screen.getByText(/do this later/i));
    await waitFor(() => expect(screen.getByText(/you're set up/i)).toBeDefined());
  });

  it("Done screen's finish calls onComplete", () => {
    render(<MemoryRouter><OnboardingOverlay {...baseProps} initialStep="done" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /go to my dashboard/i }));
    expect(baseProps.onComplete).toHaveBeenCalledOnce();
  });
});

describe("OnboardingOverlay — tour step", () => {
  it("renders the tour and finishing it advances to whatever the state machine says is next", async () => {
    render(
      <MemoryRouter>
        <div>
          <div data-tour="sidebar" />
          <div data-tour="tab-strip" />
          <div data-tour="save-button" />
          <OnboardingOverlay {...baseProps} initialStep="tour" visibleSLsCount={1} />
        </div>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/shared inputs/i)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // shared -> strip
    await waitFor(() => expect(screen.getByText(/service line strip/i)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // strip -> save (last stop)
    await waitFor(() => expect(screen.getByRole("button", { name: /finish/i })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    // one existing line + tier that can invite -> next visible step is invite_team
    await waitFor(() => expect(screen.getByRole("heading", { name: /invite your team/i })).toBeDefined());
  });

  it("Skip tour advances past the tour like Finish would — it is NOT the global abandon-onboarding escape hatch", async () => {
    const onSkip = vi.fn(); // the overlay's own top-level onSkip — must NOT fire
    render(
      <MemoryRouter>
        <div data-tour="sidebar" />
        <OnboardingOverlay {...baseProps} onSkip={onSkip} initialStep="tour" visibleSLsCount={1} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/shared inputs/i)).toBeDefined());
    fireEvent.click(screen.getByText(/skip tour/i));

    // Same destination as finishing the tour normally (one existing line +
    // an invitable tier -> invite_team) — not a jump straight to the dashboard.
    await waitFor(() => expect(screen.getByRole("heading", { name: /invite your team/i })).toBeDefined());
    expect(onSkip).not.toHaveBeenCalled();
    expect(baseProps.onComplete).not.toHaveBeenCalled();
  });
});

describe("OnboardingOverlay — unknown step", () => {
  it("renders nothing for a step outside the known set", () => {
    const { container } = render(<MemoryRouter><OnboardingOverlay {...baseProps} initialStep="awaiting_company" /></MemoryRouter>);
    expect(container.textContent).toBe("");
  });
});
