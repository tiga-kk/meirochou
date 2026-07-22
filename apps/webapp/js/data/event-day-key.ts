import {
  parseDayId,
  parseEventId,
  parseSourceGeneration,
} from "../types/boundary-parsers";
import type { EventDayRef, SourceRef } from "../types/domain";

export { parseDayId, parseEventId, parseSourceGeneration };

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
