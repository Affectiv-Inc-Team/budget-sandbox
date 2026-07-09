import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../../lib/posthog.js", () => ({
  default: { capture: vi.fn() },
  useFeatureFlag: vi.fn(() => false),
}));

import FirstServiceLinePicker from "../FirstServiceLinePicker.jsx";
import { useFeatureFlag } from "../../../lib/posthog.js";

beforeEach(() => vi.clearAllMocks());

describe("FirstServiceLinePicker", () => {
  it("renders active types as selectable 'Ready' cards and catalog types as disabled", () => {
    render(<FirstServiceLinePicker onContinue={vi.fn()} />);
    const tscCard = screen.getByRole("button", { name: /TSC.*Targeted Service Coordination.*Ready/is });
    expect(tscCard).not.toBeDisabled();

    const bhCard = screen.getByRole("button", { name: /BH_OUTPATIENT.*Catalog only/is });
    expect(bhCard).toBeDisabled();
  });

  it("Continue is disabled until a ready card is selected, then calls onContinue with the type", () => {
    const onContinue = vi.fn();
    render(<FirstServiceLinePicker onContinue={onContinue} />);
    const continueBtn = screen.getByRole("button", { name: /^continue$/i });
    expect(continueBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /TSC.*Ready/is }));
    expect(continueBtn).not.toBeDisabled();

    fireEvent.click(continueBtn);
    expect(onContinue).toHaveBeenCalledWith("TSC");
  });

  it("clicking a disabled catalog card does not select it", () => {
    render(<FirstServiceLinePicker onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /BH_OUTPATIENT.*Catalog only/is }));
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeDisabled();
  });

  it("respects the hide-catalog-service-lines feature flag", () => {
    useFeatureFlag.mockReturnValue(true);
    render(<FirstServiceLinePicker onContinue={vi.fn()} />);
    expect(screen.queryByText("BH_OUTPATIENT")).toBeNull();
    expect(screen.getByRole("button", { name: /TSC.*Ready/is })).toBeDefined();
  });
});
