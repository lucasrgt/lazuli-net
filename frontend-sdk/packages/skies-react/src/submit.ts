// Form-submit primitives the spine graduates from app pilots. Form-library-AGNOSTIC by the same trick the rest
// of the spine uses (cf. QueryLike, BackRouter): they take react-hook-form's `handleSubmit` structurally, so the
// spine depends on no form library while binding to the real one with full typing.

/**
 * The shape of react-hook-form's `handleSubmit`, taken structurally so the spine depends on no form library.
 *
 * @typeParam TValues - the (transformed) form values handed to a successful submit.
 * @typeParam TErrors - the per-field error bag handed to a failed validation (RHF's `FieldErrors<T>`).
 */
export type HandleSubmitLike<TValues, TErrors extends object> = (
  onValid: (values: TValues) => unknown,
  onInvalid?: (errors: TErrors) => unknown,
) => () => Promise<unknown>;

/**
 * The invalid-path surface {@link submitOrReveal} forces every submit to carry.
 *
 * @typeParam TField - the form's field names (`keyof` the form values).
 */
export interface SubmitOrRevealOptions<TField extends string> {
  /**
   * Called on every validation failure with the first invalid field — the REQUIRED surface. Wire it to the
   * feedback seam (a "fix the highlighted fields" toast) and/or a reveal gesture (`form.setFocus(first)`, switch
   * to the field's tab/step, scroll to it). It being a required option is the whole point: a submit cannot be
   * constructed without deciding where its validation failure shows.
   */
  onInvalid: (firstInvalid: TField) => void;
  /**
   * The form's visual field order, used to resolve WHICH invalid field is "first". Without it the error bag's
   * own key order is used — fine for most forms; pass it when the reveal navigates (tabs/steps) and "first"
   * must mean "first as the user reads the form", not "first as validation produced it".
   */
  order?: readonly TField[];
}

/**
 * Wraps react-hook-form's `handleSubmit` so the invalid path always has a surface. A bare `handleSubmit(onValid)`
 * swallows a validation failure silently — and when the failing field sits on another tab/step (off-screen), the
 * submit button goes completely mute: no mutation, no toast, no visible error (a shipped pilot bug). This
 * primitive couples an `onInvalid` to every submit by construction and resolves the **first invalid field** so
 * the caller can navigate to it.
 *
 * The returned submit resolves to that first invalid field (`null` when the submit was valid), so a multi-tab
 * shell can jump: `const first = await submit(); if (first) setTab(FIELD_TAB[first]);`. A single-screen form
 * typically just focuses it: `{ onInvalid: (first) => form.setFocus(first) }`.
 *
 * RHF's reserved `root` error key never resolves as a field — it names no navigable control.
 *
 * @typeParam TValues - the form values; field names are `keyof TValues`.
 * @typeParam TErrors - the error bag type, inferred from `handleSubmit` (RHF's `FieldErrors<T>`).
 * @param handleSubmit - the form's `handleSubmit`, passed by reference (`form.handleSubmit`).
 * @param onValid - the happy path — runs only when validation passes (awaited before the submit resolves).
 * @param options - the forced invalid surface (and optionally the form's visual field order).
 * @returns a submit handler resolving to the first invalid field, or `null` when the values were valid.
 */
export function submitOrReveal<TValues extends object, TErrors extends object>(
  handleSubmit: HandleSubmitLike<TValues, TErrors>,
  onValid: (values: TValues) => unknown,
  options: SubmitOrRevealOptions<Extract<keyof TValues, string>>,
): () => Promise<Extract<keyof TValues, string> | null> {
  type TField = Extract<keyof TValues, string>;
  const { onInvalid, order } = options;
  return async () => {
    let first: TField | null = null;
    await handleSubmit(onValid, (errors) => {
      // RHF's `root` key carries form-level errors set by hand — not a navigable field, never "first".
      const invalid = Object.keys(errors).filter((k) => k !== "root") as TField[];
      first = order?.find((f) => invalid.includes(f)) ?? invalid[0] ?? null;
      if (first !== null) onInvalid(first);
    })();
    return first;
  };
}
