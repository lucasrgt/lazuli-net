import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Resource } from "./Resource";
import type { AsyncState } from "./async-state";

// <Resource> must render EXACTLY one of the four states and never leak the body into a non-ready state — that
// exhaustiveness is the guarantee a screen "handled every state" (the front-side of forcing the Result sad path).
describe("Resource", () => {
  const body = (data: string[]) => <span>{data.join(",")}</span>;

  it("renders the loading slot and not the body while loading", () => {
    render(
      <Resource state={{ status: "loading" }} loading={<span>loading…</span>}>
        {body}
      </Resource>,
    );
    expect(screen.getByText("loading…")).toBeTruthy();
    expect(screen.queryByText(/,/)).toBeNull();
  });

  it("renders the error slot with the message and wires retry", () => {
    let retried = false;
    render(
      <Resource
        state={{ status: "error", message: "boom", retry: () => (retried = true) }}
        error={(message, retry) => (
          <button type="button" onClick={retry}>
            {message}
          </button>
        )}
      >
        {body}
      </Resource>,
    );
    fireEvent.click(screen.getByText("boom"));
    expect(retried).toBe(true);
  });

  it("renders the empty slot", () => {
    render(
      <Resource state={{ status: "empty" }} empty={<span>nothing here</span>}>
        {body}
      </Resource>,
    );
    expect(screen.getByText("nothing here")).toBeTruthy();
  });

  it("renders the body only with resolved data", () => {
    const state: AsyncState<string[]> = { status: "ready", data: ["a", "b"] };
    render(<Resource state={state}>{body}</Resource>);
    expect(screen.getByText("a,b")).toBeTruthy();
  });
});
