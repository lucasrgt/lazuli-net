/** Operations for a lifecycle whose states have one explicit declaration order. */
export interface OrderedLifecycle<TState> {
  /** True when `current` is at or past `step`, allowing that step to be written or revisited. */
  reached(current: TState, step: TState): boolean;
  /**
   * Returns `next` only when the cursor is exactly at the step being completed and `next` is its declared
   * immediate successor. Earlier-step edits, regressions, and skipped states leave the cursor unchanged.
   */
  advance(current: TState, step: TState, next: TState): TState;
}

/**
 * Defines order-dependent lifecycle mechanics from an explicit tuple of states. Explicit order keeps
 * string-literal states usable without decorators, numeric enums, or hidden discovery.
 */
export function orderedLifecycle<const TState>(states: readonly TState[]): OrderedLifecycle<TState> {
  if (states.length === 0) throw new TypeError("An ordered lifecycle requires at least one state");

  const positions = new Map<TState, number>();
  states.forEach((state, index) => {
    if (positions.has(state)) throw new TypeError("An ordered lifecycle cannot contain duplicate states");
    positions.set(state, index);
  });

  const positionOf = (state: TState): number => {
    const position = positions.get(state);
    if (position === undefined) throw new TypeError("State does not belong to this ordered lifecycle");
    return position;
  };

  return {
    reached: (current, step) => positionOf(current) >= positionOf(step),
    advance: (current, step, next) => {
      const currentPosition = positionOf(current);
      const stepPosition = positionOf(step);
      const nextPosition = positionOf(next);
      const isExactNextStep = nextPosition === stepPosition + 1;
      return currentPosition === stepPosition && isExactNextStep ? next : current;
    },
  };
}
