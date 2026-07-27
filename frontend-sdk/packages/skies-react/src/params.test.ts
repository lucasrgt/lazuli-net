import { describe, expect, it } from "vitest";
import { requiredParam } from "./params";

// requiredParam — the param-presence union (SKYFE018's blessed shape). The missing case must be a branch the
// route writes, and every loose router shape must normalize into one of the two arms.
describe("requiredParam", () => {
  it("is missing when the param is absent", () => {
    expect(requiredParam(undefined)).toEqual({ status: "missing" });
  });

  it("is missing when the param is empty — an empty id ghosts the same as no id", () => {
    expect(requiredParam("")).toEqual({ status: "missing" });
    expect(requiredParam([])).toEqual({ status: "missing" });
  });

  it("is ready with the value", () => {
    expect(requiredParam("abc")).toEqual({ status: "ready", value: "abc" });
  });

  it("normalizes a repeated query key (array) to its first entry", () => {
    expect(requiredParam(["abc", "def"])).toEqual({ status: "ready", value: "abc" });
  });
});
