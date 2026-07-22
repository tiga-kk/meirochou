import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { loadEventRegistry } from "../apps/webapp/js/data/event-registry";
import { parseEventRegistry } from "../apps/webapp/js/types/boundary-parsers";

const validRegistry = {
  schemaVersion: 1,
  events: [
    {
      eventId: "demo-v1",
      displayName: "ComiPath Demo",
      mapBundle: "../maps/demo-v1/manifest.json",
      days: [{ dayId: "day1", displayName: "デモ1日目" }],
    },
  ],
};

test("parseEventRegistry accepts a valid registry and freezes the output", () => {
  const result = parseEventRegistry(validRegistry);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.events[0].eventId, "demo-v1");
  assert.equal(result.events[0].days[0].dayId, "day1");

  // Immutability checks
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.events), true);
  assert.equal(Object.isFrozen(result.events[0]), true);
  assert.equal(Object.isFrozen(result.events[0].days), true);
  assert.equal(Object.isFrozen(result.events[0].days[0]), true);
});

test("parseEventRegistry rejects invalid schemaVersion", () => {
  assert.throws(
    () => parseEventRegistry({ ...validRegistry, schemaVersion: 2 }),
    /schemaVersion/,
  );
});

test("parseEventRegistry rejects duplicate event IDs", () => {
  const duplicateEvents = {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "Demo 1",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [{ dayId: "day1", displayName: "Day 1" }],
      },
      {
        eventId: "demo-v1",
        displayName: "Demo 2",
        mapBundle: "../maps/demo-v2/manifest.json",
        days: [{ dayId: "day1", displayName: "Day 1" }],
      },
    ],
  };

  assert.throws(() => parseEventRegistry(duplicateEvents), /eventId/i);
});

test("parseEventRegistry rejects duplicate day IDs within an event", () => {
  const duplicateDays = {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "Demo 1",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [
          { dayId: "day1", displayName: "Day 1" },
          { dayId: "day1", displayName: "Day 1 again" },
        ],
      },
    ],
  };

  assert.throws(() => parseEventRegistry(duplicateDays), /dayId/i);
});

test("parseEventRegistry rejects unsafe mapBundle paths", () => {
  const unsafePaths = [
    "/absolute/path/manifest.json",
    "http://example.com/manifest.json",
    "../maps/demo-v1/../../manifest.json",
    "../../outside/manifest.json",
    "../maps/demo-v1/manifest.json?query=1",
    "../maps/demo-v1/manifest.json#hash",
    "../maps\\demo-v1\\manifest.json",
    "",
  ];

  for (const path of unsafePaths) {
    const registry = {
      schemaVersion: 1,
      events: [
        {
          eventId: "demo-v1",
          displayName: "Demo 1",
          mapBundle: path,
          days: [{ dayId: "day1", displayName: "Day 1" }],
        },
      ],
    };

    assert.throws(
      () => parseEventRegistry(registry),
      /mapBundle/i,
      `Should reject unsafe mapBundle path: ${path}`,
    );
  }
});

test("loadEventRegistry fetches manifest.json and parses it", async () => {
  const mockRegistry = {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "ComiPath Demo",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [{ dayId: "day1", displayName: "デモ1日目" }],
      },
    ],
  };

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockRegistry,
  });
  vi.stubGlobal("fetch", fetchMock);

  const result = await loadEventRegistry("http://example.test/");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.events[0].eventId, "demo-v1");
  assert.equal(
    fetchMock.mock.calls[0][0],
    "http://example.test/assets/events/manifest.json",
  );

  vi.unstubAllGlobals();
});

test("loadEventRegistry throws on fetch error", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    statusText: "Not Found",
  });
  vi.stubGlobal("fetch", fetchMock);

  await assert.rejects(
    () => loadEventRegistry("http://example.test/"),
    /Failed to load event registry/,
  );

  vi.unstubAllGlobals();
});
