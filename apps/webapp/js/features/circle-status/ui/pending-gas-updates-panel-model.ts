import type { EventDayRef, GasOutboxEntry } from "../../event-day/public-api";

export interface PendingGasUpdatesPanelItem {
  readonly id: string;
  readonly space: string;
  readonly actionLabel: string;
  readonly createdAt: string;
  readonly attempts: number;
  readonly lastError: string | null;
}

export interface PendingGasUpdatesPanelViewModel {
  readonly ref: EventDayRef;
  readonly totalCount: number;
  readonly items: readonly PendingGasUpdatesPanelItem[];
}

export function buildPendingGasUpdatesPanelViewModel(
  ref: EventDayRef,
  outbox: readonly GasOutboxEntry[],
): PendingGasUpdatesPanelViewModel {
  const items: PendingGasUpdatesPanelItem[] = outbox.map((entry) => ({
    id: entry.id,
    space: entry.space,
    actionLabel: entry.purchased ? "購入" : "未購入",
    createdAt: entry.createdAt,
    attempts: entry.attempts,
    lastError: entry.lastError,
  }));

  return {
    ref: Object.freeze({ eventId: ref.eventId, dayId: ref.dayId }),
    totalCount: items.length,
    items: Object.freeze(items),
  };
}
