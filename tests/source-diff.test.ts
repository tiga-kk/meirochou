import { describe, expect, it } from "vitest";
import {
  applySourceDiff,
  diffCircleSources,
} from "../apps/webapp/js/data/source-diff";
import type {
  CircleRecord,
  LocalEventDayState,
} from "../apps/webapp/js/types/domain";

describe("source-diff", () => {
  const dummyCircle1: CircleRecord = {
    space: "東A01a",
    priority: 1,
    account: "user1",
    tweet: "https://x.com/user1",
    memo: "memo1",
  };

  const dummyCircle2: CircleRecord = {
    space: "東A01b",
    priority: 2,
    account: "user2",
    tweet: "https://x.com/user2",
    memo: "memo2",
  };

  const dummyCircle3: CircleRecord = {
    space: "東A02a",
    priority: 3,
    account: "user3",
    tweet: "https://x.com/user3",
    memo: "memo3",
  };

  describe("diffCircleSources", () => {
    it("should classify added, removed, updated, and unchanged circles correctly", () => {
      // dummyCircle1 is unchanged
      // dummyCircle2 is updated (memo changed)
      // dummyCircle3 is removed
      // dummyCircle4 is added
      const current: CircleRecord[] = [
        dummyCircle1,
        dummyCircle2,
        dummyCircle3,
      ];

      const dummyCircle2Updated: CircleRecord = {
        ...dummyCircle2,
        memo: "memo2-updated",
      };

      const dummyCircle4: CircleRecord = {
        space: "東A02b",
        priority: 4,
        account: "user4",
        tweet: "https://x.com/user4",
        memo: "memo4",
      };

      const incoming: CircleRecord[] = [
        dummyCircle1,
        dummyCircle2Updated,
        dummyCircle4,
      ];

      const diff = diffCircleSources(current, incoming);

      expect(diff.added).toEqual([dummyCircle4]);
      expect(diff.removed).toEqual([dummyCircle3]);
      expect(diff.updated).toEqual([
        { before: dummyCircle2, after: dummyCircle2Updated },
      ]);
      expect(diff.unchanged).toEqual([dummyCircle1]);
    });

    it("should ignore removedFromSource: true circles in current when calculating diff", () => {
      // A circle with removedFromSource: true in current, not in incoming -> should not be in 'removed' (already removed)
      // A circle with removedFromSource: true in current, but present in incoming -> should be in 'added' (restored)
      const current: CircleRecord[] = [
        { ...dummyCircle1, removedFromSource: true },
        dummyCircle2,
      ];

      const incoming: CircleRecord[] = [
        dummyCircle1, // restored!
      ];

      const diff = diffCircleSources(current, incoming);

      // dummyCircle1 was removedFromSource: true, but now in incoming. It should be "added"
      expect(diff.added).toEqual([dummyCircle1]);
      // dummyCircle2 was active in current, but not in incoming. It should be "removed"
      expect(diff.removed).toEqual([dummyCircle2]);
      expect(diff.updated).toEqual([]);
      expect(diff.unchanged).toEqual([]);
    });

    it("should have stable deterministic order based on incoming and current", () => {
      const current: CircleRecord[] = [
        dummyCircle3,
        dummyCircle2,
        dummyCircle1,
      ];
      const incoming: CircleRecord[] = [dummyCircle1, dummyCircle3];

      const diff = diffCircleSources(current, incoming);
      // Removed: dummyCircle2 (active current not in incoming)
      // Unchanged: dummyCircle3, dummyCircle1 (in incoming in that order)
      expect(diff.removed).toEqual([dummyCircle2]);
      expect(diff.unchanged).toEqual([dummyCircle1, dummyCircle3]);
    });
  });

  describe("applySourceDiff", () => {
    const initialTimestamps = {
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-21T00:00:00.000Z",
    };

    const baseState: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName: "circles.csv" },
      sourceGeneration: "g-001",
      circles: [dummyCircle1, dummyCircle2],
      purchased: ["東A01a"],
      hold: ["東A01b"],
      history: [
        {
          type: "purchase",
          space: "東A01a",
          timestamp: "2026-07-21T00:00:00.000Z",
        },
      ],
      redo: [],
      gasOutbox: [],
      timestamps: initialTimestamps,
    };

    it("should merge circles and mark removed ones as removedFromSource: true", () => {
      // dummyCircle1 is kept
      // dummyCircle2 is removed (not in incoming)
      // dummyCircle3 is added (in incoming)
      const incoming = [dummyCircle1, dummyCircle3];
      const now = "2026-07-21T01:00:00.000Z";

      const nextState = applySourceDiff(baseState, incoming, now);

      expect(nextState.circles).toEqual([
        dummyCircle1,
        dummyCircle3,
        { ...dummyCircle2, removedFromSource: true },
      ]);
      expect(nextState.timestamps.createdAt).toBe(initialTimestamps.createdAt);
      expect(nextState.timestamps.updatedAt).toBe(now);
      expect(nextState.timestamps.sourceUpdatedAt).toBe(now);
    });

    it("should preserve existing removedFromSource circles if they remain absent", () => {
      const stateWithRemoved: LocalEventDayState = {
        ...baseState,
        circles: [dummyCircle1, { ...dummyCircle2, removedFromSource: true }],
      };

      const incoming = [dummyCircle1];
      const now = "2026-07-21T01:00:00.000Z";

      const nextState = applySourceDiff(stateWithRemoved, incoming, now);

      expect(nextState.circles).toEqual([
        dummyCircle1,
        { ...dummyCircle2, removedFromSource: true },
      ]);
    });

    it("should restore removedFromSource circle if it is in incoming", () => {
      const stateWithRemoved: LocalEventDayState = {
        ...baseState,
        circles: [dummyCircle1, { ...dummyCircle2, removedFromSource: true }],
      };

      const incoming = [dummyCircle1, dummyCircle2];
      const now = "2026-07-21T01:00:00.000Z";

      const nextState = applySourceDiff(stateWithRemoved, incoming, now);

      // dummyCircle2 should no longer have removedFromSource: true
      expect(nextState.circles).toEqual([dummyCircle1, dummyCircle2]);
    });

    it("should preserve user local lists (purchased, hold, history, redo, gasOutbox)", () => {
      const incoming = [dummyCircle1];
      const now = "2026-07-21T01:00:00.000Z";

      const nextState = applySourceDiff(baseState, incoming, now);

      expect(nextState.purchased).toEqual(baseState.purchased);
      expect(nextState.hold).toEqual(baseState.hold);
      expect(nextState.history).toEqual(baseState.history);
      expect(nextState.redo).toEqual(baseState.redo);
      expect(nextState.gasOutbox).toEqual(baseState.gasOutbox);
    });

    it("should automatically purchase if incoming circle has isSale=x or X, and add to history", () => {
      // dummyCircle3 is incoming and has isSale: "x" (not in current purchased)
      // dummyCircle4 is incoming and has isSale: "X" (not in current purchased)
      const incoming: CircleRecord[] = [
        dummyCircle1,
        { ...dummyCircle3, isSale: "x" },
        { ...dummyCircle2, isSale: "X" },
      ];
      const now = "2026-07-21T01:00:00.000Z";

      const nextState = applySourceDiff(baseState, incoming, now);

      // baseState already has "東A01a" in purchased
      // Now "東A02a" (dummyCircle3) and "東A01b" (dummyCircle2) should be added to purchased
      expect(nextState.purchased).toContain("東A01a");
      expect(nextState.purchased).toContain("東A02a");
      expect(nextState.purchased).toContain("東A01b");
      expect(nextState.purchased.length).toBe(3);

      // history should contain purchase events for the new ones
      expect(nextState.history).toEqual([
        ...baseState.history,
        { type: "purchase", space: "東A02a", timestamp: now },
        { type: "purchase", space: "東A01b", timestamp: now },
      ]);
    });

    it("should NOT remove from purchased if incoming circle has empty isSale", () => {
      // dummyCircle1 has isSale: "" in incoming, but "東A01a" is already in baseState.purchased.
      // It should NOT be removed from purchased.
      const incoming: CircleRecord[] = [{ ...dummyCircle1, isSale: "" }];
      const now = "2026-07-21T01:00:00.000Z";

      const nextState = applySourceDiff(baseState, incoming, now);

      expect(nextState.purchased).toEqual(baseState.purchased);
    });

    it("should enforce deep immutability by freezing the output state and all nested objects/arrays", () => {
      const incoming = [dummyCircle1];
      const now = "2026-07-21T01:00:00.000Z";

      const nextState = applySourceDiff(baseState, incoming, now);

      expect(Object.isFrozen(nextState)).toBe(true);
      expect(Object.isFrozen(nextState.circles)).toBe(true);
      expect(Object.isFrozen(nextState.circles[0])).toBe(true);
      expect(Object.isFrozen(nextState.purchased)).toBe(true);
      expect(Object.isFrozen(nextState.hold)).toBe(true);
      expect(Object.isFrozen(nextState.history)).toBe(true);
      expect(Object.isFrozen(nextState.history[0])).toBe(true);
      expect(Object.isFrozen(nextState.redo)).toBe(true);
      expect(Object.isFrozen(nextState.gasOutbox)).toBe(true);
      expect(Object.isFrozen(nextState.timestamps)).toBe(true);

      // Ensure input was not mutated
      expect(Object.isFrozen(baseState)).toBe(false); // we didn't freeze baseState in this test, so it shouldn't become frozen unless cloned
    });
  });
});
