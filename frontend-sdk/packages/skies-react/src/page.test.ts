import { describe, expect, it } from "vitest";
import { toPageInfo, type Page } from "./page";

const page = (over: Partial<Page<string>>): Page<string> => ({
  items: ["a"],
  totalCount: 1,
  pageNumber: 1,
  pageSize: 20,
  ...over,
});

const items = (n: number) => Array.from({ length: n }, (_, i) => `item-${i}`);

describe("toPageInfo", () => {
  it("derives the mid-page facts — count, the shown range, both directions open", () => {
    const info = toPageInfo(page({ items: items(20), totalCount: 87, pageNumber: 2 }));

    expect(info).toEqual({
      pageCount: 5,
      from: 21,
      to: 40,
      totalCount: 87,
      hasPrev: true,
      hasNext: true,
    });
  });

  it("the last partial page ends at the total, not at a full page", () => {
    const info = toPageInfo(page({ items: items(7), totalCount: 87, pageNumber: 5 }));

    expect(info.from).toBe(81);
    expect(info.to).toBe(87);
    expect(info.hasNext).toBe(false);
    expect(info.hasPrev).toBe(true);
  });

  it("a single short page is page 1 of 1", () => {
    const info = toPageInfo(page({ items: items(7), totalCount: 7 }));

    expect(info).toEqual({ pageCount: 1, from: 1, to: 7, totalCount: 7, hasPrev: false, hasNext: false });
  });

  it("an empty set is one empty page — range 0–0, nowhere to go", () => {
    const info = toPageInfo(page({ items: [], totalCount: 0 }));

    expect(info).toEqual({ pageCount: 1, from: 0, to: 0, totalCount: 0, hasPrev: false, hasNext: false });
  });

  it("propagates undefined — no page yet, no info (and no clamp)", () => {
    expect(toPageInfo(undefined)).toBeUndefined();
  });
});
