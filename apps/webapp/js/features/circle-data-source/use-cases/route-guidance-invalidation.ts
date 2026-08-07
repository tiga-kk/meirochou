import type { EventDayRef } from "../../event-day/public-api";

/**
 * Capability interface for invalidating route guidance after a durable
 * circle data source replacement. Implemented by Route Guidance infrastructure;
 * Circle Data Source depends on this interface, not on Route Guidance internals.
 */
export interface RouteGuidanceInvalidation {
  invalidateAfterCircleSourceChange(
    eventDay: EventDayRef,
  ): Promise<void> | void;
}
