import type { ReactNode } from "react";
import type { AsyncState } from "./async-state";

// <Resource> — the View side of the spine: the routing mechanism that renders exactly one of an AsyncState's four
// states, so a screen never hand-rolls (or forgets) loading/error/empty. Design-system-AGNOSTIC by design: the
// loading / error / empty slots are supplied by the app (a thin app-level wrapper injects the design system's
// defaults), so this package stays free of any UI library. Because the union is exhaustive, "did this screen
// handle every state?" becomes a structural fact a lint rule can enforce — the front-side parallel of the backend
// forcing the Result sad path.
export function Resource<T>({
  state,
  children,
  loading,
  error,
  empty,
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  error?: (message: string, retry?: () => void) => ReactNode;
  empty?: ReactNode;
}) {
  switch (state.status) {
    case "loading":
      return <>{loading ?? null}</>;
    case "error":
      return <>{error ? error(state.message, state.retry) : null}</>;
    case "empty":
      return <>{empty ?? null}</>;
    case "ready":
      return <>{children(state.data)}</>;
  }
}
