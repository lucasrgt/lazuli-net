import { describe, expect, it } from "vitest";
import { mapPage, type Page } from "./index.js";

describe("mapPage", () => {
  it("projects items in order and preserves every paging fact", () => {
    const page: Page<number> = {
      items: [3, 1, 2],
      totalCount: 87,
      pageNumber: 2,
      pageSize: 3,
    };

    const projected = mapPage(page, (item, index) => `${index}:${item}`);

    expect(projected).toEqual({
      items: ["0:3", "1:1", "2:2"],
      totalCount: 87,
      pageNumber: 2,
      pageSize: 3,
    });
    expect(projected.items).not.toBe(page.items);
  });

  it("keeps standalone metadata on an empty page past the end", () => {
    const page: Page<string> = {
      items: [],
      totalCount: 40,
      pageNumber: 9,
      pageSize: 20,
    };

    const projected = mapPage(page, (item) => item.length);

    expect(projected.items).toEqual([]);
    expect(projected.totalCount).toBe(40);
    expect(projected.pageNumber).toBe(9);
    expect(projected.pageSize).toBe(20);
  });
});
