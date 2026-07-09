import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FirstLineResult from "../FirstLineResult.jsx";

describe("FirstLineResult", () => {
  it("shows dollar figures and margin for a full-visibility tier", () => {
    render(
      <FirstLineResult
        role="OWNER"
        lineLabel="TSC"
        lineRevenue={41200}
        lineLabor={22640}
        netMargin={0.283}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText(/TSC is live/i)).toBeDefined();
    expect(screen.getByText("$41,200")).toBeDefined();
    expect(screen.getByText("$22,640")).toBeDefined();
    expect(screen.getByText("28.3%")).toBeDefined();
    expect(screen.queryByText(/hidden to owner, ceo/i)).toBeNull();
  });

  it("masks dollar figures but keeps margin visible for a mid tier", () => {
    render(
      <FirstLineResult
        role="REGIONAL_DIRECTOR"
        lineLabel="Res Hab Daily"
        lineRevenue={41200}
        lineLabor={22640}
        netMargin={0.283}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Hidden")).toHaveLength(2);
    expect(screen.getByText("28.3%")).toBeDefined();
    expect(screen.getByText(/visible to owner, ceo, and finance/i)).toBeDefined();
  });

  it("shows zero figures honestly for a freshly-added, unconfigured line", () => {
    render(
      <FirstLineResult role="OWNER" lineLabel="TSC" lineRevenue={0} lineLabor={0} netMargin={0} onContinue={vi.fn()} />,
    );
    expect(screen.getAllByText("$0")).toHaveLength(2);
    expect(screen.getByText("0.0%")).toBeDefined();
  });

  it("shows a save error banner when provided", () => {
    render(
      <FirstLineResult role="OWNER" lineLabel="TSC" lineRevenue={0} lineLabor={0} netMargin={0} saveError="Saving failed" onContinue={vi.fn()} />,
    );
    expect(screen.getByText(/saving failed/i)).toBeDefined();
  });

  it("Continue calls onContinue", () => {
    const onContinue = vi.fn();
    render(<FirstLineResult role="OWNER" lineLabel="TSC" lineRevenue={0} lineLabor={0} netMargin={0} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
