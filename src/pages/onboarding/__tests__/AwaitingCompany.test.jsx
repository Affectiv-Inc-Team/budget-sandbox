import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import AwaitingCompany from "../AwaitingCompany.jsx";

describe("AwaitingCompany", () => {
  it("renders the checklist and a Contact administrator link", () => {
    render(<AwaitingCompany onCheckAgain={vi.fn()} />);
    expect(screen.getByText(/workspace is being set up/i)).toBeDefined();
    expect(screen.getByText(/account activated/i)).toBeDefined();
    expect(screen.getByText(/awaiting company assignment/i)).toBeDefined();
    expect(screen.getByText(/access granted/i)).toBeDefined();
    expect(screen.getByText(/contact administrator/i)).toBeDefined();
  });

  it("Check again calls onCheckAgain and shows a checking state meanwhile", async () => {
    let resolve;
    const onCheckAgain = vi.fn(() => new Promise((r) => { resolve = r; }));
    render(<AwaitingCompany onCheckAgain={onCheckAgain} />);

    fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    expect(onCheckAgain).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /checking/i })).toBeDefined();

    await act(async () => { resolve(); });
    await waitFor(() => expect(screen.getByRole("button", { name: /^check again$/i })).not.toBeDisabled());
  });

  it("renders a Skip setup link only when onSkip is provided", () => {
    const onSkip = vi.fn();
    const { rerender } = render(<AwaitingCompany onCheckAgain={vi.fn()} />);
    expect(screen.queryByText(/skip setup/i)).toBeNull();

    rerender(<AwaitingCompany onCheckAgain={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByText(/skip setup/i));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
