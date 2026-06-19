import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock supabase before importing App — avoids real client instantiation
vi.mock("../supabase.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  getProfile: vi.fn().mockResolvedValue(null),
}));

// Mock heavy page components to keep tests focused on App routing
vi.mock("../pages/LoginPage.jsx", () => ({
  default: () => <div data-testid="login-page">Login</div>,
}));
vi.mock("../pages/ToolPage.jsx", () => ({
  default: () => <div data-testid="tool-page">Tool</div>,
}));
vi.mock("../pages/LandingPage.jsx", () => ({
  default: () => <div data-testid="landing-page">Landing</div>,
}));
vi.mock("../pages/FeaturesPage.jsx", () => ({
  default: () => <div data-testid="features-page">Features</div>,
}));

import App from "../App.jsx";
import { supabase } from "../supabase.js";

// Render App at a specific route inside a MemoryRouter.
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: auth state change subscription (no-op)
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

describe("App — routing", () => {
  it("renders the landing page at /", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    await act(async () => { renderAt("/"); });
    expect(screen.getByTestId("landing-page")).toBeDefined();
    expect(screen.queryByTestId("login-page")).toBeNull();
  });

  it("renders the features page at /features", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    await act(async () => { renderAt("/features"); });
    expect(screen.getByTestId("features-page")).toBeDefined();
  });

  it("renders nothing at /app while the session is loading (getSession never resolves)", async () => {
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    const { container } = renderAt("/app");
    await act(async () => {});
    // No LoginPage or ToolPage — the /app element is null while loading.
    expect(screen.queryByTestId("login-page")).toBeNull();
    expect(screen.queryByTestId("tool-page")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("redirects /app to the login page when there is no session", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    await act(async () => { renderAt("/app"); });
    expect(screen.getByTestId("login-page")).toBeDefined();
    expect(screen.queryByTestId("tool-page")).toBeNull();
  });

  it("renders the login form at /login when there is no session", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    await act(async () => { renderAt("/login"); });
    expect(screen.getByTestId("login-page")).toBeDefined();
  });

  it("renders the tool at /app when a session exists", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });
    await act(async () => { renderAt("/app"); });
    expect(screen.getByTestId("tool-page")).toBeDefined();
    expect(screen.queryByTestId("login-page")).toBeNull();
  });

  it("redirects /login to the tool when a session already exists", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    });
    await act(async () => { renderAt("/login"); });
    expect(screen.getByTestId("tool-page")).toBeDefined();
    expect(screen.queryByTestId("login-page")).toBeNull();
  });

  it("calls subscription.unsubscribe on unmount", async () => {
    const unsubscribe = vi.fn();
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    let unmount;
    await act(async () => { ({ unmount } = renderAt("/")); });
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
