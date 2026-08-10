import { describe, expect, it } from "vitest";
import { buildRouteItineraryModel } from "../apps/webapp/js/features/route-guidance/ui/route-itinerary-model";

const circles = [
  { space: "東A01a", account: "one" },
  { space: "東A02b", account: "two" },
  { space: "西A03c", account: "three" },
];

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    navigationState: {
      stage: "navigating",
      areaId: "east",
      currentPosition: null,
      targetSpace: "東A02b",
      lockedFirstLeg: null,
      provisionalOrder: ["東A02b", "東A01a"],
      bestOrder: ["東A01a", "東A02b", "西A03c"],
    },
    currentDestination: circles[1],
    currentRoute: null,
    selectedDestination: circles[1],
    selectedRoute: null,
    selectionStatus: "idle",
    routeOptimizationGeneration: 1,
    ...overrides,
  } as any;
}

describe("buildRouteItineraryModel", () => {
  it("uses bestOrder, resolves pending circles, and keeps the current marker", () => {
    const entries = buildRouteItineraryModel(snapshot(), circles);

    expect(entries.map(({ index, space, isCurrent }) => ({ index, space, isCurrent }))).toEqual([
      { index: 1, space: "東A01a", isCurrent: false },
      { index: 2, space: "東A02b", isCurrent: true },
      { index: 3, space: "西A03c", isCurrent: false },
    ]);
    expect(entries[1].circle).toBe(circles[1]);
  });

  it("falls back only when bestOrder is empty and filters/deduplicates safely", () => {
    const entries = buildRouteItineraryModel(
      snapshot({
        navigationState: {
          ...snapshot().navigationState,
          bestOrder: [],
          provisionalOrder: ["missing", "東A02b", "東A02b", "東A01a"],
        },
      }),
      circles,
    );

    expect(entries.map((entry) => [entry.index, entry.space])).toEqual([
      [1, "東A02b"],
      [2, "東A01a"],
    ]);
  });

  it("does not mutate the navigation snapshot or pending input", () => {
    const state = snapshot();
    const pending = [...circles];
    const beforeState = structuredClone(state);
    const beforePending = [...pending];

    buildRouteItineraryModel(state, pending);

    expect(state).toEqual(beforeState);
    expect(pending).toEqual(beforePending);
  });
});
