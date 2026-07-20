import assert from "node:assert/strict";
import { test } from "vitest";
import { DataManager } from "../apps/webapp/js/data-manager.js";
import { SyncQueue } from "../apps/webapp/js/state/sync-queue.js";

function createQueue() {
  let saved: unknown = [];
  const storage = {
    getJson: () => saved,
    setJson: (_key: string, value: unknown) => {
      saved = value;
    },
  };
  return new SyncQueue(storage, "queue");
}

test("sync queue reports success after every payload is sent", async () => {
  const queue = createQueue();
  queue.enqueue({ action: "sale", space: "東A1a", sheetName: "day1" });

  const result = await queue.process({
    getUrl: () => "https://example.test/gas",
    send: async () => undefined,
  });

  assert.equal(result.synced, true);
  assert.equal(result.pending, 0);
});

test("sync queue keeps failed payloads and reports a diagnostic error", async () => {
  const queue = createQueue();
  queue.enqueue({ action: "sale", space: "東A1a", sheetName: "day1" });
  const failure = new Error("network down");

  const result = await queue.process({
    getUrl: () => "https://example.test/gas",
    send: async () => {
      throw failure;
    },
  });

  assert.equal(result.synced, false);
  assert.equal(result.pending, 1);
  assert.equal(result.error, failure);
});

test("data manager sends a sale update to the circle source sheet", async () => {
  const manager = new DataManager();
  let queuedPayload: Record<string, unknown> | null = null;
  manager.addToQueue = (payload: Record<string, unknown>) => {
    queuedPayload = payload;
  };
  manager.processQueue = async () => ({
    synced: true,
    pending: 0,
    error: null,
  });

  const result = await manager.syncUpdate("東A1a", false, false, "day1");

  assert.deepEqual(queuedPayload, {
    action: "sale",
    space: "東A1a",
    undo: false,
    sheetName: "day1",
  });
  assert.equal(result.synced, true);
});

test("purchase history preserves the source sheet for undo and redo", () => {
  const manager = new DataManager();
  manager.purchasedList = [];
  manager.actionHistory = [];
  manager.redoStack = [];

  manager.addPurchased("東A1a", "day1");
  const undone = manager.undoLastAction();
  const redone = manager.redoAction();

  assert.equal(undone.sheetName, "day1");
  assert.equal(redone.sheetName, "day1");
});
