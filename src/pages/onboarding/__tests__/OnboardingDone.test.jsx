import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingDone from "../OnboardingDone.jsx";

describe("OnboardingDone", () => {
  it("owner summary mentions configuring a first service line and calls onFinish", () => {
    const onFinish = vi.fn();
    render(<OnboardingDone role="OWNER" provenance="owner" onFinish={onFinish} />);
    expect(screen.getByText(/you're set up/i)).toBeDefined();
    expect(screen.getByText(/configured your first service line/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /go to my dashboard/i }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("invited read-only tier gets the nothing-to-save next step", () => {
    render(<OnboardingDone role="HOUSE_LEAD" provenance="invited" onFinish={vi.fn()} />);
    expect(screen.getByText(/nothing to save/i)).toBeDefined();
  });

  it("invited tier that can add lines gets the add-a-line next step", () => {
    render(<OnboardingDone role="REGIONAL_DIRECTOR" provenance="invited" onFinish={vi.fn()} />);
    expect(screen.getByText(/add a new service line/i)).toBeDefined();
  });
});
