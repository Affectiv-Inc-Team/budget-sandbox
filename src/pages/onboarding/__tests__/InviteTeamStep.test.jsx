import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InviteTeamStep from "../InviteTeamStep.jsx";

describe("InviteTeamStep", () => {
  it("Invite your team calls onGoToTeam", () => {
    const onGoToTeam = vi.fn();
    render(<InviteTeamStep onGoToTeam={onGoToTeam} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /invite your team/i }));
    expect(onGoToTeam).toHaveBeenCalledOnce();
  });

  it("'I'll do this later' calls onContinue", () => {
    const onContinue = vi.fn();
    render(<InviteTeamStep onGoToTeam={vi.fn()} onContinue={onContinue} />);
    fireEvent.click(screen.getByText(/do this later/i));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
