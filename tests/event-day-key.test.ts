import { assert, test } from "vitest";
import {
  buildEventDayKey,
  buildSourceNamespace,
  parseDayId,
  parseEventId,
  parseSourceGeneration,
} from "../apps/webapp/js/data/event-day-key";

test("event/day/source keys are stable and cannot collide", () => {
  assert.equal(
    buildEventDayKey({ eventId: "C109", dayId: "day1" }),
    "C109/day1",
  );
  assert.equal(
    buildSourceNamespace({
      eventId: "C109",
      dayId: "day1",
      sourceGeneration: "g-001",
    }),
    "comipath:v1:C109:day1:g-001",
  );
});

test("identifiers reject separators and empty text", () => {
  for (const value of ["", "../C109", "C109:day1", " day1 "]) {
    assert.throws(() => parseEventId(value));
    assert.throws(() => parseDayId(value));
  }
});

test("identifiers reject invalid characters and lengths", () => {
  // Must start with alphanumeric
  assert.throws(() => parseEventId("-C109"));
  assert.throws(() => parseEventId("_C109"));

  // Length limit (64 characters is valid, 65 is invalid)
  const len64 = "A".repeat(64);
  const len65 = "A".repeat(65);

  assert.equal(parseEventId(len64), len64);
  assert.throws(() => parseEventId(len65));

  assert.equal(parseDayId(len64), len64);
  assert.throws(() => parseDayId(len65));
});

test("identifiers accept valid characters", () => {
  const valid = "C109_day-1";
  assert.equal(parseEventId(valid), valid);
  assert.equal(parseDayId(valid), valid);
});

test("sourceGeneration rejects invalid inputs", () => {
  // Invalid types and empty
  assert.throws(() => parseSourceGeneration(undefined));
  assert.throws(() => parseSourceGeneration(null));
  assert.throws(() => parseSourceGeneration(123));
  assert.throws(() => parseSourceGeneration(""));

  // Invalid characters (colons, slashes, spaces)
  assert.throws(() => parseSourceGeneration("g:001"));
  assert.throws(() => parseSourceGeneration("g/001"));
  assert.throws(() => parseSourceGeneration(" g-001 "));
  assert.throws(() => parseSourceGeneration("-g-001")); // must start with alphanumeric

  // Length limit (64 characters is valid, 65 is invalid)
  const len64 = "A".repeat(64);
  const len65 = "A".repeat(65);
  assert.equal(parseSourceGeneration(len64), len64);
  assert.throws(() => parseSourceGeneration(len65));
});

test("buildSourceNamespace throws on invalid sourceGeneration", () => {
  assert.throws(() =>
    buildSourceNamespace({
      eventId: "C109",
      dayId: "day1",
      sourceGeneration: "g:001", // colon is invalid
    }),
  );
  assert.throws(() =>
    buildSourceNamespace({
      eventId: "C109",
      dayId: "day1",
      sourceGeneration: "g/001", // slash is invalid
    }),
  );
  assert.throws(() =>
    buildSourceNamespace({
      eventId: "C109",
      dayId: "day1",
      sourceGeneration: "", // empty is invalid
    }),
  );
});
