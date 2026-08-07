export type {
  ChangeCircleStatusInput,
  ChangeCircleStatusResult,
  CircleStatus,
  CircleStatusUndoToken,
} from "./domain/circle-status-types";

import type { EventDayRef } from "../event-day/public-api";
import type {
  ChangeCircleStatusResult,
  CircleStatus,
} from "./domain/circle-status-types";

export {
  buildPendingGasUpdatesPanelViewModel,
  type PendingGasUpdatesPanelItem,
  type PendingGasUpdatesPanelViewModel,
} from "./ui/pending-gas-updates-panel-model";
export type { PendingGasUpdateBackgroundProcess } from "./use-cases/pending-gas-update-background-process";
export type { PendingGasUpdateDelivery } from "./use-cases/pending-gas-update-delivery";
export { DomCircleGalleryView } from "./ui/dom-circle-gallery-view";
export { DomCircleProgressView } from "./ui/dom-circle-progress-view";

export interface CircleStatusControllerPort {
  changeStatus(params: {
    readonly eventDay: { readonly eventId: string; readonly dayId: string };
    readonly circleSpace: string;
    readonly nextStatus: CircleStatus;
    readonly expectedSourceGeneration: string;
  }): ChangeCircleStatusResult;
  undo(): boolean;
}

export interface PendingGasUpdatesControllerPort {
  retryAll(eventDay?: EventDayRef): Promise<number>;
  discardAll(eventDay: EventDayRef): void;
  discardOne(eventDay: EventDayRef, updateId: string): void;
}
