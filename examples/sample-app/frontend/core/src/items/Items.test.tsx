import type { ReactNode } from "react";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useItemsModel } from "./Items.viewModel";
import { ItemsView } from "./Items.view";

// CANONICAL TESTS — the two co-located test tiers the harness enforces:
//  - SKYFE005 (unit): renderHook the ViewModel (the data door) against the real client — wired, not mocked. On
//    mount the query is pending, so the resource is in its `loading` state.
//  - SKYFE006 (integration): render the View so it composes with its ViewModel + design system and mounts.
// Neither asserts behavior beyond "it mounts in the right state" — behavior stays per-screen judgment.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(cleanup);

describe("Items", () => {
  it("starts its resource in loading while the list is fetched (SKYFE005)", () => {
    const { result } = renderHook(() => useItemsModel(), { wrapper });
    expect(result.current.state.items.status).toBe("loading");
  });

  it("renders the View without crashing (SKYFE006)", () => {
    const { container } = render(<ItemsView />, { wrapper });
    expect(container).toBeTruthy();
  });

  it("renders the empty branch through the kit when the list settles empty", async () => {
    render(<ItemsView />, { wrapper });
    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
  });
});
