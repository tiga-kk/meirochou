import assert from "node:assert/strict";
import { test } from "vitest";
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
