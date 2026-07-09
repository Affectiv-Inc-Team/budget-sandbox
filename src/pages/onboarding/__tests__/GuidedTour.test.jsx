import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import GuidedTour from "../GuidedTour.jsx";

// Real target elements the tour queries via document.querySelector — rendered
// as plain DOM stubs (jsdom gives every element a zero-valued
// getBoundingClientRect, which is fine; the tour's positioning math doesn't
// need real pixels to be exercised, just a found-vs-not-found target).
function Targets({ include = ["sidebar", "tab-strip", "save-button"] }) {
  return (
    <div>
      {include.map((t) => <div key={t} data-tour={t} />)}
    </div>
  );
}

beforeEach(() => cleanup());

describe("GuidedTour — stop content and navigation", () => {
  it("shows the first stop (shared inputs) when all targets are present", async () => {
    render(
      <>
        <Targets />
        <GuidedTour role="OWNER" multiCompany={false} onFinish={vi.fn()} onSkip={vi.fn()} />
      </>,
    );
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());
    expect(screen.getByText(/shared inputs/i)).toBeDefined();
    expect(screen.getByText(/1 \/ 3/)).toBeDefined();
  });

  it("Next advances through strip then save, Finish calls onFinish", async () => {
    const onFinish = vi.fn();
    render(
      <>
        <Targets />
        <GuidedTour role="OWNER" multiCompany={false} onFinish={onFinish} onSkip={vi.fn()} />
      </>,
    );
    await waitFor(() => expect(screen.getByText(/shared inputs/i)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/service line strip/i)).toBeDefined());
    expect(screen.getByText(/2 \/ 3/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /finish/i })).toBeDefined());
    expect(screen.getByText(/3 \/ 3/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("Skip tour calls onSkip immediately regardless of current stop", async () => {
    const onSkip = vi.fn();
    render(
      <>
        <Targets />
        <GuidedTour role="OWNER" multiCompany={false} onFinish={vi.fn()} onSkip={onSkip} />
      </>,
    );
    await waitFor(() => expect(screen.getByText(/shared inputs/i)).toBeDefined());
    fireEvent.click(screen.getByText(/skip tour/i));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});

describe("GuidedTour — missing-target handling", () => {
  it("skips the company-switcher stop when there's only one company (target absent) and starts on shared", async () => {
    render(
      <>
        <Targets />{/* no company-switcher target */}
        <GuidedTour role="OWNER" multiCompany={true} onFinish={vi.fn()} onSkip={vi.fn()} />
      </>,
    );
    await waitFor(() => expect(screen.getByText(/shared inputs/i)).toBeDefined());
    // getTourStops would include a switcher stop for multiCompany=true, but
    // its target isn't in the DOM here, so the tour lands directly on shared.
    expect(screen.queryByText(/company switcher/i)).toBeNull();
  });

  it("shows the switcher stop when its target is present", async () => {
    render(
      <>
        <Targets include={["company-switcher", "sidebar", "tab-strip", "save-button"]} />
        <GuidedTour role="OWNER" multiCompany={true} onFinish={vi.fn()} onSkip={vi.fn()} />
      </>,
    );
    await waitFor(() => expect(screen.getByText(/company switcher/i)).toBeDefined());
    expect(screen.getByText(/1 \/ 4/)).toBeDefined();
  });

  it("calls onFinish immediately when every stop's target is missing", async () => {
    const onFinish = vi.fn();
    render(<GuidedTour role="OWNER" multiCompany={false} onFinish={onFinish} onSkip={vi.fn()} />);
    await waitFor(() => expect(onFinish).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("GuidedTour — read-only tier retargets the save stop", () => {
  it("a House Lead's save stop still completes the tour when only tab-strip exists (no save-button target)", async () => {
    const onFinish = vi.fn();
    render(
      <>
        <Targets include={["sidebar", "tab-strip"]} />{/* no save-button — House Lead has none */}
        <GuidedTour role="HOUSE_LEAD" multiCompany={false} onFinish={onFinish} onSkip={vi.fn()} />
      </>,
    );
    await waitFor(() => expect(screen.getByText(/shared inputs/i)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /next/i })); // -> strip
    await waitFor(() => expect(screen.getByText(/service line strip/i)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /next/i })); // -> save (retargeted to tab-strip)
    await waitFor(() => expect(screen.getByText(/read-only/i)).toBeDefined());
    expect(screen.getByRole("button", { name: /finish/i })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /finish/i }));
    expect(onFinish).toHaveBeenCalledOnce();
  });
});
