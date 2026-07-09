import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingIntro from "../OnboardingIntro.jsx";

describe("OnboardingIntro — welcome step", () => {
  it("renders tier-specific welcome copy and calls onContinue", () => {
    const onContinue = vi.fn();
    render(<OnboardingIntro step="welcome" role="HOUSE_LEAD" provenance="invited" onContinue={onContinue} />);
    expect(screen.getByText(/welcome to intrinsic/i)).toBeDefined();
    expect(screen.getByText(/your own home's numbers only/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows a different welcome bullet for a different tier", () => {
    render(<OnboardingIntro step="welcome" role="OWNER" provenance="owner" onContinue={() => {}} />);
    expect(screen.getByText(/you see everything, unfiltered/i)).toBeDefined();
  });

  it("renders the Skip setup link only when onSkip is provided, and it fires", () => {
    const onSkip = vi.fn();
    const { rerender } = render(
      <OnboardingIntro step="welcome" role="CEO" provenance="owner" onContinue={() => {}} />,
    );
    expect(screen.queryByText(/skip setup/i)).toBeNull();

    rerender(<OnboardingIntro step="welcome" role="CEO" provenance="owner" onContinue={() => {}} onSkip={onSkip} />);
    fireEvent.click(screen.getByText(/skip setup/i));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});

describe("OnboardingIntro — access_granted step", () => {
  it("credits Intrinsic for an owner", () => {
    render(<OnboardingIntro step="access_granted" role="OWNER" provenance="owner" onContinue={() => {}} />);
    expect(screen.getByText(/you're in/i)).toBeDefined();
    expect(screen.getByText(/Intrinsic granted you/i)).toBeDefined();
  });

  it("shows the inviting owner's email for an invited teammate", () => {
    render(
      <OnboardingIntro
        step="access_granted"
        role="REGIONAL_DIRECTOR"
        provenance="invited"
        invitedByEmail="owner@sawtooth.org"
        onContinue={() => {}}
      />,
    );
    expect(screen.getByText(/invited by owner@sawtooth\.org/i)).toBeDefined();
  });

  it("shows the role badge and 'Enter workspace' label, and continue advances", () => {
    const onContinue = vi.fn();
    render(<OnboardingIntro step="access_granted" role="FINANCE" provenance="owner" onContinue={onContinue} />);
    expect(screen.getByText(/role · finance/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /enter workspace/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
