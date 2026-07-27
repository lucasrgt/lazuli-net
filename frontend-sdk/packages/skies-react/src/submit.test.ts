import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { submitOrReveal, type HandleSubmitLike } from "./submit";

// submitOrReveal exists so a validation failure can NEVER be silent: a bare handleSubmit(onValid) with the failing
// field off-screen (another tab) left a pilot's Save button completely mute. Pin both halves: the forced onInvalid
// surface fires with the FIRST invalid field (visual order when given), and the submit resolves that field so a
// shell can navigate to it.

interface Form {
  name: string;
  email: string;
  age: string;
}

/** A structural handleSubmit that fails validation with `errors` (or succeeds when null) — the RHF contract. */
function fakeHandleSubmit(errors: Partial<Record<keyof Form, { message: string }>> | null): HandleSubmitLike<Form, FieldErrors<Form>> {
  return (onValid, onInvalid) => async () => {
    if (errors) onInvalid?.(errors as FieldErrors<Form>);
    else await onValid({ name: "n", email: "e", age: "9" });
  };
}

describe("submitOrReveal", () => {
  it("runs onValid and resolves null when the values are valid (the invalid surface stays untouched)", async () => {
    const onValid = vi.fn();
    const onInvalid = vi.fn();
    const submit = submitOrReveal(fakeHandleSubmit(null), onValid, { onInvalid });
    await expect(submit()).resolves.toBeNull();
    expect(onValid).toHaveBeenCalledOnce();
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("fires onInvalid with the first invalid field and resolves it (the error-bag order by default)", async () => {
    const onInvalid = vi.fn();
    const submit = submitOrReveal(fakeHandleSubmit({ email: { message: "x" }, age: { message: "y" } }), vi.fn(), {
      onInvalid,
    });
    await expect(submit()).resolves.toBe("email");
    expect(onInvalid).toHaveBeenCalledOnce();
    expect(onInvalid).toHaveBeenCalledWith("email");
  });

  it("resolves 'first' by the form's VISUAL order when `order` is given, not the error-bag order", async () => {
    const onInvalid = vi.fn();
    const submit = submitOrReveal(fakeHandleSubmit({ age: { message: "y" }, name: { message: "x" } }), vi.fn(), {
      onInvalid,
      order: ["name", "email", "age"],
    });
    // The bag lists age first; the user reads name first — the reveal must land on name.
    await expect(submit()).resolves.toBe("name");
    expect(onInvalid).toHaveBeenCalledOnce();
    expect(onInvalid).toHaveBeenCalledWith("name");
  });

  it("never resolves RHF's reserved `root` key as a field — it names no navigable control", async () => {
    const onInvalid = vi.fn();
    const errors = { root: { message: "server said no" }, email: { message: "x" } } as FieldErrors<Form>;
    const submit = submitOrReveal<Form, FieldErrors<Form>>(
      (onValid, onInv) => async () => void onInv?.(errors),
      vi.fn(),
      { onInvalid },
    );
    await expect(submit()).resolves.toBe("email");
  });

  it("binds to the REAL react-hook-form handleSubmit (wired, not just shaped)", async () => {
    const schema = z.object({ name: z.string().min(1), email: z.string().min(1), age: z.string() });
    const { result } = renderHook(() =>
      useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", age: "1" } }),
    );
    const onValid = vi.fn();
    const onInvalid = vi.fn();
    const submit = submitOrReveal(result.current.handleSubmit, onValid, {
      onInvalid,
      order: ["name", "email", "age"],
    });
    let first: "name" | "email" | "age" | null = "age";
    await act(async () => {
      first = await submit();
    });
    expect(first).toBe("name");
    expect(onInvalid).toHaveBeenCalledOnce();
    expect(onInvalid).toHaveBeenCalledWith("name");
    expect(onValid).not.toHaveBeenCalled();
  });
});
