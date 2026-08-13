import { describe, expect, it } from "vitest";
import {
  collectCirclePriorities,
  filterCirclesByPriority,
  matchesCirclePriority,
  normalizeCirclePriority,
} from "../apps/webapp/js/shared/domain/circle-priority-filter";

const circles = [
  { space: "東A01", priority: 10 },
  { space: "東A02", priority: " 9 " },
  { space: "東A03", priority: 10 },
  { space: "西A01", priority: undefined },
  { space: "西A02", priority: "not-a-number" },
];

describe("circle priority filter", () => {
  it.each([
    [10, 10],
    ["10", 10],
    [" 10 ", 10],
    ["", null],
    ["   ", null],
    [undefined, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    ["not-a-number", null],
  ])("normalizes %j", (value, expected) => {
    expect(normalizeCirclePriority(value)).toBe(expected);
  });

  it("collects unique finite priorities in descending order", () => {
    expect(collectCirclePriorities([...circles, { space: "西A03", priority: 8 }])).toEqual([
      10,
      9,
      8,
    ]);
  });

  it.each([
    [null, ["東A01", "東A02", "東A03", "西A01", "西A02"]],
    [[], ["東A01", "東A02", "東A03", "西A01", "西A02"]],
    [[10], ["東A01", "東A03"]],
    [[10, 9], ["東A01", "東A02", "東A03"]],
  ])("filters by exact selected priorities %j", (selected, spaces) => {
    expect(filterCirclesByPriority(circles, selected)).toEqual(
      circles.filter(({ space }) => spaces.includes(space)),
    );
  });

  it("does not mutate the input array and rejects invalid priority when selected", () => {
    const input = [...circles];
    expect(matchesCirclePriority(circles[3], [10])).toBe(false);
    expect(filterCirclesByPriority(input, [10])).not.toBe(input);
    expect(input).toEqual(circles);
  });
});
