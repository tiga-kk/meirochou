import type { EventDayRef, SourceRef } from "./event-day-types";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function parseIdentifier(value: string, name: string): string {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${name}: invalid identifier`);
  }
  return value;
}

export function parseEventId(value: unknown): string {
  if (typeof value !== "string") throw new Error("eventId: expected string");
  return parseIdentifier(value, "eventId");
}

export function parseDayId(value: unknown): string {
  if (typeof value !== "string") throw new Error("dayId: expected string");
  return parseIdentifier(value, "dayId");
}

export function parseSourceGeneration(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("sourceGeneration: expected string");
  }
  return parseIdentifier(value, "sourceGeneration");
}

/**
 * Builds a stable key for identifying a specific event and day combination.
 * Format: "eventId/dayId"
 */
export function buildEventDayKey(ref: EventDayRef): string {
  const eventId = parseEventId(ref.eventId);
  const dayId = parseDayId(ref.dayId);
  return `${eventId}/${dayId}`;
}

/**
 * Builds a stable namespace for a specific event, day, and source generation combination.
 * Format: "comipath:v1:eventId:dayId:sourceGeneration"
 */
export function buildSourceNamespace(ref: SourceRef): string {
  const eventId = parseEventId(ref.eventId);
  const dayId = parseDayId(ref.dayId);
  const sourceGen = parseSourceGeneration(ref.sourceGeneration);
  return `comipath:v1:${eventId}:${dayId}:${sourceGen}`;
}
